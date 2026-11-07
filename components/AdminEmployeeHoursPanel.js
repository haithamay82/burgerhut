import { useCallback, useEffect, useState } from "react";
import {
  formatHoursMinutes,
  isEndTimeInTheFuture,
  minutesBetweenHHmm,
} from "@/utils/employeeHours";

function formatDuration(minutes, t) {
  const { hours, minutes: rem } = formatHoursMinutes(minutes);
  return t("workHours.duration")
    .replace("{h}", String(hours))
    .replace("{m}", String(rem));
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "₪0.00";
  return `₪${v.toFixed(2)}`;
}

function formatDayLabel(dayKey, locale) {
  const [y, m, d] = String(dayKey)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return dayKey;
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * @param {{ secret: string, locale: string, t: (k: string) => string }} props
 */
export default function AdminEmployeeHoursPanel({ secret, locale, t }) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [msg, setMsg] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [monthMinutes, setMonthMinutes] = useState(0);
  const [monthCostIls, setMonthCostIls] = useState(0);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editDrafts, setEditDrafts] = useState({});
  const [rateDrafts, setRateDrafts] = useState({});
  const [paidDrafts, setPaidDrafts] = useState({});
  const [selectedId, setSelectedId] = useState("");

  const applyPayload = useCallback((d) => {
    const list = Array.isArray(d.entries) ? d.entries : [];
    const emps = Array.isArray(d.employees) ? d.employees : [];
    const today = String(d.todayKey || "");
    setTodayKey(today);
    setMonthKey(String(d.monthKey || ""));
    setMonthMinutes(Number(d.monthMinutes) || 0);
    setMonthCostIls(Number(d.monthCostIls) || 0);
    setEntries(list);
    setEmployees(emps);
    const drafts = {};
    for (const row of list) {
      if (row.dayKey === today && row.employeeId) {
        drafts[row.employeeId] = {
          start: String(row.start || ""),
          end: String(row.end || ""),
        };
      }
    }
    setEditDrafts(drafts);
    const rates = {};
    const paids = {};
    for (const e of emps) {
      rates[e.id] = String(e.currentRateIls ?? "");
      paids[e.id] = String(e.paidTotalIls ?? "");
    }
    setRateDrafts(rates);
    setPaidDrafts(paids);
    setSelectedId((prev) => {
      if (prev && emps.some((e) => e.id === prev)) return prev;
      return emps[0]?.id || "";
    });
  }, []);

  const refresh = useCallback(async () => {
    const s = String(secret || "").trim();
    if (!s) return;
    setLoading(true);
    setMsg("");
    try {
      const r = await fetch(`/api/employee-hours?_=${Date.now()}`, {
        headers: { "x-admin-secret": s },
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(
          d.error === "forbidden" || d.error === "unauthorized"
            ? t("admin.errAuth")
            : t("workHours.errLoad")
        );
        return;
      }
      applyPayload(d);
    } catch {
      setMsg(t("admin.errNet"));
    } finally {
      setLoading(false);
    }
  }, [secret, t, applyPayload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const manage = async (body, employeeIdForBusy = "") => {
    const s = String(secret || "").trim();
    if (!s) return;
    setBusyId(employeeIdForBusy || "all");
    setMsg("");
    try {
      const isDelete = body._method === "DELETE";
      const r = await fetch(
        isDelete
          ? `/api/employee-hours/manage?employeeId=${encodeURIComponent(body.employeeId)}`
          : "/api/employee-hours/manage",
        {
          method: isDelete ? "DELETE" : "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": s,
          },
          body: isDelete ? undefined : JSON.stringify(body),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const map = {
          invalid_rate: "workHours.errRate",
          invalid_amount: "workHours.errAmount",
          not_found: "workHours.errNotFound",
          missing_employee: "workHours.errNotFound",
        };
        setMsg(t(map[d.error] || "workHours.errSave"));
        return;
      }
      applyPayload(d);
      setMsg(t("workHours.manageSaved"));
    } catch {
      setMsg(t("admin.errNet"));
    } finally {
      setBusyId("");
    }
  };

  const saveTodayEdit = async (employeeId) => {
    const s = String(secret || "").trim();
    const draft = editDrafts[employeeId];
    if (!s || !draft || !todayKey) return;
    if (isEndTimeInTheFuture(draft.start, draft.end)) {
      setMsg(t("workHours.errFutureEnd"));
      return;
    }
    setBusyId(employeeId);
    setMsg("");
    try {
      const r = await fetch("/api/employee-hours", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": s,
        },
        body: JSON.stringify({
          employeeId,
          dayKey: todayKey,
          start: draft.start,
          end: draft.end,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(
          d.error === "future_end"
            ? t("workHours.errFutureEnd")
            : t("workHours.errSave")
        );
        return;
      }
      applyPayload(d);
      setMsg(t("workHours.updated"));
    } catch {
      setMsg(t("admin.errNet"));
    } finally {
      setBusyId("");
    }
  };

  const selected = employees.find((e) => e.id === selectedId) || null;
  const selectedEntries = selected
    ? entries.filter((e) => e.employeeId === selected.id)
    : entries;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] leading-relaxed text-gray-500">
            {t("admin.workHoursReportHint")}
          </p>
          <p className="mt-2 text-sm font-semibold text-primary">
            {t("workHours.monthTotalLabel")}
            {monthKey ? ` (${monthKey})` : ""}
            {": "}
            {formatDuration(monthMinutes, t)}
            {" · "}
            {formatMoney(monthCostIls)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? t("workHours.loading") : t("admin.workHoursRefresh")}
        </button>
      </div>

      {msg ? (
        <p className="mb-3 text-xs font-medium text-amber-200/90">{msg}</p>
      ) : null}

      {loading && employees.length === 0 ? (
        <p className="text-sm text-gray-500">{t("workHours.loading")}</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-gray-500">{t("workHours.noEmployees")}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {employees.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedId(e.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  selectedId === e.id
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-slate-700 bg-slate-950/60 text-gray-300 hover:border-slate-500"
                }`}
              >
                {e.name}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="mb-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-gray-100">
                  {selected.name}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(
                        t("workHours.deleteConfirm").replace(
                          "{name}",
                          selected.name
                        )
                      )
                    ) {
                      return;
                    }
                    void manage(
                      { _method: "DELETE", employeeId: selected.id },
                      selected.id
                    );
                  }}
                  disabled={busyId === selected.id}
                  className="rounded-lg border border-red-900/60 bg-red-950/30 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-950/50 disabled:opacity-50"
                >
                  {t("workHours.deleteEmployee")}
                </button>
              </div>

              <div className="grid gap-2 text-xs text-gray-300 sm:grid-cols-2">
                <p>
                  {t("workHours.hourRateLabel")}:{" "}
                  <span className="font-semibold text-primary">
                    {formatMoney(selected.currentRateIls)}
                  </span>
                </p>
                <p>
                  {t("workHours.monthCostLabel")}:{" "}
                  <span className="font-semibold text-primary">
                    {formatMoney(selected.monthCostIls)}
                  </span>
                </p>
                <p>
                  {t("workHours.totalEarnedLabel")}:{" "}
                  <span className="font-semibold text-primary">
                    {formatMoney(selected.totalEarnedIls)}
                  </span>
                </p>
                <p>
                  {t("workHours.paidLabel")}:{" "}
                  <span className="font-semibold text-emerald-300">
                    {formatMoney(selected.paidTotalIls)}
                  </span>
                </p>
                <p className="sm:col-span-2">
                  {t("workHours.balanceLabel")}:{" "}
                  <span className="font-semibold text-amber-200">
                    {formatMoney(selected.balanceIls)}
                  </span>
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[8rem] flex-1">
                    <label className="mb-1 block text-[11px] text-gray-400">
                      {t("workHours.setRateLabel")}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={rateDrafts[selected.id] ?? ""}
                      onChange={(e) =>
                        setRateDrafts((prev) => ({
                          ...prev,
                          [selected.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      void manage(
                        {
                          action: "set_rate",
                          employeeId: selected.id,
                          rateIls: Number(rateDrafts[selected.id]),
                        },
                        selected.id
                      )
                    }
                    className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    {t("workHours.saveRate")}
                  </button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[8rem] flex-1">
                    <label className="mb-1 block text-[11px] text-gray-400">
                      {t("workHours.setPaidLabel")}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={paidDrafts[selected.id] ?? ""}
                      onChange={(e) =>
                        setPaidDrafts((prev) => ({
                          ...prev,
                          [selected.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      void manage(
                        {
                          action: "set_paid",
                          employeeId: selected.id,
                          paidTotalIls: Number(paidDrafts[selected.id]),
                        },
                        selected.id
                      )
                    }
                    className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    {t("workHours.savePaid")}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                {t("workHours.rateFromTodayHint")}
              </p>
            </div>
          ) : null}

          {selectedEntries.length === 0 ? (
            <p className="text-sm text-gray-500">{t("workHours.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-right text-sm">
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
                    <th className="px-2 py-2 font-semibold">
                      {t("workHours.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEntries.map((row) => {
                    const isToday =
                      Boolean(todayKey) &&
                      row.dayKey === todayKey &&
                      Boolean(row.employeeId);
                    const draft = isToday
                      ? editDrafts[row.employeeId] || {
                          start: row.start,
                          end: row.end,
                        }
                      : null;
                    const previewMinutes = isToday
                      ? minutesBetweenHHmm(draft.start, draft.end) ??
                        row.minutes
                      : row.minutes;
                    return (
                      <tr
                        key={`${row.employeeId}-${row.dayKey}`}
                        className="border-b border-slate-800/80"
                      >
                        <td className="px-2 py-2">
                          {formatDayLabel(row.dayKey, locale)}
                        </td>
                        <td className="px-2 py-2">
                          {isToday ? (
                            <input
                              type="time"
                              value={draft.start}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [row.employeeId]: {
                                    start: e.target.value,
                                    end: draft.end,
                                  },
                                }))
                              }
                              className="w-[7.5rem] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
                            />
                          ) : (
                            <span className="tabular-nums">{row.start}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {isToday ? (
                            <input
                              type="time"
                              value={draft.end}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [row.employeeId]: {
                                    start: draft.start,
                                    end: e.target.value,
                                  },
                                }))
                              }
                              className="w-[7.5rem] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
                            />
                          ) : (
                            <span className="tabular-nums">{row.end}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 font-semibold text-primary">
                          {formatDuration(previewMinutes, t)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatMoney(row.rateIls)}
                        </td>
                        <td className="px-2 py-2 font-semibold text-amber-200">
                          {formatMoney(row.costIls)}
                        </td>
                        <td className="px-2 py-2">
                          {isToday ? (
                            <button
                              type="button"
                              onClick={() =>
                                void saveTodayEdit(row.employeeId)
                              }
                              disabled={
                                busyId === row.employeeId ||
                                !draft.start ||
                                !draft.end ||
                                isEndTimeInTheFuture(draft.start, draft.end)
                              }
                              className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary disabled:opacity-50"
                            >
                              {busyId === row.employeeId
                                ? t("workHours.saving")
                                : t("workHours.update")}
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
