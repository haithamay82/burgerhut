import {
  getInventoryPayload,
  getUnavailableIds,
  normalizePattyStock,
  setInventoryPayload,
} from "@/lib/inventoryStore";
import { getManagedInventoryProductIds } from "@/lib/inventoryManagedIds";
import { authorizeAdminOrEmployee } from "@/lib/adminAuth";

async function filterManaged(ids) {
  const allowed = await getManagedInventoryProductIds();
  return [...new Set(ids)].filter((id) => allowed.has(id));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = authorizeAdminOrEmployee(req);
    const payload = await getInventoryPayload();
    const effective = await getUnavailableIds();
    const base = {
      ok: true,
      unavailableIds: effective,
      pattyStock: payload.pattyStock,
    };
    if (auth.ok) {
      base.manualUnavailableIds = payload.unavailableIds;
    }
    return res.status(200).json(base);
  }

  if (req.method === "PUT") {
    const auth = authorizeAdminOrEmployee(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({
          ok: false,
          error: "admin_not_configured",
        });
      }
      if (auth.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const body = req.body || {};
    const cur = await getInventoryPayload();

    let nextUnavailable = cur.unavailableIds;
    if (Array.isArray(body.unavailableIds)) {
      nextUnavailable = await filterManaged(body.unavailableIds);
    }

    let nextPatty = cur.pattyStock;
    if (Object.prototype.hasOwnProperty.call(body, "pattyStock")) {
      if (body.pattyStock === null || body.pattyStock === undefined) {
        nextPatty = null;
      } else if (typeof body.pattyStock === "object") {
        nextPatty = normalizePattyStock(body.pattyStock);
      }
    }

    await setInventoryPayload({
      unavailableIds: nextUnavailable,
      pattyStock: nextPatty,
    });

    const payload = await getInventoryPayload();
    const effective = await getUnavailableIds();
    return res.status(200).json({
      ok: true,
      unavailableIds: effective,
      manualUnavailableIds: payload.unavailableIds,
      pattyStock: payload.pattyStock,
    });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
