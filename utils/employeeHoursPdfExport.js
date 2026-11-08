import html2canvas from "html2canvas";
import { formatHoursMinutes } from "@/utils/employeeHours";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "₪0.00";
  return `₪${v.toFixed(2)}`;
}

function formatDuration(minutes, durationTpl) {
  const { hours, minutes: rem } = formatHoursMinutes(minutes);
  return String(durationTpl || "{h}:{m}")
    .replace("{h}", String(hours))
    .replace("{m}", String(rem));
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

function filterMonthEntries(entries, monthKey) {
  const prefix = String(monthKey || "").slice(0, 7);
  const list = Array.isArray(entries) ? entries : [];
  if (!/^\d{4}-\d{2}$/.test(prefix)) return list.slice();
  return list.filter((e) => String(e.dayKey || "").startsWith(prefix));
}

/**
 * @param {{
 *   title: string,
 *   brand?: string,
 *   monthKey: string,
 *   locale?: string,
 *   labels: Record<string, string>,
 *   sections: Array<{
 *     employee: {
 *       name: string,
 *       currentRateIls?: number,
 *       monthMinutes?: number,
 *       monthCostIls?: number,
 *       totalEarnedIls?: number,
 *       paidTotalIls?: number,
 *       balanceIls?: number,
 *     },
 *     entries: Array<{
 *       dayKey: string,
 *       start?: string,
 *       end?: string,
 *       minutes?: number,
 *       rateIls?: number,
 *       costIls?: number,
 *     }>,
 *   }>,
 *   fileName?: string,
 * }} opts
 */
export async function downloadEmployeeHoursPdf(opts) {
  const {
    title,
    brand = "Burger Hut",
    monthKey,
    locale = "he",
    labels,
    sections,
    fileName,
  } = opts;
  const L = labels || {};
  const dir = "rtl";
  const safeSections = Array.isArray(sections) ? sections : [];

  const sectionHtml = safeSections
    .map((sec) => {
      const emp = sec.employee || { name: "" };
      const rows = filterMonthEntries(sec.entries, monthKey).sort((a, b) =>
        String(a.dayKey).localeCompare(String(b.dayKey))
      );
      const monthMinutes =
        Number(emp.monthMinutes) ||
        rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0);
      const monthCost =
        Number(emp.monthCostIls) ||
        rows.reduce((s, r) => s + (Number(r.costIls) || 0), 0);

      const bodyRows =
        rows.length === 0
          ? `<tr><td colspan="6" style="padding:8px;color:#666;">${escapeHtml(
              L.empty || ""
            )}</td></tr>`
          : rows
              .map(
                (r) => `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(
              formatDayLabel(r.dayKey, locale)
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;">${escapeHtml(
              r.start || ""
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-variant-numeric:tabular-nums;">${escapeHtml(
              r.end || ""
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(
              formatDuration(r.minutes, L.duration)
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(
              formatMoney(r.rateIls)
            )}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(
              formatMoney(r.costIls)
            )}</td>
          </tr>`
              )
              .join("");

      return `<section style="margin-bottom:28px;page-break-inside:avoid;">
        <h2 style="margin:0 0 10px;font-size:16px;color:#111;">${escapeHtml(
          emp.name || ""
        )}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:12px;font-size:12px;color:#333;">
          <div>${escapeHtml(L.hourRate)}: <strong>${escapeHtml(
            formatMoney(emp.currentRateIls)
          )}</strong></div>
          <div>${escapeHtml(L.monthHours)}: <strong>${escapeHtml(
            formatDuration(monthMinutes, L.duration)
          )}</strong></div>
          <div>${escapeHtml(L.monthCost)}: <strong>${escapeHtml(
            formatMoney(monthCost)
          )}</strong></div>
          <div>${escapeHtml(L.totalEarned)}: <strong>${escapeHtml(
            formatMoney(emp.totalEarnedIls)
          )}</strong></div>
          <div>${escapeHtml(L.paid)}: <strong>${escapeHtml(
            formatMoney(emp.paidTotalIls)
          )}</strong></div>
          <div>${escapeHtml(L.balance)}: <strong>${escapeHtml(
            formatMoney(emp.balanceIls)
          )}</strong></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:right;">
          <thead>
            <tr style="background:#f3f4f6;color:#374151;">
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colDate
              )}</th>
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colStart
              )}</th>
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colEnd
              )}</th>
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colTotal
              )}</th>
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colRate
              )}</th>
              <th style="padding:7px 8px;font-weight:700;">${escapeHtml(
                L.colCost
              )}</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const root = document.createElement("div");
  root.setAttribute("dir", dir);
  root.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:28px 32px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;";
  root.innerHTML = `
    <div style="border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:0.04em;color:#666;margin-bottom:4px;">${escapeHtml(
        brand
      )}</div>
      <h1 style="margin:0;font-size:22px;color:#111;">${escapeHtml(title)}</h1>
      <div style="margin-top:6px;font-size:13px;color:#444;">${escapeHtml(
        L.monthLabel || ""
      )}${monthKey ? `: ${escapeHtml(monthKey)}` : ""}</div>
    </div>
    ${sectionHtml || `<p style="color:#666;">${escapeHtml(L.empty || "")}</p>`}
  `;

  document.body.appendChild(root);
  try {
    const canvas = await html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: 794,
      windowWidth: 794,
    });
    const { jsPDF } = await import("jspdf");
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    const safeName =
      fileName ||
      `burger-hut-hours-${monthKey || "report"}.pdf`.replace(
        /[^\w.\u0590-\u05FF\u0600-\u06FF-]+/g,
        "_"
      );
    pdf.save(safeName);
  } finally {
    root.remove();
  }
}

/** Build labels object from i18n `t`. */
export function employeeHoursPdfLabels(t) {
  return {
    monthLabel: t("workHours.pdfMonthLabel"),
    hourRate: t("workHours.hourRateLabel"),
    monthHours: t("workHours.monthTotalLabel"),
    monthCost: t("workHours.monthCostLabel"),
    totalEarned: t("workHours.totalEarnedLabel"),
    paid: t("workHours.paidLabel"),
    balance: t("workHours.balanceLabel"),
    colDate: t("workHours.colDate"),
    colStart: t("workHours.colStart"),
    colEnd: t("workHours.colEnd"),
    colTotal: t("workHours.colTotal"),
    colRate: t("workHours.colRate"),
    colCost: t("workHours.colCost"),
    duration: t("workHours.duration"),
    empty: t("workHours.empty"),
  };
}
