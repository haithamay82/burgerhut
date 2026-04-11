import { forwardRef } from "react";
import { menuItemName } from "@/utils/menuItemLabels";

function resolveImageSrc(url) {
  if (!url) return "";
  if (
    url.startsWith("http") ||
    url.startsWith("data:") ||
    url.startsWith("//")
  ) {
    return url;
  }
  if (typeof window === "undefined") return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${window.location.origin}${path}`;
}

/**
 * פריסת A4: רשת פיזית (LTR) כדי ש«ימין/שמאל» יתאימו לדף.
 * שמאל עליון: שתייה | ימין עליון: בורגרים
 * שמאל תחתון: תוספות | ימין תחתון: קריספי
 */
const QUADRANT_LAYOUT = [
  { gridArea: "drinks", category: "drinks" },
  { gridArea: "burgers", category: "burgers" },
  { gridArea: "sides", category: "sides" },
  { gridArea: "crispy", category: "crispy" },
];

/** שורה תחתונה — פחות ריווח פנימי כדי שכל התוספות (כולל צ'יפס וצ'דר) ייכנסו */
const BOTTOM_QUADRANT = new Set(["sides", "crispy"]);

function Quadrant({ gridArea, category, items, t, locale }) {
  const catItems = items
    .filter((row) => row.category === category)
    .sort((a, b) => a.basePrice - b.basePrice);

  const bottom = BOTTOM_QUADRANT.has(category);

  return (
    <div
      style={{
        gridArea,
        direction: "rtl",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 3,
        padding: bottom ? "1mm 1.8mm" : "1.5mm 2mm",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        backgroundColor: "#fafafa",
      }}
    >
      <h2
        style={{
          fontSize: "15.4pt",
          fontWeight: 700,
          margin: bottom ? "0 0 0.6mm" : "0 0 1mm",
          paddingBottom: bottom ? "0.5mm" : "0.8mm",
          borderBottom: "1px solid #94a3b8",
          color: "#b45309",
          flexShrink: 0,
        }}
      >
        {t(`cat.${category}`)}
      </h2>
      {catItems.length ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {catItems.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: bottom ? "1.5mm" : "2mm",
                marginBottom: bottom ? "0.85mm" : "1.4mm",
                fontSize: "12.6pt",
                lineHeight: 1.3,
              }}
            >
              {row.image ? (
                <img
                  src={resolveImageSrc(row.image)}
                  alt=""
                  width={33}
                  height={33}
                  style={{
                    objectFit: "cover",
                    borderRadius: 3,
                    flexShrink: 0,
                  }}
                />
              ) : null}
              <span style={{ flex: 1, minWidth: 0 }}>
                {menuItemName(row, t, locale)}
              </span>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>
                ₪{row.basePrice}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: "12.6pt",
            color: "#94a3b8",
          }}
        >
          —
        </p>
      )}
    </div>
  );
}

const AdminMenuExportSheet = forwardRef(function AdminMenuExportSheet(
  { items, t, locale },
  ref
) {
  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: "-12000px",
        top: 0,
        width: "210mm",
        height: "297mm",
        boxSizing: "border-box",
        padding: "4mm 5mm",
        backgroundColor: "#ffffff",
        color: "#111827",
        fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif',
        display: "flex",
        flexDirection: "column",
        direction: "ltr",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          flexShrink: 0,
          textAlign: "center",
          position: "relative",
          zIndex: 2,
          margin: 0,
          padding: 0,
          backgroundColor: "transparent",
          marginBottom: "1mm",
        }}
      >
        {/* lineHeight:0 מבטל רווח תחתון מזויף מתחת לתמונה (baseline) */}
        <div
          style={{
            lineHeight: 0,
            margin: 0,
            padding: 0,
          }}
        >
          <img
            src={resolveImageSrc("/logo-burger-hut.png")}
            alt=""
            style={{
              display: "block",
              margin: "0 auto",
              maxHeight: "60mm",
              maxWidth: "186mm",
              width: "auto",
              height: "auto",
              objectFit: "contain",
            }}
          />
        </div>
        <h1
          style={{
            position: "relative",
            zIndex: 3,
            /* ריפוד תחתון בתוך קובץ הלוגו — מושכים את «תפריט» למעלה כדי לרחף מעל הלבן */
            margin: "-10mm 0 0",
            padding: 0,
            fontSize: "32pt",
            fontWeight: 700,
            textAlign: "center",
            color: "#0f172a",
            direction: "rtl",
            lineHeight: 1.05,
            textShadow:
              "0 0 10px #fff, 0 0 6px #fff, 0 1px 0 #fff",
          }}
        >
          {t("admin.menuExportSheetTitle")}
        </h1>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateAreas: `
            "drinks burgers"
            "sides crispy"`,
          gridTemplateColumns: "1fr 1fr",
          /* יותר גובה לשתייה + בורגרים; פחות לתוספות + קריספי (פחות פריטים) */
          gridTemplateRows: "minmax(0, 2.62fr) minmax(0, 1.08fr)",
          /* rowGap קטן: פחות רווח בין שתייה לתוספות (ובין בורגרים לקריספי) */
          rowGap: "0.5mm",
          columnGap: "1.5mm",
        }}
      >
        {QUADRANT_LAYOUT.map(({ gridArea, category }) => (
          <Quadrant
            key={gridArea}
            gridArea={gridArea}
            category={category}
            items={items}
            t={t}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
});

export default AdminMenuExportSheet;
