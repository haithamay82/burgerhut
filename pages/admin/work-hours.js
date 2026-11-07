import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useLocale } from "@/contexts/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { formatHoursMinutes } from "@/utils/employeeHours";

const SESSION_KEY = "burgerhut:employee-hours-secret";

function readSecret() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.sessionStorage.getItem(SESSION_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeSecret(v) {
  if (typeof window === "undefined") return;
  try {
    const s = String(v || "").trim();
    if (s) window.sessionStorage.setItem(SESSION_KEY, s);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function formatDayLabel(dayKey, locale) {
  const [y, m, d] = String(dayKey)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return dayKey;
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString(loc, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDuration(minutes, t) {
  const { hours, minutes: rem } = formatHoursMinutes(minutes);
  return t("workHours.duration")
    .replace("{h}", String(hours))
    .replace("{m}", String(rem));
}

export default function EmployeeWorkHoursPage() {
  const { locale, t } = useLocale();
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [entries, setEntries] = useState([]);
  const [dayKey, setDayKey] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const todayEntry = useMemo(
    () => entries.find((e) => e.dayKey === todayKey) || null,
    [entries, todayKey]
  );

  const applyPayload = useCallback((d) => {
    setTodayKey(String(d.todayKey || ""));
    setMonthKey(String(d.monthKey || ""));
    setMonthMinutes(Number(d.monthMinutes) || 0);
    setEntries(Array.isArray(d.entries) ? d.entries : []);
    const today = String(d.todayKey || "");
    setDayKey((prev) => {
      if (prev && prev <= today) return prev;
      return today;
    });
  }, []);

  const loadData = useCallback(
    async (sec) => {
      const s = String(sec || "").trim();
      if (!s) return false;
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`/api/employee-hours?_=${Date.now()}`, {
          headers: { "x-employee-hours-secret": s },
          cache: "no-store",
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setAuthed(false);
          writeSecret("");
          setError(
            d.error === "unauthorized"
              ? t("workHours.errAuth")
              : t("workHours.errLoad")
          );
          return false;
        }
        writeSecret(s);
        setSecret(s);
        setAuthed(true);
        applyPayload(d);
        return true;
      } catch {
        setError(t("workHours.errNet"));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [applyPayload, t]
  );

  useEffect(() => {
    const stored = readSecret();
    if (stored) {
      setSecret(stored);
      void loadData(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  const onLogin = async (e) => {
    e.preventDefault();
    setMsg("");
    await loadData(secret);
  };

  const logout = () => {
    writeSecret("");
    setSecret("");
    setAuthed(false);
    setEntries([]);
    setError("");
    setMsg("");
    setStart("");
    setEnd("");
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!secret.trim() || saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const r = await fetch("/api/employee-hours", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-employee-hours-secret": secret.trim(),
        },
        body: JSON.stringify({ dayKey, start, end }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const map = {
          future_day: "workHours.errFuture",
          already_exists: "workHours.errExists",
          invalid_time: "workHours.errTime",
          invalid_range: "workHours.errRange",
          invalid_day: "workHours.errDay",
        };
        setError(t(map[d.error] || "workHours.errSave"));
        return;
      }
      applyPayload(d);
      setStart("");
      setEnd("");
      setMsg(t("workHours.saved"));
    } catch {
      setError(t("workHours.errNet"));
    } finally {
      setSaving(false);
    }
  };

  const dayAlreadyLogged = Boolean(
    dayKey && entries.some((e) => e.dayKey === dayKey)
  );
  const canSubmit =
    Boolean(dayKey && start && end) &&
    !dayAlreadyLogged &&
    (!todayKey || dayKey <= todayKey);

  return (
    <>
      <Head>
        <title>{t("workHours.title")}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div className="min-h-screen bg-slate-950 text-gray-100" dir="rtl">
        <header className="border-b border-slate-800 bg-slate-900/80">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <h1 className="text-lg font-bold text-primary">
                {t("workHours.title")}
              </h1>
              <p className="text-xs text-gray-500">{t("workHours.hint")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {authed ? (
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/50"
                >
                  {t("workHours.logout")}
                </button>
              ) : null}
              <Link
                href="/admin/orders"
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t("workHours.backAdmin")}
              </Link>
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          {!authed ? (
            <form
              onSubmit={onLogin}
              className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-400">
                  {t("workHours.secretLabel")}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder={t("workHours.secretPh")}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !secret.trim()}
                className="btn-primary whitespace-nowrap px-6 text-sm disabled:opacity-50"
              >
                {loading ? t("workHours.loading") : t("workHours.login")}
              </button>
            </form>
          ) : null}

          {error ? (
            <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {msg ? (
            <p className="mb-4 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {msg}
            </p>
          ) : null}

          {authed ? (
            <>
              <section className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs text-gray-400">
                  {t("workHours.monthTotalLabel")}
                  {monthKey ? ` (${monthKey})` : ""}
                </p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatDuration(monthMinutes, t)}
                </p>
              </section>

              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h2 className="mb-3 text-sm font-bold text-gray-100">
                  {t("workHours.reportTitle")}
                </h2>
                {todayEntry ? (
                  <p className="mb-3 text-xs text-amber-200/90">
                    {t("workHours.todayAlreadyLogged")}
                  </p>
                ) : null}
                <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.dateLabel")}
                    </label>
                    <input
                      type="date"
                      value={dayKey}
                      max={todayKey || undefined}
                      onChange={(e) => setDayKey(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.startLabel")}
                    </label>
                    <input
                      type="time"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      disabled={dayAlreadyLogged}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.endLabel")}
                    </label>
                    <input
                      type="time"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      disabled={dayAlreadyLogged}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={saving || !canSubmit}
                      className="btn-primary px-6 text-sm disabled:opacity-50"
                    >
                      {saving ? t("workHours.saving") : t("workHours.save")}
                    </button>
                    {dayAlreadyLogged ? (
                      <p className="mt-2 text-[11px] text-gray-500">
                        {t("workHours.noEditHistory")}
                      </p>
                    ) : null}
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h2 className="mb-3 text-sm font-bold text-gray-100">
                  {t("workHours.historyTitle")}
                </h2>
                {entries.length === 0 ? (
                  <p className="text-sm text-gray-500">{t("workHours.empty")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[28rem] text-right text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 text-xs text-gray-400">
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colDate")}
                          </th>
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colStart")}
                          </th>
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colEnd")}
                          </th>
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colTotal")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((row) => (
                          <tr
                            key={row.dayKey}
                            className="border-b border-slate-800/80"
                          >
                            <td className="px-2 py-2">
                              {formatDayLabel(row.dayKey, locale)}
                            </td>
                            <td className="px-2 py-2 tabular-nums">{row.start}</td>
                            <td className="px-2 py-2 tabular-nums">{row.end}</td>
                            <td className="px-2 py-2 font-semibold text-primary">
                              {formatDuration(row.minutes, t)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}
