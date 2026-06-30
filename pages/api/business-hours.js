import {
  getBusinessHours,
  parseAndValidateDays,
  setBusinessHours,
} from "@/lib/businessHoursStore";
import { authorizeAdminOrEmployee } from "@/lib/adminAuth";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const days = await getBusinessHours();
    return res.status(200).json({ ok: true, days });
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
    const parsed = parseAndValidateDays(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }
    const persisted = await setBusinessHours(parsed.days);
    if (!persisted) {
      return res.status(503).json({
        ok: false,
        error: "storage_failed",
      });
    }
    return res.status(200).json({ ok: true, days: parsed.days });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
