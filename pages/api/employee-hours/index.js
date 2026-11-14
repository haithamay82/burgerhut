import { authorizeAdminOnly } from "@/lib/adminAuth";
import { broadcastEmployeeHoursToAdmins } from "@/lib/adminPushNotify";
import {
  addEmployeeHoursEntry,
  authorizeEmployeeHours,
  buildHoursPayload,
  getEmployeeHoursData,
  jerusalemMonthKey,
  publicEmployeeProfile,
  updateEmployeeHoursEntry,
} from "@/lib/employeeHoursStore";

async function authorizeEmployeeOrAdmin(req) {
  const emp = await authorizeEmployeeHours(
    req.headers["x-employee-hours-secret"]
  );
  if (emp.ok) {
    return { ok: true, role: "employee_hours", employee: emp.employee };
  }
  const admin = authorizeAdminOnly(req);
  if (admin.ok) return { ok: true, role: "admin", employee: null };
  if (admin.reason === "forbidden") {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: false, reason: "unauthorized" };
}

function monthFromQuery(req) {
  const monthKey =
    typeof req.query?.month === "string" ? req.query.month.trim() : "";
  return /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : undefined;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = await authorizeEmployeeOrAdmin(req);
    if (!auth.ok) {
      if (auth.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const monthKey = monthFromQuery(req);
    const data = await getEmployeeHoursData();
    const employeeId = auth.role === "employee_hours" ? auth.employee.id : null;
    const payload = buildHoursPayload(data, employeeId, monthKey);

    if (auth.role === "employee_hours") {
      const emp = data.employees.find((e) => e.id === auth.employee.id);
      return res.status(200).json({
        ...payload,
        employee: emp
          ? publicEmployeeProfile(emp, data.entries, payload.monthKey)
          : { id: auth.employee.id, name: auth.employee.name },
      });
    }

    return res.status(200).json({
      ...payload,
      employees: data.employees.map((e) =>
        publicEmployeeProfile(e, data.entries, payload.monthKey)
      ),
    });
  }

  if (req.method === "POST") {
    const emp = await authorizeEmployeeHours(
      req.headers["x-employee-hours-secret"]
    );
    if (!emp.ok) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const result = await addEmployeeHoursEntry({
      employeeId: emp.employee.id,
      employeeName: emp.employee.name,
      dayKey: req.body?.dayKey,
      start: req.body?.start,
      end: req.body?.end,
    });
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    const data = result.data;
    const payload = buildHoursPayload(data, emp.employee.id, jerusalemMonthKey());
    const full = data.employees.find((e) => e.id === emp.employee.id);
    try {
      await broadcastEmployeeHoursToAdmins({
        employeeName: emp.employee.name,
        employeeId: emp.employee.id,
        start: result.entry.start,
        end: result.entry.end,
        dayKey: result.entry.dayKey,
        isUpdate: false,
      });
    } catch (e) {
      console.warn(
        "[adminPush] employee hours create notify failed",
        e?.message || e
      );
    }
    return res.status(200).json({
      ...payload,
      entry: payload.entries.find(
        (e) => e.dayKey === result.entry.dayKey && e.employeeId === emp.employee.id
      ),
      employee: full
        ? publicEmployeeProfile(full, data.entries, payload.monthKey)
        : emp.employee,
    });
  }

  if (req.method === "PUT") {
    const auth = await authorizeEmployeeOrAdmin(req);
    if (!auth.ok) {
      if (auth.reason === "forbidden") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const employeeId =
      auth.role === "admin"
        ? String(req.body?.employeeId || "").trim()
        : auth.employee.id;
    if (!employeeId) {
      return res.status(400).json({ ok: false, error: "missing_employee" });
    }

    const result = await updateEmployeeHoursEntry(
      {
        employeeId,
        dayKey: req.body?.dayKey,
        start: req.body?.start,
        end: req.body?.end,
      },
      { asAdmin: auth.role === "admin" }
    );
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    const data = result.data;
    const scopedId = auth.role === "employee_hours" ? employeeId : null;
    const payload = buildHoursPayload(data, scopedId, jerusalemMonthKey());
    const response = {
      ...payload,
      entry: payload.entries.find(
        (e) =>
          e.dayKey === result.entry.dayKey && e.employeeId === employeeId
      ),
    };
    if (auth.role === "admin") {
      response.employees = data.employees.map((e) =>
        publicEmployeeProfile(e, data.entries, payload.monthKey)
      );
    } else {
      const full = data.employees.find((e) => e.id === employeeId);
      response.employee = full
        ? publicEmployeeProfile(full, data.entries, payload.monthKey)
        : auth.employee;
      try {
        await broadcastEmployeeHoursToAdmins({
          employeeName: auth.employee.name,
          employeeId,
          start: result.entry.start,
          end: result.entry.end,
          dayKey: result.entry.dayKey,
          isUpdate: true,
        });
      } catch (e) {
        console.warn(
          "[adminPush] employee hours update notify failed",
          e?.message || e
        );
      }
    }
    return res.status(200).json(response);
  }

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
