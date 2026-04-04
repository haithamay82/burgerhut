import { getUnavailableIds, setUnavailableIds } from "@/lib/inventoryStore";
import { getCatalogEditor } from "@/lib/catalogStore";
import { BURGER_TOPPING_IDS } from "@/utils/menuData";
import { managedMenuProductIdsFromEditor } from "@/utils/mergeMenuCatalog";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

async function allowedInventoryIds() {
  const editor = await getCatalogEditor();
  const allowed = managedMenuProductIdsFromEditor(editor);
  for (const tid of BURGER_TOPPING_IDS) {
    allowed.add(tid);
  }
  return allowed;
}

async function filterManaged(ids) {
  const allowed = await allowedInventoryIds();
  return [...new Set(ids)].filter((id) => allowed.has(id));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const unavailableIds = await getUnavailableIds();
    return res.status(200).json({ ok: true, unavailableIds });
  }

  if (req.method === "PUT") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({
          ok: false,
          error: "admin_not_configured",
        });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const body = req.body || {};
    const raw = body.unavailableIds;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ ok: false, error: "invalid_body" });
    }
    const filtered = await filterManaged(raw);
    await setUnavailableIds(filtered);
    return res.status(200).json({ ok: true, unavailableIds: filtered });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
