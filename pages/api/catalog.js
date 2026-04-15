import { getCatalogEditor, setCatalogEditor } from "@/lib/catalogStore";
import { MENU_ITEMS } from "@/utils/menuData";
import {
  emptyCatalogEditor,
  mergeMenuItemsFromEditor,
} from "@/utils/mergeMenuCatalog";

const ALLOWED_CATEGORIES = new Set([
  "burgers",
  "specials",
  "crispy",
  "sides",
  "drinks",
]);
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

const BASE_IDS = new Set(MENU_ITEMS.map((r) => r.id));

function normalizeCatalogEditor(body) {
  const out = emptyCatalogEditor();
  if (!body || typeof body !== "object") return out;

  const hid = Array.isArray(body.hiddenIds) ? body.hiddenIds : [];
  out.hiddenIds = [...new Set(hid.map((x) => String(x || "").trim()).filter(Boolean))].filter(
    (id) => BASE_IDS.has(id)
  );

  const ov = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
  /** @type {Record<string, object>} */
  const overrides = {};
  for (const id of Object.keys(ov)) {
    if (!BASE_IDS.has(id)) continue;
    const p = ov[id];
    if (!p || typeof p !== "object") continue;
    const patch = {};
    if (p.basePrice !== undefined) {
      const n = Number(p.basePrice);
      if (Number.isFinite(n) && n >= 0) patch.basePrice = n;
    }
    if (typeof p.category === "string" && ALLOWED_CATEGORIES.has(p.category)) {
      patch.category = p.category;
    }
    if (typeof p.image === "string" && p.image.trim()) patch.image = p.image.trim();
    if (typeof p.nameHe === "string") patch.nameHe = p.nameHe.trim();
    if (typeof p.nameAr === "string") patch.nameAr = p.nameAr.trim();
    if (typeof p.descHe === "string") patch.descHe = p.descHe.trim();
    if (typeof p.descAr === "string") patch.descAr = p.descAr.trim();
    if (Object.keys(patch).length) overrides[id] = patch;
  }
  out.overrides = overrides;

  const custom = Array.isArray(body.customItems) ? body.customItems : [];
  const customItems = [];
  const seen = new Set();
  for (const c of custom) {
    if (!c || typeof c !== "object") continue;
    const id = String(c.id || "").trim();
    if (!ID_RE.test(id) || BASE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    const cat = String(c.category || "");
    if (!ALLOWED_CATEGORIES.has(cat)) continue;
    const nameHe = String(c.nameHe || "").trim();
    const nameAr = String(c.nameAr || "").trim();
    if (!nameHe || !nameAr) continue;
    const image = String(c.image || "").trim();
    if (!image) continue;
    const basePrice = Number(c.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) continue;
    const row = { id, category: cat, basePrice, image, nameHe, nameAr };
    const descHe = String(c.descHe || "").trim();
    const descAr = String(c.descAr || "").trim();
    if (descHe) row.descHe = descHe;
    if (descAr) row.descAr = descAr;
    customItems.push(row);
  }
  out.customItems = customItems;
  return out;
}

export default async function handler(req, res) {
  const editor = await getCatalogEditor();
  const items = mergeMenuItemsFromEditor(editor);

  if (req.method === "GET") {
    const header = req.headers["x-admin-secret"];
    if (header != null && String(header).trim()) {
      const auth = authorize(req);
      if (!auth.ok) {
        if (auth.reason === "not_configured") {
          return res.status(503).json({ ok: false, error: "admin_not_configured" });
        }
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }
      return res.status(200).json({
        ok: true,
        items,
        editor,
      });
    }
    return res.status(200).json({ ok: true, items });
  }

  if (req.method === "PUT") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const next = normalizeCatalogEditor(req.body || {});
    await setCatalogEditor(next);
    const merged = mergeMenuItemsFromEditor(next);
    return res.status(200).json({ ok: true, items: merged, editor: next });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
