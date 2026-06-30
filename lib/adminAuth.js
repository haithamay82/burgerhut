/** @typedef {"admin" | "employee"} AdminRole */

export function getAdminSecret() {
  return String(process.env.ADMIN_ORDERS_SECRET || "").trim();
}

export function getEmployeeSecret() {
  return String(process.env.ADMIN_EMPLOYEE_SECRET || "123abc").trim();
}

/**
 * @param {string | string[] | undefined} headerRaw
 * @returns {{ ok: true, role: AdminRole } | { ok: false, reason: string, role: null }}
 */
export function resolveAdminAuth(headerRaw) {
  const header = String(
    Array.isArray(headerRaw) ? headerRaw[0] : headerRaw || ""
  ).trim();
  const adminSecret = getAdminSecret();
  const employeeSecret = getEmployeeSecret();

  if (adminSecret && header === adminSecret) {
    return { ok: true, role: "admin" };
  }
  if (employeeSecret && header === employeeSecret) {
    return { ok: true, role: "employee" };
  }
  if (!adminSecret && !employeeSecret) {
    return { ok: false, reason: "not_configured", role: null };
  }
  return { ok: false, reason: "unauthorized", role: null };
}

/**
 * @param {import("next").NextApiRequest} req
 */
export function authorizeAdminOrEmployee(req) {
  return resolveAdminAuth(req.headers["x-admin-secret"]);
}

/**
 * @param {import("next").NextApiRequest} req
 */
export function authorizeAdminOnly(req) {
  const auth = resolveAdminAuth(req.headers["x-admin-secret"]);
  if (!auth.ok) return auth;
  if (auth.role !== "admin") {
    return { ok: false, reason: "forbidden", role: auth.role };
  }
  return auth;
}

/** @param {Date} [date] */
export function jerusalemDayKeyFromDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** @param {unknown} order */
export function isOrderTodayJerusalem(order) {
  if (!order || typeof order !== "object") return false;
  const createdAt = order.createdAt;
  if (!createdAt) return false;
  const key = new Date(String(createdAt)).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
  return key === jerusalemDayKeyFromDate();
}

/** @param {unknown[]} orders */
export function filterOrdersToTodayJerusalem(orders) {
  const today = jerusalemDayKeyFromDate();
  return (Array.isArray(orders) ? orders : []).filter((o) => {
    const createdAt = o?.createdAt;
    if (!createdAt) return false;
    const key = new Date(String(createdAt)).toLocaleDateString("en-CA", {
      timeZone: "Asia/Jerusalem",
    });
    return key === today;
  });
}
