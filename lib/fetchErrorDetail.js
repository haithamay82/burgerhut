/**
 * Node/undici sometimes surface only "fetch failed" — the real reason is usually in error.cause.
 * @param {unknown} err
 * @returns {string}
 */
export function formatFetchErrorDetail(err) {
  if (err == null) return "unknown_error";
  const parts = [];
  const walk = (e, depth) => {
    if (!e || depth > 6) return;
    if (typeof e === "string") {
      parts.push(e);
      return;
    }
    if (typeof e !== "object") return;
    if (e instanceof AggregateError && Array.isArray(e.errors)) {
      for (const sub of e.errors) walk(sub, depth + 1);
    }
    const code = /** @type {{ code?: string }} */ (e).code;
    const syscall = /** @type {{ syscall?: string }} */ (e).syscall;
    const hostname = /** @type {{ hostname?: string }} */ (e).hostname;
    const msg = /** @type {{ message?: string }} */ (e).message;
    const name = /** @type {{ name?: string }} */ (e).name;
    if (code) parts.push(String(code));
    if (syscall) parts.push(`syscall:${syscall}`);
    if (hostname) parts.push(`host:${hostname}`);
    if (name && name !== "Error" && name !== "TypeError") parts.push(name);
    if (msg && msg !== "fetch failed") parts.push(msg);
    walk(/** @type {{ cause?: unknown }} */ (e).cause, depth + 1);
  };
  walk(err, 0);
  const uniq = [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
  if (uniq.length) return uniq.join(" | ");
  const top = /** @type {{ message?: string }} */ (err).message;
  return top || String(err);
}
