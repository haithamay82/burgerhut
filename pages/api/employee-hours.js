import {
  authorizeAdminOnly,
  jerusalemDayKeyFromDate,
} from "@/lib/adminAuth";
import {
  addEmployeeHoursEntry,
  authorizeEmployeeHours,
  getEmployeeHoursStore,
  jerusalemMonthKey,
  sumMinutesForMonth,
} from "@/lib/employeeHoursStore";

function buildResponse(entries, monthKey) {
  const month = monthKey || jerusalemMonthKey();
  return {
    ok: true,
    todayKey: jerusalemDayKeyFromDate(),
    monthKey: month,
    monthMinutes: sumMinutesForMonth(entries, month),
    entries,
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const emp = authorizeEmployeeHours(req.headers["x-employee-hours-secret"]);
    const admin = authorizeAdminOnly(req);
    if (!emp.ok && !admin.ok) {
      if (emp.reason === "not_configured" && admin.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "not_configured" });
      }
      if (admin.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const monthKey =
      typeof req.query?.month === "string" ? req.query.month.trim() : "";
    const store = await getEmployeeHoursStore();
    return res
      .status(200)
      .json(buildResponse(store.entries, /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : undefined));
  }

  if (req.method === "POST") {
    const emp = authorizeEmployeeHours(req.headers["x-employee-hours-secret"]);
    if (!emp.ok) {
      if (emp.reason === "not_configured") {
        return res.status(503).json({ ok: false, error: "not_configured" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const result = await addEmployeeHoursEntry({
      dayKey: req.body?.dayKey,
      start: req.body?.start,
      end: req.body?.end,
    });
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    const monthKey = jerusalemMonthKey();
    return res.status(200).json({
      ...buildResponse(result.entries, monthKey),
      entry: result.entry,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
