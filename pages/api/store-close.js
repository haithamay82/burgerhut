import { authorizeAdminOnly } from "@/lib/adminAuth";
import { getBusinessHours } from "@/lib/businessHoursStore";
import {
  isManualStoreClosedNow,
  setManualStoreClose,
} from "@/lib/storeCloseStore";
import {
  isRestaurantOpenAt,
  jerusalemBusinessShiftDayKey,
} from "@/utils/orderingHours";

export default async function handler(req, res) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

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

  const days = await getBusinessHours();
  const now = new Date();
  if (!isRestaurantOpenAt(now, days)) {
    return res.status(400).json({ ok: false, error: "outside_hours" });
  }

  const closed = Boolean(req.body?.closed);
  await setManualStoreClose(
    closed ? jerusalemBusinessShiftDayKey(now, days) : null
  );
  const manualClosed = await isManualStoreClosedNow(days, now);
  return res.status(200).json({
    ok: true,
    manualClosed,
    inBusinessHours: true,
  });
}
