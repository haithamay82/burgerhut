import { appendOrder, deleteOrderById, listOrders } from "@/lib/ordersStore";
import {
  deductPattyStockForOrder,
  getInventoryPayload,
  getUnavailableIds,
} from "@/lib/inventoryStore";
import {
  aggregatePattyCountsFromOrderItems,
  pattyDemandFitsStock,
  collectPattyAffectedLines,
  computePattyShortfalls,
} from "@/utils/burgerPattyPrep";
import { getCatalogEditor } from "@/lib/catalogStore";
import { BURGER_TOPPING_IDS } from "@/utils/menuData";
import { mainMealProductIdsFromEditor } from "@/utils/mergeMenuCatalog";
import { isOrderingAllowedAt } from "@/utils/orderingHours";
import { getBusinessHours } from "@/lib/businessHoursStore";
import { redis, isRedisConfigured } from "@/lib/redis";

function lineProductId(line) {
  return (
    line?.productId ||
    (typeof line?.id === "string" && line.id.includes(":")
      ? line.id.split(":")[0]
      : line?.id) ||
    ""
  );
}

function sumTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, i) => {
    const q = Number(i.quantity) || 0;
    const p = Number(i.price) || 0;
    return s + p * q;
  }, 0);
}

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({
          ok: false,
          error: "admin_not_configured",
          hint: "Set ADMIN_ORDERS_SECRET in .env.local or Vercel env.",
        });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const orders = await listOrders();
    return res.status(200).json({ ok: true, orders });
  }

  if (req.method === "POST") {
    const {
      customer,
      items,
      payment,
      total,
      channel,
      meta,
      couponCode,
      deferCouponConsume,
    } = req.body || {};

    if (!customer || typeof customer !== "object") {
      return res.status(400).json({ ok: false, error: "invalid_customer" });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: "empty_cart" });
    }

    const businessDays = await getBusinessHours();
    if (!isOrderingAllowedAt(new Date(), businessDays)) {
      return res.status(403).json({ ok: false, error: "ordering_closed" });
    }

    const unavailable = new Set(await getUnavailableIds());
    const editor = await getCatalogEditor();
    const mainMealIds = mainMealProductIdsFromEditor(editor);
    for (const line of items) {
      const pid = lineProductId(line);
      if (mainMealIds.has(pid) && unavailable.has(pid)) {
        return res.status(400).json({ ok: false, error: "item_unavailable" });
      }
      const tops = line.toppings;
      if (Array.isArray(tops)) {
        for (const top of tops) {
          const tid = top?.id;
          if (
            typeof tid === "string" &&
            BURGER_TOPPING_IDS.has(tid) &&
            unavailable.has(tid)
          ) {
            return res.status(400).json({ ok: false, error: "item_unavailable" });
          }
        }
      }
    }

    const invPayload = await getInventoryPayload();
    /** @type {{ counts: Record<number, number>, qty600: number } | null} */
    let pattyPrepForDeduction = null;
    if (invPayload.pattyStock != null) {
      const prep = aggregatePattyCountsFromOrderItems(items);
      if (!pattyDemandFitsStock(prep.counts, invPayload.pattyStock)) {
        const pattyShortfalls = computePattyShortfalls(
          prep.counts,
          invPayload.pattyStock
        );
        const deficientGrams = pattyShortfalls.map((s) => s.g);
        const pattyAffectedLines = collectPattyAffectedLines(
          items,
          deficientGrams
        );
        return res.status(400).json({
          ok: false,
          error: "insufficient_patties",
          pattyShortfalls,
          pattyAffectedLines,
        });
      }
      pattyPrepForDeduction = prep;
    }

    let couponToConsume = null;
    const code = String(couponCode || "").trim().toUpperCase();
    if (code) {
      if (!isRedisConfigured() || !redis) {
        return res.status(503).json({ ok: false, error: "coupon_invalid" });
      }
      try {
        const coupon = await redis.get(`coupon:${code}`);
        if (!coupon) return res.status(400).json({ ok: false, error: "coupon_invalid" });
        if (coupon.used) return res.status(400).json({ ok: false, error: "coupon_used" });
        if (Date.now() > Number(coupon.expiresAt || 0)) {
          return res.status(400).json({ ok: false, error: "coupon_expired" });
        }
        couponToConsume = coupon;
      } catch {
        return res.status(400).json({ ok: false, error: "coupon_invalid" });
      }
    }

    const computed = sumTotal(items);
    const clientTotal = Number(total);
    const row = await appendOrder({
      customer,
      items,
      payment: payment || "cash",
      total: Number.isFinite(clientTotal) ? clientTotal : computed,
      channel: channel || "checkout",
      meta: meta || {},
    });

    if (pattyPrepForDeduction) {
      try {
        await deductPattyStockForOrder(pattyPrepForDeduction.counts);
      } catch {
        /* ההזמנה נשמרה; ניכוי נכשל — לא מחזירים שגיאה ללקוח */
      }
    }

    const shouldConsumeCouponNow =
      couponToConsume &&
      redis &&
      !Boolean(deferCouponConsume);

    if (shouldConsumeCouponNow) {
      try {
        const nextCoupon = {
          ...couponToConsume,
          used: true,
          usedAt: Date.now(),
          usedByOrderNumber: String(row.orderNumber ?? "").trim(),
        };
        await redis.set(`coupon:${String(couponToConsume.code || "").toUpperCase()}`, nextCoupon, {
          ex: 60 * 60 * 24 * 30,
        });
      } catch {
        /* ignore coupon write failure after order creation */
      }
    }

    return res.status(201).json({ ok: true, order: row });
  }

  if (req.method === "DELETE") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({
          ok: false,
          error: "admin_not_configured",
          hint: "Set ADMIN_ORDERS_SECRET in .env.local or Vercel env.",
        });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const rawId = req.query.id;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id) {
      return res.status(400).json({ ok: false, error: "missing_id" });
    }
    const result = await deleteOrderById(id);
    if (!result.ok) {
      if (result.error === "not_found") {
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      return res.status(400).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
