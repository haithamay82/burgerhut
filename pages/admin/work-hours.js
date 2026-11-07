import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useLocale } from "@/contexts/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  formatHoursMinutes,
  isEndTimeInTheFuture,
} from "@/utils/employeeHours";
import {
  clearEmployeeHoursSecret,
  hasRememberedEmployeeHoursSecret,
  readEmployeeHoursSecret,
  writeEmployeeHoursSecret,
} from "@/utils/employeeHoursAuthPersist";

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

function mapAuthError(code, t) {
  const map = {
    unauthorized: "workHours.errAuth",
    invalid_name: "workHours.errName",
    invalid_password: "workHours.errPasswordWeak",
    name_taken: "workHours.errNameTaken",
    password_taken: "workHours.errPasswordTaken",
  };
  return t(map[code] || "workHours.errLoad");
}

export default function EmployeeWorkHoursPage() {
  const { locale, t } = useLocale();
  const [secret, setSecret] = useState("");
  const [regName, setRegName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRemember, setRegRemember] = useState(true);
  const [loginRemember, setLoginRemember] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [monthCostIls, setMonthCostIls] = useState(0);
  const [currentRateIls, setCurrentRateIls] = useState(0);
  const [paidTotalIls, setPaidTotalIls] = useState(0);
  const [balanceIls, setBalanceIls] = useState(0);
  const [totalEarnedIls, setTotalEarnedIls] = useState(0);
  const [entries, setEntries] = useState([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const todayEntry = useMemo(
    () => entries.find((e) => e.dayKey === todayKey) || null,
    [entries, todayKey]
  );

  const applyPayload = useCallback((d) => {
    const today = String(d.todayKey || "");
    const list = Array.isArray(d.entries) ? d.entries : [];
    setTodayKey(today);
    setMonthKey(String(d.monthKey || ""));
    setMonthMinutes(Number(d.monthMinutes) || 0);
    setMonthCostIls(Number(d.monthCostIls ?? d.employee?.monthCostIls) || 0);
    setEntries(list);
    if (d.employee?.name) setEmployeeName(String(d.employee.name));
    setCurrentRateIls(Number(d.employee?.currentRateIls) || 0);
    setPaidTotalIls(Number(d.employee?.paidTotalIls) || 0);
    setBalanceIls(Number(d.employee?.balanceIls) || 0);
    setTotalEarnedIls(Number(d.employee?.totalEarnedIls) || 0);
    const todayRow = list.find((e) => e.dayKey === today);
    if (todayRow) {
      setStart(String(todayRow.start || ""));
      setEnd(String(todayRow.end || ""));
    } else {
      setStart("");
      setEnd("");
    }
  }, []);

  function formatMoney(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "₪0.00";
    return `₪${v.toFixed(2)}`;
  }

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
          clearEmployeeHoursSecret();
          setError(mapAuthError(d.error, t));
          return false;
        }
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
    const stored = readEmployeeHoursSecret();
    if (stored) {
      setSecret(stored);
      setLoginRemember(hasRememberedEmployeeHoursSecret());
      void loadData(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  const onLogin = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const s = secret.trim();
    if (!s) return;
    setLoading(true);
    try {
      const r = await fetch("/api/employee-hours/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: s }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(mapAuthError(d.error, t));
        return;
      }
      writeEmployeeHoursSecret(s, loginRemember);
      await loadData(s);
    } catch {
      setError(t("workHours.errNet"));
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    const name = regName.trim();
    const password = regPassword.trim();
    if (!name || !password || registerBusy) return;
    setRegisterBusy(true);
    try {
      const r = await fetch("/api/employee-hours/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(mapAuthError(d.error, t));
        return;
      }
      writeEmployeeHoursSecret(password, regRemember);
      setSecret(password);
      setRegName("");
      setRegPassword("");
      setMsg(
        regRemember
          ? t("workHours.registeredRemembered")
          : t("workHours.registered")
      );
      await loadData(password);
    } catch {
      setError(t("workHours.errNet"));
    } finally {
      setRegisterBusy(false);
    }
  };

  const logout = () => {
    clearEmployeeHoursSecret();
    setSecret("");
    setEmployeeName("");
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
    if (isEndTimeInTheFuture(start, end)) {
      setError(t("workHours.errFutureEnd"));
      return;
    }
    setSaving(true);
    setError("");
    setMsg("");
    const isUpdate = Boolean(todayEntry);
    try {
      const r = await fetch("/api/employee-hours", {
        method: isUpdate ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-employee-hours-secret": secret.trim(),
        },
        body: JSON.stringify({ dayKey: todayKey, start, end }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const map = {
          future_day: "workHours.errFuture",
          not_today: "workHours.errNotToday",
          already_exists: "workHours.errExists",
          not_found: "workHours.errNotFound",
          invalid_time: "workHours.errTime",
          invalid_range: "workHours.errRange",
          invalid_day: "workHours.errDay",
          future_end: "workHours.errFutureEnd",
        };
        setError(t(map[d.error] || "workHours.errSave"));
        return;
      }
      applyPayload(d);
      setMsg(isUpdate ? t("workHours.updated") : t("workHours.saved"));
    } catch {
      setError(t("workHours.errNet"));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    Boolean(todayKey && start && end) &&
    !isEndTimeInTheFuture(start, end);

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
              <p className="text-xs text-gray-500">
                {authed && employeeName
                  ? t("workHours.hello").replace("{name}", employeeName)
                  : t("workHours.hint")}
              </p>
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
            <div className="mb-6 space-y-4">
              <form
                onSubmit={onLogin}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <h2 className="mb-3 text-sm font-bold text-gray-100">
                  {t("workHours.loginTitle")}
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={loginRemember}
                    onChange={(e) => setLoginRemember(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t("workHours.rememberPassword")}</span>
                </label>
              </form>

              <form
                onSubmit={onRegister}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <h2 className="mb-1 text-sm font-bold text-gray-100">
                  {t("workHours.registerTitle")}
                </h2>
                <p className="mb-3 text-[11px] text-gray-500">
                  {t("workHours.registerHint")}
                </p>
                <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.nameLabel")}
                    </label>
                    <input
                      type="text"
                      autoComplete="name"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder={t("workHours.namePh")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.secretLabel")}
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder={t("workHours.secretPh")}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      registerBusy || !regName.trim() || !regPassword.trim()
                    }
                    className="btn-primary whitespace-nowrap px-6 text-sm disabled:opacity-50"
                  >
                    {registerBusy
                      ? t("workHours.loading")
                      : t("workHours.register")}
                  </button>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={regRemember}
                    onChange={(e) => setRegRemember(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t("workHours.rememberPasswordAsk")}</span>
                </label>
              </form>
            </div>
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
                <p className="mt-1 text-lg font-semibold text-amber-200">
                  {t("workHours.monthCostLabel")}: {formatMoney(monthCostIls)}
                </p>
                <div className="mt-3 grid gap-1 text-xs text-gray-300 sm:grid-cols-2">
                  <p>
                    {t("workHours.hourRateLabel")}:{" "}
                    <span className="font-semibold text-primary">
                      {formatMoney(currentRateIls)}
                    </span>
                  </p>
                  <p>
                    {t("workHours.totalEarnedLabel")}:{" "}
                    <span className="font-semibold text-primary">
                      {formatMoney(totalEarnedIls)}
                    </span>
                  </p>
                  <p>
                    {t("workHours.paidLabel")}:{" "}
                    <span className="font-semibold text-emerald-300">
                      {formatMoney(paidTotalIls)}
                    </span>
                  </p>
                  <p>
                    {t("workHours.balanceLabel")}:{" "}
                    <span className="font-semibold text-amber-200">
                      {formatMoney(balanceIls)}
                    </span>
                  </p>
                </div>
              </section>

              <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <h2 className="mb-3 text-sm font-bold text-gray-100">
                  {t("workHours.reportTitle")}
                </h2>
                {todayEntry ? (
                  <p className="mb-3 text-xs text-amber-200/90">
                    {t("workHours.todayEditableHint")}
                  </p>
                ) : null}
                <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      {t("workHours.dateLabel")}
                    </label>
                    <input
                      type="date"
                      value={todayKey}
                      min={todayKey || undefined}
                      max={todayKey || undefined}
                      readOnly
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
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
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={saving || !canSubmit}
                      className="btn-primary px-6 text-sm disabled:opacity-50"
                    >
                      {saving
                        ? t("workHours.saving")
                        : todayEntry
                          ? t("workHours.update")
                          : t("workHours.save")}
                    </button>
                    <p className="mt-2 text-[11px] text-gray-500">
                      {t("workHours.noEditHistory")}
                    </p>
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
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colRate")}
                          </th>
                          <th className="px-2 py-2 font-semibold">
                            {t("workHours.colCost")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((row) => (
                          <tr
                            key={`${row.employeeId}-${row.dayKey}`}
                            className="border-b border-slate-800/80"
                          >
                            <td className="px-2 py-2">
                              {formatDayLabel(row.dayKey, locale)}
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {row.start}
                            </td>
                            <td className="px-2 py-2 tabular-nums">{row.end}</td>
                            <td className="px-2 py-2 font-semibold text-primary">
                              {formatDuration(row.minutes, t)}
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {formatMoney(row.rateIls)}
                            </td>
                            <td className="px-2 py-2 font-semibold text-amber-200">
                              {formatMoney(row.costIls)}
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
