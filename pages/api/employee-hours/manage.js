import { authorizeAdminOnly } from "@/lib/adminAuth";
import {
  buildHoursPayload,
  deleteEmployeeAccount,
  deleteEmployeeHoursDay,
  getEmployeeHoursData,
  jerusalemMonthKey,
  publicEmployeeProfile,
  setEmployeeHourlyRate,
  setEmployeePaidTotal,
} from "@/lib/employeeHoursStore";

function adminPayload(data) {
  const payload = buildHoursPayload(data, null, jerusalemMonthKey());
  return {
    ...payload,
    employees: data.employees.map((e) =>
      publicEmployeeProfile(e, data.entries, payload.monthKey)
    ),
  };
}

export default async function handler(req, res) {
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

  if (req.method === "DELETE") {
    const employeeId = String(
      req.body?.employeeId || req.query?.employeeId || ""
    ).trim();
    const dayKey = String(req.body?.dayKey || req.query?.dayKey || "").trim();
    const result = dayKey
      ? await deleteEmployeeHoursDay(employeeId, dayKey)
      : await deleteEmployeeAccount(employeeId);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    return res.status(200).json(adminPayload(result.data));
  }

  if (req.method === "PUT") {
    const action = String(req.body?.action || "").trim();
    const employeeId = String(req.body?.employeeId || "").trim();

    if (action === "set_rate") {
      const result = await setEmployeeHourlyRate(employeeId, req.body?.rateIls);
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return res.status(status).json({ ok: false, error: result.error });
      }
      return res.status(200).json(adminPayload(result.data));
    }

    if (action === "set_paid") {
      const result = await setEmployeePaidTotal(
        employeeId,
        req.body?.paidTotalIls
      );
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return res.status(status).json({ ok: false, error: result.error });
      }
      return res.status(200).json(adminPayload(result.data));
    }

    return res.status(400).json({ ok: false, error: "invalid_action" });
  }

  if (req.method === "GET") {
    const data = await getEmployeeHoursData();
    return res.status(200).json(adminPayload(data));
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
