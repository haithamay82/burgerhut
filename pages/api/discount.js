import {
  getDiscountConfig,
  parseAndValidateDiscount,
  setDiscountConfig,
} from "@/lib/discountStore";

function authorize(req) {
  const secret = process.env.ADMIN_ORDERS_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };
  const header = req.headers["x-admin-secret"];
  if (!header || header !== secret) return { ok: false, reason: "unauthorized" };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const cfg = await getDiscountConfig();
    return res.status(200).json({ ok: true, ...cfg });
  }

  if (req.method === "PUT") {
    const auth = authorize(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const parsed = parseAndValidateDiscount(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const saved = await setDiscountConfig(parsed.value);
    return res.status(200).json({ ok: true, ...saved });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
