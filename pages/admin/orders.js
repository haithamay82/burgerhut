import { useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { useLocale } from "@/contexts/LocaleContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { BURGER_TOPPINGS, MAIN_MENU_ITEMS } from "@/utils/menuData";
import { getDefaultBusinessSchedule } from "@/utils/businessHoursDefaults";

const INVENTORY_CATEGORIES = ["burgers", "crispy"];

function formatTime(iso, locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(iso).toLocaleString(loc, {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCouponDateTime(ts, locale) {
  if (!Number.isFinite(Number(ts)) || Number(ts) <= 0) return "—";
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Number(ts)).toLocaleString(loc, {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daySalesTotal(dayOrders) {
  return dayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
}

function payCourierDeliverySplitLabel(t, payment) {
  const mid =
    payment === "bit" || payment === "card"
      ? t(`payment.${payment}`)
      : t("payment.card");
  return `${t("checkout.payCourierDeliveryFoodPrefix")}${mid}${t("checkout.payCourierDeliveryFoodSuffix")}`;
}

function formatDayHeading(dayStr, locale) {
  const parts = dayStr.split("-").map((x) => parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return dayStr;
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(y, m - 1, d).toLocaleDateString(loc, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** מפתח YYYY-MM-DD לפי יום בירושלים (כמו קיבוץ ההזמנות) */
function jerusalemDayKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function parseDayKey(key) {
  const [ys, ms, ds] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  return { y, m, d };
}

function dayKeyFromParts(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** מספר ימים בחודש גרגוריאני (y, m בשביל 1–12) */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = ראשון … 6 = שבת — לפי תאריך אזרחי אחיד */
function weekdaySun0(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function weekdayShortLabels(locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  const fmt = new Intl.DateTimeFormat(loc, { weekday: "short" });
  const labels = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(Date.UTC(2024, 0, 7 + i, 12, 0, 0));
    labels.push(fmt.format(d));
  }
  return labels;
}

function formatMonthYearTitle(y, m, locale) {
  const loc = locale === "ar" ? "ar" : "he-IL";
  return new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)).toLocaleDateString(loc, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AdminOrdersPage() {
  const { locale, t } = useLocale();
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [unavailableIds, setUnavailableIds] = useState([]);
  const [invSaving, setInvSaving] = useState(false);
  const [hoursDraft, setHoursDraft] = useState(null);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState("");
  const [discountDraft, setDiscountDraft] = useState(null);
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountMsg, setDiscountMsg] = useState("");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [hoursPanelOpen, setHoursPanelOpen] = useState(false);
  const [discountPanelOpen, setDiscountPanelOpen] = useState(false);
  const [promo, setPromo] = useState(null);
  const [promoUploading, setPromoUploading] = useState(false);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoMsg, setPromoMsg] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponDeleteCode, setCouponDeleteCode] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [couponPanelOpen, setCouponPanelOpen] = useState(false);
  const promoFileRef = useRef(null);

  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [calView, setCalView] = useState({ y: 2026, m: 1 });

  const ordersByDay = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const key = d.toLocaleDateString("en-CA", {
        timeZone: "Asia/Jerusalem",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return map;
  }, [orders]);

  const weekdayLabels = useMemo(
    () => weekdayShortLabels(locale),
    [locale]
  );

  const load = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/orders", {
        headers: { "x-admin-secret": secret.trim() },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setOrders([]);
        setLoaded(false);
        setHoursDraft(null);
        setDiscountDraft(null);
        setPromo(null);
        setCoupons([]);
        setError(
          data.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.errAuth")
        );
        return;
      }
      setOrders(data.orders || []);
      setLoaded(true);
      setHoursMsg("");
      setDiscountMsg("");
      setCouponMsg("");
      const todayK = jerusalemDayKey();
      const { y: ty, m: tm } = parseDayKey(todayK);
      setSelectedDayKey(todayK);
      setCalView({ y: ty, m: tm });
      try {
        const invR = await fetch("/api/inventory");
        const invData = await invR.json().catch(() => ({}));
        if (invR.ok && Array.isArray(invData.unavailableIds)) {
          setUnavailableIds(invData.unavailableIds);
        } else {
          setUnavailableIds([]);
        }
      } catch {
        setUnavailableIds([]);
      }
      try {
        const bhR = await fetch("/api/business-hours");
        const bhData = await bhR.json().catch(() => ({}));
        if (bhR.ok && Array.isArray(bhData.days)) {
          setHoursDraft(bhData.days.map((d) => ({ ...d })));
        } else {
          setHoursDraft(getDefaultBusinessSchedule());
        }
      } catch {
        setHoursDraft(getDefaultBusinessSchedule());
      }
      try {
        const dr = await fetch("/api/discount");
        const dd = await dr.json().catch(() => ({}));
        if (dr.ok && dd.ok) {
          setDiscountDraft({
            enabled: Boolean(dd.enabled),
            percent: Number(dd.percent) || 0,
            minOrderTotal: Number(dd.minOrderTotal) || 0,
            reason: String(dd.reason ?? ""),
            couponEnabled: Boolean(dd.couponEnabled),
            couponPercent: Number(dd.couponPercent) || 0,
          });
        } else {
          setDiscountDraft({
            enabled: false,
            percent: 0,
            minOrderTotal: 0,
            reason: "",
            couponEnabled: false,
            couponPercent: 0,
          });
        }
      } catch {
        setDiscountDraft({
          enabled: false,
          percent: 0,
          minOrderTotal: 0,
          reason: "",
          couponEnabled: false,
          couponPercent: 0,
        });
      }
      try {
        const pr = await fetch("/api/promo");
        const pd = await pr.json().catch(() => ({}));
        if (pr.ok && pd.ok) {
          setPromo(pd);
        } else {
          setPromo(null);
        }
      } catch {
        setPromo(null);
      }
      try {
        setCouponsLoading(true);
        const cr = await fetch("/api/coupons", {
          headers: { "x-admin-secret": secret.trim() },
        });
        const cd = await cr.json().catch(() => ({}));
        if (cr.ok && cd?.ok && Array.isArray(cd.coupons)) {
          setCoupons(cd.coupons);
        } else {
          setCoupons([]);
        }
      } catch {
        setCoupons([]);
      } finally {
        setCouponsLoading(false);
      }
    } catch {
      setError(t("admin.errNet"));
      setLoaded(false);
      setHoursDraft(null);
      setDiscountDraft(null);
      setPromo(null);
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const deleteCoupon = async (code) => {
    if (!secret.trim() || !code) return;
    if (typeof window !== "undefined" && !window.confirm(t("admin.couponDeleteConfirm"))) {
      return;
    }
    setError("");
    setCouponMsg("");
    setCouponDeleteCode(code);
    try {
      const r = await fetch(`/api/coupons?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: { "x-admin-secret": secret.trim() },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.couponDeleteErr")
        );
        return;
      }
      setCoupons((prev) => prev.filter((c) => c.code !== code));
      setCouponMsg(t("admin.couponDeleted"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setCouponDeleteCode("");
    }
  };

  const deleteOrder = async (orderId) => {
    if (!secret.trim()) return;
    if (typeof window !== "undefined" && !window.confirm(t("admin.deleteConfirm"))) {
      return;
    }
    setError("");
    setDeletingId(orderId);
    try {
      const r = await fetch(
        `/api/orders?id=${encodeURIComponent(orderId)}`,
        {
          method: "DELETE",
          headers: { "x-admin-secret": secret.trim() },
        }
      );
      if (!r.ok) {
        setError(t("admin.deleteErr"));
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setDeletingId(null);
    }
  };

  const saveInventory = async (nextIds) => {
    if (!secret.trim()) return;
    setError("");
    setInvSaving(true);
    try {
      const r = await fetch("/api/inventory", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ unavailableIds: nextIds }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.inventoryErr")
        );
        return;
      }
      setUnavailableIds(Array.isArray(d.unavailableIds) ? d.unavailableIds : nextIds);
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setInvSaving(false);
    }
  };

  const toggleMainItemAvailable = (productId, checked) => {
    const next = checked
      ? unavailableIds.filter((id) => id !== productId)
      : [...new Set([...unavailableIds, productId])];
    saveInventory(next);
  };

  const updateHoursDay = (weekday, patch) => {
    setHoursDraft((prev) =>
      prev
        ? prev.map((row) =>
            row.weekday === weekday ? { ...row, ...patch } : row
          )
        : null
    );
  };

  const updateDiscountDraft = (patch) => {
    setDiscountDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const togglePromoPanel = async () => {
    const next = !promoOpen;
    setPromoOpen(next);
    if (next && loaded && promo == null) {
      try {
        const pr = await fetch("/api/promo");
        const pd = await pr.json().catch(() => ({}));
        if (pr.ok && pd.ok) {
          setPromo(pd);
        }
      } catch {
        /* ignore */
      }
    }
  };

  const uploadPromoVideo = async () => {
    if (!secret.trim()) return;
    const file = promoFileRef.current?.files?.[0];
    if (!file) {
      setError(t("admin.promoErrMissing"));
      return;
    }
    setError("");
    setPromoMsg("");
    setPromoUploading(true);
    try {
      let uploadedWithBlob = false;
      let blobUploadError = "";
      try {
        await uploadToBlob(`promo-${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/promo/blob",
          clientPayload: JSON.stringify({ adminSecret: secret.trim() }),
          multipart: true,
        });
        uploadedWithBlob = true;
      } catch (blobErr) {
        const msg = String(blobErr?.message || "");
        blobUploadError = msg;
        const isBlobDisabled =
          msg.includes("blob_not_configured") ||
          msg.includes("BLOB_READ_WRITE_TOKEN");
        if (isBlobDisabled) {
          setError(t("admin.promoErrBlobConfig"));
          return;
        }
      }

      const isLocalHost =
        typeof window !== "undefined" &&
        ["localhost", "127.0.0.1"].includes(window.location.hostname);

      if (!uploadedWithBlob && !isLocalHost) {
        setError(
          `${t("admin.promoErrBlobUpload")}${
            blobUploadError ? ` (${blobUploadError})` : ""
          }`
        );
        return;
      }

      if (!uploadedWithBlob) {
        const fd = new FormData();
        fd.append("video", file);
        const r = await fetch("/api/promo", {
          method: "POST",
          headers: { "x-admin-secret": secret.trim() },
          body: fd,
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (d.error === "admin_not_configured") {
            setError(t("admin.errConfig"));
          } else if (d.error === "unauthorized") {
            setError(t("admin.errAuth"));
          } else if (d.error === "file_too_large" || r.status === 413) {
            const maxMb = Number(d?.maxMb) || 0;
            if (maxMb > 0 && maxMb <= 5) {
              setError(t("admin.promoErrTooLargeVercel"));
            } else {
              setError(t("admin.promoErrTooLarge"));
            }
          } else if (d.error === "parse_failed") {
            setError(t("admin.promoErrTooLarge"));
          } else if (d.error === "invalid_type") {
            setError(t("admin.promoErrInvalidType"));
          } else if (d.error === "save_failed") {
            setError(t("admin.promoErrSave"));
          } else {
            setError(t("admin.promoErrUpload"));
          }
          return;
        }
      }

      const fresh = await fetch("/api/promo");
      const freshData = await fresh.json().catch(() => ({}));
      if (fresh.ok && freshData?.ok) {
        setPromo(freshData);
      }
      if (promoFileRef.current) promoFileRef.current.value = "";
      setPromoMsg(t("admin.promoUploaded"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setPromoUploading(false);
    }
  };

  const savePromoEnabled = async (enabled) => {
    if (!secret.trim() || !promo) return;
    setError("");
    setPromoMsg("");
    setPromoSaving(true);
    try {
      const r = await fetch("/api/promo", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "admin_not_configured") {
          setError(t("admin.errConfig"));
        } else if (d.error === "unauthorized") {
          setError(t("admin.errAuth"));
        } else {
          setError(t("admin.promoErrUpload"));
        }
        return;
      }
      setPromo(d);
      setPromoMsg(t("admin.promoSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setPromoSaving(false);
    }
  };

  const saveBusinessHours = async () => {
    if (!secret.trim() || !hoursDraft) return;
    setError("");
    setHoursMsg("");
    setHoursSaving(true);
    try {
      const r = await fetch("/api/business-hours", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({ days: hoursDraft }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "admin_not_configured") {
          setError(t("admin.errConfig"));
        } else if (d.error === "unauthorized") {
          setError(t("admin.errAuth"));
        } else if (d.error === "invalid_time") {
          setError(t("admin.hoursErrInvalidTime"));
        } else if (d.error === "open_after_close") {
          setError(t("admin.hoursErrCloseBeforeOpen"));
        } else if (d.error === "invalid_days") {
          setError(t("admin.hoursErrInvalidDays"));
        } else if (d.error === "storage_failed") {
          setError(t("admin.hoursErrStorage"));
        } else {
          setError(t("admin.hoursErr"));
        }
        return;
      }
      if (Array.isArray(d.days)) {
        setHoursDraft(d.days.map((x) => ({ ...x })));
      }
      setHoursMsg(t("admin.hoursSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setHoursSaving(false);
    }
  };

  const saveDiscountConfig = async () => {
    if (!secret.trim() || !discountDraft) return;
    setError("");
    setDiscountMsg("");
    setDiscountSaving(true);
    try {
      const r = await fetch("/api/discount", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret.trim(),
        },
        body: JSON.stringify({
          enabled: Boolean(discountDraft.enabled),
          percent: Number(discountDraft.percent) || 0,
          minOrderTotal: Number(discountDraft.minOrderTotal) || 0,
          reason: String(discountDraft.reason ?? ""),
          couponEnabled: Boolean(discountDraft.couponEnabled),
          couponPercent: Number(discountDraft.couponPercent) || 0,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          d.error === "admin_not_configured"
            ? t("admin.errConfig")
            : t("admin.discountErr")
        );
        return;
      }
      setDiscountDraft({
        enabled: Boolean(d.enabled),
        percent: Number(d.percent) || 0,
        minOrderTotal: Number(d.minOrderTotal) || 0,
        reason: String(d.reason ?? ""),
        couponEnabled: Boolean(d.couponEnabled),
        couponPercent: Number(d.couponPercent) || 0,
      });
      setDiscountMsg(t("admin.discountSaved"));
    } catch {
      setError(t("admin.errNet"));
    } finally {
      setDiscountSaving(false);
    }
  };

  const shiftCalMonth = (delta) => {
    setCalView(({ y, m }) => {
      let nm = m + delta;
      let ny = y;
      while (nm > 12) {
        nm -= 12;
        ny += 1;
      }
      while (nm < 1) {
        nm += 12;
        ny -= 1;
      }
      return { y: ny, m: nm };
    });
  };

  const goToToday = () => {
    const k = jerusalemDayKey();
    const { y, m } = parseDayKey(k);
    setSelectedDayKey(k);
    setCalView({ y, m });
  };

  const todayKey = jerusalemDayKey();
  const { y: vy, m: vm } = calView;
  const dim = daysInMonth(vy, vm);
  const lead = weekdaySun0(vy, vm, 1);
  const calendarCells = [];
  for (let i = 0; i < lead; i += 1) calendarCells.push(null);
  for (let d = 1; d <= dim; d += 1) {
    calendarCells.push(dayKeyFromParts(vy, vm, d));
  }
  const selectedDayOrders =
    selectedDayKey != null ? ordersByDay.get(selectedDayKey) ?? [] : [];
  const nowTs = Date.now();

  return (
    <>
      <Head>
        <title>{t("admin.title")}</title>
      </Head>
      <div className="min-h-screen bg-black text-gray-100" dir="rtl">
        <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-primary">{t("admin.title")}</h1>
              <p className="text-xs text-gray-500">{t("admin.hint")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="text-xs font-semibold text-primary underline-offset-4 hover:text-amber-400 hover:underline"
              >
                {t("admin.backHome")}
              </Link>
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-6">
          <form
            onSubmit={load}
            className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-400">
                {t("admin.secretLabel")}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder={t("admin.secretPh")}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !secret.trim()}
              className="btn-primary whitespace-nowrap px-6 text-sm disabled:opacity-50"
            >
              {loading ? t("admin.loading") : t("admin.load")}
            </button>
          </form>

          {error ? (
            <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          {loaded ? (
            <>
              <div className="mb-8 space-y-3">
              <button
                type="button"
                onClick={() => setInventoryOpen((v) => !v)}
                aria-expanded={inventoryOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.inventoryTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {inventoryOpen ? "▾" : "▶"}
                </span>
              </button>
              {inventoryOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="mb-4 text-[11px] text-gray-500">
                    {t("admin.inventoryHint")}
                  </p>
                  {invSaving ? (
                    <p className="mb-3 text-xs text-amber-400/90">
                      {t("admin.inventorySaving")}
                    </p>
                  ) : null}
                  <div className="space-y-5">
                    {INVENTORY_CATEGORIES.map((catId) => {
                      const catItems = MAIN_MENU_ITEMS.filter(
                        (row) => row.category === catId
                      );
                      if (!catItems.length) return null;
                      return (
                        <div key={catId}>
                          <h3 className="mb-2 text-xs font-semibold text-primary">
                            {t(`cat.${catId}`)}
                          </h3>
                          <ul className="space-y-2">
                            {catItems.map((row) => {
                              const available = !unavailableIds.includes(
                                row.id
                              );
                              return (
                                <li key={row.id}>
                                  <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                                    <input
                                      type="checkbox"
                                      checked={available}
                                      disabled={invSaving}
                                      onChange={(e) =>
                                        toggleMainItemAvailable(
                                          row.id,
                                          e.target.checked
                                        )
                                      }
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                                    />
                                    <span>{t(`menu.${row.id}.name`)}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold text-primary">
                        {t("admin.inventoryBurgerToppings")}
                      </h3>
                      <ul className="space-y-2">
                        {BURGER_TOPPINGS.map((row) => {
                          const available = !unavailableIds.includes(row.id);
                          return (
                            <li key={row.id}>
                              <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={available}
                                  disabled={invSaving}
                                  onChange={(e) =>
                                    toggleMainItemAvailable(
                                      row.id,
                                      e.target.checked
                                    )
                                  }
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                                />
                                <span>{t(`topping.${row.id}`)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </section>
              ) : null}

              <button
                type="button"
                onClick={togglePromoPanel}
                aria-expanded={promoOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
              >
                <span className="min-w-0 flex-1 leading-snug">
                  {t("admin.promoTitle")}
                </span>
                <span
                  className="shrink-0 text-lg leading-none text-primary"
                  aria-hidden
                >
                  {promoOpen ? "▾" : "▶"}
                </span>
              </button>
              {promoOpen ? (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  {promo ? (
                    <>
                      <p className="mb-4 text-[11px] text-gray-500">
                        {t("admin.promoHint")}
                      </p>
                      <p className="mb-3 text-xs font-medium text-gray-300">
                        {promo.hasFile
                          ? promo.active
                            ? t("admin.promoStatusOn")
                            : t("admin.promoStatusOff")
                          : t("admin.promoNoFile")}
                      </p>
                      {promoMsg ? (
                        <p className="mb-3 text-xs font-medium text-emerald-400/95">
                          {promoMsg}
                        </p>
                      ) : null}
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          ref={promoFileRef}
                          type="file"
                          accept="video/*"
                          disabled={promoUploading}
                          className="max-w-full text-xs text-gray-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-gray-200"
                        />
                        <button
                          type="button"
                          onClick={uploadPromoVideo}
                          disabled={promoUploading || !secret.trim()}
                          className="btn-primary shrink-0 text-sm disabled:opacity-50"
                        >
                          {promoUploading
                            ? t("admin.promoUploading")
                            : t("admin.promoUploadBtn")}
                        </button>
                      </div>
                      {promo.hasFile ? (
                        <div className="rounded-xl border border-slate-700/80 bg-slate-950/40 p-3">
                          <h4 className="mb-2 text-xs font-bold text-primary">
                            {t("admin.promoHomeDisplaySection")}
                          </h4>
                          <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
                            {t("admin.promoShowOnHomeHint")}
                          </p>
                          <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-200">
                            <input
                              type="checkbox"
                              checked={Boolean(promo.enabled)}
                              disabled={promoSaving}
                              onChange={(e) =>
                                savePromoEnabled(e.target.checked)
                              }
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                            />
                            <span className="font-medium leading-snug">
                              {t("admin.promoShowOnHomeCheckbox")}
                            </span>
                          </label>
                          {promoSaving ? (
                            <p className="mt-2 text-xs text-amber-400/90">
                              {t("admin.promoSaving")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {t("admin.promoLoadEmpty")}
                    </p>
                  )}
                </section>
              ) : null}

              {hoursDraft ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHoursPanelOpen((v) => !v)}
                    aria-expanded={hoursPanelOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {t("admin.hoursTitle")}
                    </span>
                    <span
                      className="shrink-0 text-lg leading-none text-primary"
                      aria-hidden
                    >
                      {hoursPanelOpen ? "▾" : "▶"}
                    </span>
                  </button>
                  {hoursPanelOpen ? (
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="mb-4 text-[11px] text-gray-500">
                        {t("admin.hoursHint")}
                      </p>
                      {hoursMsg ? (
                        <p className="mb-3 text-xs font-medium text-emerald-400/95">
                          {hoursMsg}
                        </p>
                      ) : null}
                      <div className="mb-4 space-y-0 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
                        {hoursDraft.map((d) => (
                          <div
                            key={d.weekday}
                            className="flex flex-wrap items-center gap-3 bg-slate-950/30 px-3 py-2.5"
                          >
                            <span className="min-w-[5.5rem] text-xs font-semibold text-primary">
                              {t(`weekday.${d.weekday}`)}
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={d.enabled}
                                disabled={hoursSaving}
                                onChange={(e) =>
                                  updateHoursDay(d.weekday, {
                                    enabled: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                              />
                              {t("admin.hoursOpen")}
                            </label>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <label className="flex items-center gap-1.5 text-gray-400">
                                <span>{t("admin.hoursOpening")}</span>
                                <input
                                  type="time"
                                  value={d.open}
                                  disabled={!d.enabled || hoursSaving}
                                  onChange={(e) =>
                                    updateHoursDay(d.weekday, {
                                      open: e.target.value,
                                    })
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-gray-400">
                                <span>{t("admin.hoursClosing")}</span>
                                <input
                                  type="time"
                                  value={d.close}
                                  disabled={!d.enabled || hoursSaving}
                                  onChange={(e) =>
                                    updateHoursDay(d.weekday, {
                                      close: e.target.value,
                                    })
                                  }
                                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={saveBusinessHours}
                        disabled={hoursSaving || !secret.trim()}
                        className="btn-primary text-sm disabled:opacity-50"
                      >
                        {hoursSaving
                          ? t("admin.hoursSaving")
                          : t("admin.hoursSave")}
                      </button>
                    </section>
                  ) : null}
                </>
              ) : null}

              {discountDraft ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDiscountPanelOpen((v) => !v)}
                    aria-expanded={discountPanelOpen}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {t("admin.discountTitle")}
                    </span>
                    <span
                      className="shrink-0 text-lg leading-none text-primary"
                      aria-hidden
                    >
                      {discountPanelOpen ? "▾" : "▶"}
                    </span>
                  </button>
                  {discountPanelOpen ? (
                    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                      <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                        {t("admin.discountHint")}
                      </p>
                      {discountMsg ? (
                        <p className="mb-3 text-xs font-medium text-emerald-400/95">
                          {discountMsg}
                        </p>
                      ) : null}
                      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={Boolean(discountDraft.enabled)}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ enabled: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                          />
                          {t("admin.discountEnabled")}
                        </label>
                        <div className="my-2 border-t border-slate-800" />
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={Boolean(discountDraft.couponEnabled)}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ couponEnabled: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary"
                          />
                          {t("admin.couponEnabled")}
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.couponPercent")}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={discountDraft.couponPercent}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ couponPercent: e.target.value })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountPercent")}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={discountDraft.percent}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ percent: e.target.value })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountMinOrder")}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={discountDraft.minOrderTotal}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({
                                minOrderTotal: e.target.value,
                              })
                            }
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-400">
                          <span>{t("admin.discountReason")}</span>
                          <input
                            type="text"
                            maxLength={180}
                            value={discountDraft.reason || ""}
                            disabled={discountSaving}
                            onChange={(e) =>
                              updateDiscountDraft({ reason: e.target.value })
                            }
                            placeholder={t("admin.discountReasonPh")}
                            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-gray-100 disabled:opacity-40"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={saveDiscountConfig}
                        disabled={discountSaving || !secret.trim()}
                        className="btn-primary mt-4 text-sm disabled:opacity-50"
                      >
                        {discountSaving
                          ? t("admin.discountSaving")
                          : t("admin.discountSave")}
                      </button>
                    </section>
                  ) : null}
                </>
              ) : null}

              <>
                <button
                  type="button"
                  onClick={() => setCouponPanelOpen((v) => !v)}
                  aria-expanded={couponPanelOpen}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-right text-sm font-bold text-gray-100 transition-colors hover:border-primary/50 hover:bg-slate-800/60"
                >
                  <span className="min-w-0 flex-1 leading-snug">
                    {t("admin.couponsTitle")}
                  </span>
                  <span
                    className="shrink-0 text-lg leading-none text-primary"
                    aria-hidden
                  >
                    {couponPanelOpen ? "▾" : "▶"}
                  </span>
                </button>
                {couponPanelOpen ? (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                      {t("admin.couponsHint")}
                    </p>
                    {couponMsg ? (
                      <p className="mb-3 text-xs font-medium text-emerald-400/95">
                        {couponMsg}
                      </p>
                    ) : null}
                    {couponsLoading ? (
                      <p className="text-xs text-gray-400">{t("admin.loading")}</p>
                    ) : coupons.length === 0 ? (
                      <p className="text-xs text-gray-500">{t("admin.couponsEmpty")}</p>
                    ) : (
                      <div className="max-h-[26rem] space-y-2 overflow-y-auto pl-1">
                        {coupons.map((c) => {
                          const expired =
                            Number.isFinite(Number(c.expiresAt)) &&
                            Number(c.expiresAt) > 0 &&
                            Number(c.expiresAt) < nowTs;
                          const used = Boolean(c.used);
                          return (
                            <article
                              key={c.code}
                              className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 text-xs">
                                  <p className="font-bold text-primary">
                                    {t("admin.couponCode")}: {c.code}
                                  </p>
                                  <p className="text-gray-300">
                                    {t("admin.couponValue")}: ₪
                                    {Number(c.value || 0).toFixed(2)}
                                  </p>
                                  <p
                                    className={
                                      expired ? "text-red-300" : "text-emerald-300"
                                    }
                                  >
                                    {t("admin.couponExpiryStatus")}:{" "}
                                    {expired
                                      ? t("admin.couponExpired")
                                      : t("admin.couponValid")}
                                  </p>
                                  <p
                                    className={used ? "text-amber-300" : "text-cyan-300"}
                                  >
                                    {t("admin.couponUsedStatus")}:{" "}
                                    {used
                                      ? t("admin.couponUsed")
                                      : t("admin.couponNotUsed")}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {t("admin.couponCreatedAt")}:{" "}
                                    {formatCouponDateTime(c.createdAt, locale)}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    {t("admin.couponExpiresAt")}:{" "}
                                    {formatCouponDateTime(c.expiresAt, locale)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteCoupon(c.code)}
                                  disabled={couponDeleteCode === c.code}
                                  className="rounded-lg border border-red-900/50 bg-red-950/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {couponDeleteCode === c.code
                                    ? t("admin.deleting")
                                    : t("admin.couponDelete")}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ) : null}
              </>
            </div>

              <section
                className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                aria-label={t("admin.salesCalendarTitle")}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-primary">
                    {t("admin.salesCalendarTitle")}
                  </h2>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-slate-800"
                  >
                    {t("admin.calendarTodayBtn")}
                  </button>
                </div>
                <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                  {t("admin.salesCalendarHint")}
                </p>
                {orders.length === 0 ? (
                  <p className="mb-4 text-sm text-gray-500">{t("admin.empty")}</p>
                ) : null}

                <div
                  className="mb-6 flex items-center justify-between gap-2"
                  dir="ltr"
                >
                  <button
                    type="button"
                    onClick={() => shiftCalMonth(-1)}
                    aria-label={t("admin.calendarPrevMonth")}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-lg leading-none text-gray-200 transition-colors hover:border-primary/40 hover:bg-slate-800"
                  >
                    ‹
                  </button>
                  <span className="min-w-0 flex-1 text-center text-sm font-semibold text-gray-200">
                    {formatMonthYearTitle(vy, vm, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftCalMonth(1)}
                    aria-label={t("admin.calendarNextMonth")}
                    className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-lg leading-none text-gray-200 transition-colors hover:border-primary/40 hover:bg-slate-800"
                  >
                    ›
                  </button>
                </div>

                <div className="mb-6" dir="ltr">
                  <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-500 sm:text-xs">
                    {weekdayLabels.map((label, i) => (
                      <div key={i} className="py-1">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cellKey, idx) =>
                      cellKey == null ? (
                        <div key={`empty-${idx}`} className="aspect-square min-h-[2.25rem]" />
                      ) : (
                        (() => {
                          const isToday = cellKey === todayKey;
                          const isSel = selectedDayKey === cellKey;
                          const hasOrders = ordersByDay.has(cellKey);
                          const dayNum = parseDayKey(cellKey).d;
                          return (
                            <button
                              key={cellKey}
                              type="button"
                              onClick={() => setSelectedDayKey(cellKey)}
                              aria-pressed={isSel}
                              aria-label={cellKey}
                              className={`relative flex min-h-[2.25rem] aspect-square items-center justify-center rounded-lg border text-sm font-semibold transition-colors sm:min-h-[2.5rem] ${
                                isSel
                                  ? "border-primary bg-primary/20 text-primary"
                                  : "border-slate-700 bg-slate-950/50 text-gray-200 hover:border-slate-500 hover:bg-slate-800/60"
                              } ${
                                isToday
                                  ? "ring-1 ring-amber-500/60 ring-offset-1 ring-offset-slate-900/80"
                                  : ""
                              }`}
                            >
                              <span>{dayNum}</span>
                              {hasOrders ? (
                                <span
                                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400"
                                  aria-hidden
                                />
                              ) : null}
                            </button>
                          );
                        })()
                      )
                    )}
                  </div>
                </div>

                {selectedDayKey ? (
                  <>
                    <h3 className="mb-2 border-b border-slate-800 pb-2 text-sm font-bold text-gray-300">
                      {formatDayHeading(selectedDayKey, locale)}
                      <span className="mr-2 text-xs font-normal text-gray-500">
                        ({selectedDayKey})
                      </span>
                    </h3>
                    <p className="mb-3 text-sm text-gray-400">
                      {t("admin.daySalesTotal")}:{" "}
                      <span className="font-bold text-amber-400">
                        ₪{daySalesTotal(selectedDayOrders).toFixed(2)}
                      </span>
                      <span className="mr-2 text-xs text-gray-500">
                        ({selectedDayOrders.length} {t("admin.ordersCount")})
                      </span>
                    </p>
                    {selectedDayOrders.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {t("admin.dayOrdersEmpty")}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedDayOrders.map((o) => (
                          <article
                            key={o.id}
                            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm"
                          >
                            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-primary">
                                  {o.customer?.name || "—"}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {o.customer?.phone}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-semibold text-primary">
                                  #{o.orderNumber ?? "—"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatTime(o.createdAt, locale)}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {t("admin.payment")}:{" "}
                                  {t(`payment.${o.payment}`) || o.payment}
                                </p>
                                <p className="font-bold text-amber-400">
                                  ₪{Number(o.total).toFixed(2)}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => deleteOrder(o.id)}
                                  disabled={deletingId !== null}
                                  className="mt-2 rounded-lg border border-red-900/50 bg-red-950/20 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {deletingId === o.id
                                    ? t("admin.deleting")
                                    : t("admin.delete")}
                                </button>
                              </div>
                            </div>
                            {o.customer?.address ? (
                              <p className="mb-2 text-xs text-gray-500">
                                {o.customer.address}
                              </p>
                            ) : null}
                            {o.customer?.orderType === "delivery" &&
                            o.customer?.deliveryFeeNis != null ? (
                              <p className="mb-1 text-[11px] text-gray-400">
                                {t("checkout.deliveryFeeLine")}: ₪
                                {Number(o.customer.deliveryFeeNis).toFixed(0)}
                                {o.customer.deliveryDistanceKm != null
                                  ? ` · ${
                                      o.customer.deliveryRouteMode ===
                                      "air_fallback"
                                        ? t("checkout.distanceKm")
                                        : t("checkout.drivingDistanceKm")
                                    }: ${Number(
                                      o.customer.deliveryDistanceKm
                                    ).toFixed(1)} km`
                                  : ""}
                                {o.customer.deliveryPayTo === "restaurant_all"
                                  ? ` · ${t("checkout.payRestaurantAll")}`
                                  : o.customer.deliveryPayTo ===
                                      "courier_delivery"
                                    ? ` · ${payCourierDeliverySplitLabel(
                                        t,
                                        o.payment
                                      )}`
                                    : o.customer.deliveryPayTo ===
                                        "courier_all_cash"
                                      ? ` · ${t("checkout.payCourierCashFull")}`
                                      : ""}
                              </p>
                            ) : null}
                            {Number(o.customer?.discountAmountNis) > 0 ? (
                              <p className="mb-1 text-[11px] text-emerald-300/90">
                                {t("wa.discount")}: -₪
                                {Number(o.customer.discountAmountNis).toFixed(2)}
                              </p>
                            ) : null}
                            {Number(o.customer?.couponDiscountNis) > 0 ? (
                              <p className="mb-1 text-[11px] text-cyan-300/90">
                                {t("wa.coupon")}
                                {o.customer?.couponCode
                                  ? ` (${String(o.customer.couponCode).toUpperCase()})`
                                  : ""}
                                : -₪{Number(o.customer.couponDiscountNis).toFixed(2)}
                              </p>
                            ) : null}
                            <ul className="space-y-2 border-t border-slate-800 pt-2 text-xs text-gray-300">
                              {(o.items || []).map((it, index) => {
                                const qty = Number(it.quantity) || 1;
                                const lineTotal = (
                                  Number(it.price) * qty
                                ).toFixed(2);
                                return (
                                  <li
                                    key={
                                      it.id ||
                                      `${it.name}-${it.price}-${index}`
                                    }
                                    className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2"
                                  >
                                    <p className="text-[13px] font-semibold text-gray-100">
                                      {it.name}
                                      {qty > 1 ? ` ×${qty}` : ""}
                                      {" — "}₪{lineTotal}
                                    </p>
                                    {it.sizeLabel ? (
                                      <p className="mt-1 text-[11px] text-gray-400">
                                        {t("checkout.size")}: {it.sizeLabel}
                                      </p>
                                    ) : null}
                                    {it.variantLabel ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.variant")}:{" "}
                                        {it.variantLabel}
                                      </p>
                                    ) : null}
                                    {it.salads?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.saladsPrefix")}:{" "}
                                        {it.salads
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {it.toppings?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.toppingsPrefix")}:{" "}
                                        {it.toppings
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {it.extras?.length ? (
                                      <p className="text-[11px] text-gray-400">
                                        {t("checkout.extrasPrefix")}:{" "}
                                        {it.extras
                                          .map((x) => x.label)
                                          .join(", ")}
                                      </p>
                                    ) : null}
                                    {it.requestedDrinkLabel ? (
                                      <p className="text-[11px] text-sky-200/90">
                                        {t("wa.drink")}:{" "}
                                        {it.requestedDrinkLabel}
                                        {Number.isFinite(
                                          Number(it.requestedDrinkPrice)
                                        )
                                          ? ` (+₪${Number(
                                              it.requestedDrinkPrice
                                            ).toFixed(0)})`
                                          : ""}
                                      </p>
                                    ) : null}
                                    {it.sellerNotes ? (
                                      <p className="text-[11px] text-amber-200/90">
                                        {t("ui.sellerNotes")}: {it.sellerNotes}
                                      </p>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-2 text-[10px] text-gray-600">
                              {t("admin.orderId")}: {o.id}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </>
  );
}
