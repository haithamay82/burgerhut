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

/** קטגוריות עם הרבה פריטים — שתי עמודות כדי שייכנסו לרבע */
const TWO_COLUMN_CATEGORIES = new Set(["burgers", "drinks"]);

function Quadrant({ gridArea, category, items, t, locale }) {
  const catItems = items
    .filter((row) => row.category === category)
    .sort((a, b) => a.basePrice - b.basePrice);

  const twoColumns = TWO_COLUMN_CATEGORIES.has(category);

  return (
    <div
      style={{
        gridArea,
        direction: "rtl",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 3,
        padding: "1.5mm 2mm",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        backgroundColor: "#fafafa",
      }}
    >
      <h2
        style={{
          fontSize: "11pt",
          fontWeight: 700,
          margin: "0 0 1mm",
          paddingBottom: "0.8mm",
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
            ...(twoColumns
              ? {
                  columnCount: 2,
                  columnGap: "2.2mm",
                  columnFill: "balance",
                }
              : {}),
          }}
        >
          {catItems.map((row) => (
            <li
              key={row.id}
              style={{
                breakInside: "avoid",
                pageBreakInside: "avoid",
                marginBottom: "1mm",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.4mm",
                  fontSize: "9pt",
                  lineHeight: 1.22,
                }}
              >
                {row.image ? (
                  <img
                    src={resolveImageSrc(row.image)}
                    alt=""
                    width={30}
                    height={30}
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
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: "9pt",
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
          marginBottom: "1mm",
        }}
      >
        <img
          src={resolveImageSrc("/logo-burger-hut.png")}
          alt=""
          style={{
            display: "block",
            margin: "0 auto 0.5mm",
            maxHeight: "20mm",
            maxWidth: "62mm",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
        />
        <h1
          style={{
            fontSize: "16pt",
            fontWeight: 700,
            margin: 0,
            paddingTop: 0,
            textAlign: "center",
            color: "#0f172a",
            direction: "rtl",
            lineHeight: 1.15,
          }}
        >
          {t("admin.menuExportSheetTitle")}
        </h1>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateAreas: `
            "drinks burgers"
            "sides crispy"`,
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "1.8mm",
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
