import { authorizeAdminOnly } from "@/lib/adminAuth";
import {
  getDeliveryVillageFees,
  parseAndValidateDeliveryFees,
  setDeliveryVillageFees,
  villagesWithFees,
} from "@/lib/deliveryFeesStore";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const fees = await getDeliveryVillageFees();
    return res.status(200).json({
      ok: true,
      fees,
      villages: villagesWithFees(fees),
    });
  }

  if (req.method === "PUT") {
    const auth = authorizeAdminOnly(req);
    if (!auth.ok) {
      if (auth.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "admin_not_configured" });
      }
      if (auth.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const parsed = parseAndValidateDeliveryFees(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const fees = await setDeliveryVillageFees(parsed.fees);
    return res.status(200).json({
      ok: true,
      fees,
      villages: villagesWithFees(fees),
    });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
