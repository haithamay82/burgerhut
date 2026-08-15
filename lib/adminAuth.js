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

export function shiftJerusalemDayKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return dayKey;
  const utc = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0)));
  return utc.toISOString().slice(0, 10);
}

export function jerusalemYesterdayDayKey(date = new Date()) {
  return shiftJerusalemDayKey(jerusalemDayKeyFromDate(date), -1);
}

export function employeeVisibleJerusalemDayKeys(date = new Date()) {
  const today = jerusalemDayKeyFromDate(date);
  return [today, shiftJerusalemDayKey(today, -1)];
}

function orderJerusalemDayKey(order) {
  const createdAt = order?.createdAt;
  if (!createdAt) return null;
  return new Date(String(createdAt)).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
}

/** @param {unknown} order */
export function isOrderTodayJerusalem(order) {
  if (!order || typeof order !== "object") return false;
  return orderJerusalemDayKey(order) === jerusalemDayKeyFromDate();
}

export function isOrderInEmployeeWindowJerusalem(order, date = new Date()) {
  if (!order || typeof order !== "object") return false;
  const key = orderJerusalemDayKey(order);
  return Boolean(key) && employeeVisibleJerusalemDayKeys(date).includes(key);
}

/** @param {unknown[]} orders */
export function filterOrdersToTodayJerusalem(orders) {
  const today = jerusalemDayKeyFromDate();
  return (Array.isArray(orders) ? orders : []).filter(
    (o) => orderJerusalemDayKey(o) === today
  );
}

export function filterOrdersForEmployeeJerusalem(orders, date = new Date()) {
  const allowed = new Set(employeeVisibleJerusalemDayKeys(date));
  return (Array.isArray(orders) ? orders : []).filter((o) =>
    allowed.has(orderJerusalemDayKey(o))
  );
}
