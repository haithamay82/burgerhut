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

function Quadrant({ gridArea, category, items, t, locale }) {
  const catItems = items
    .filter((row) => row.category === category)
    .sort((a, b) => a.basePrice - b.basePrice);

  return (
    <div
      style={{
        gridArea,
        direction: "rtl",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 3,
        padding: "2mm 2.5mm",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        backgroundColor: "#fafafa",
      }}
    >
      <h2
        style={{
          fontSize: "9pt",
          fontWeight: 700,
          margin: "0 0 1.5mm",
          paddingBottom: "1mm",
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
                gap: "1.2mm",
                marginBottom: "1mm",
                fontSize: "6.75pt",
                lineHeight: 1.25,
              }}
            >
              {row.image ? (
                <img
                  src={resolveImageSrc(row.image)}
                  alt=""
                  width={22}
                  height={22}
                  style={{
                    objectFit: "cover",
                    borderRadius: 2,
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
            fontSize: "7pt",
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
        padding: "5mm 6mm",
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
          marginBottom: "2mm",
        }}
      >
        <img
          src={resolveImageSrc("/logo-burger-hut.png")}
          alt=""
          style={{
            display: "block",
            margin: "0 auto 1.5mm",
            maxHeight: "11mm",
            maxWidth: "48mm",
            width: "auto",
            height: "auto",
            objectFit: "contain",
          }}
        />
        <h1
          style={{
            fontSize: "14pt",
            fontWeight: 700,
            margin: 0,
            textAlign: "center",
            color: "#0f172a",
            direction: "rtl",
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
          gap: "2mm",
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
