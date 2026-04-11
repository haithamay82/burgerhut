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

const AdminMenuExportSheet = forwardRef(function AdminMenuExportSheet(
  { items, categories, t, locale },
  ref
) {
  return (
    <div
      ref={ref}
      dir="rtl"
      style={{
        position: "fixed",
        left: "-12000px",
        top: 0,
        width: "210mm",
        boxSizing: "border-box",
        padding: "10mm 12mm",
        backgroundColor: "#ffffff",
        color: "#111827",
        fontFamily: 'system-ui, "Segoe UI", Arial, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: "18pt",
          fontWeight: 700,
          margin: "0 0 8mm",
          textAlign: "center",
          color: "#0f172a",
        }}
      >
        {t("admin.menuExportSheetTitle")}
      </h1>
      {categories.map((catId) => {
        const catItems = items
          .filter((row) => row.category === catId)
          .sort((a, b) => a.basePrice - b.basePrice);
        if (!catItems.length) return null;
        return (
          <section key={catId} style={{ marginBottom: "6mm" }}>
            <h2
              style={{
                fontSize: "12pt",
                fontWeight: 700,
                margin: "0 0 3mm",
                paddingBottom: "1.5mm",
                borderBottom: "1px solid #cbd5e1",
                color: "#b45309",
              }}
            >
              {t(`cat.${catId}`)}
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {catItems.map((row) => (
                <li
                  key={row.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "3mm",
                    marginBottom: "2.5mm",
                    fontSize: "9.5pt",
                    lineHeight: 1.35,
                  }}
                >
                  {row.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveImageSrc(row.image)}
                      alt=""
                      width={40}
                      height={40}
                      style={{
                        objectFit: "cover",
                        borderRadius: 4,
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
          </section>
        );
      })}
    </div>
  );
});

export default AdminMenuExportSheet;
