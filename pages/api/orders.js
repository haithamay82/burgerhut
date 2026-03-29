import { appendOrder, deleteOrderById, listOrders } from "@/lib/ordersStore";
import { getUnavailableIds } from "@/lib/inventoryStore";
import { MAIN_MENU_PRODUCT_IDS } from "@/utils/menuData";
import { isOrderingAllowedAt } from "@/utils/orderingHours";
import { getBusinessHours } from "@/lib/businessHoursStore";

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
    const { customer, items, payment, total, channel, meta } = req.body || {};

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
    for (const line of items) {
      const pid = lineProductId(line);
      if (MAIN_MENU_PRODUCT_IDS.has(pid) && unavailable.has(pid)) {
        return res.status(400).json({ ok: false, error: "item_unavailable" });
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
