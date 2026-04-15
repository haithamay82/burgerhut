import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MENU_ITEMS as STATIC_MENU_ITEMS } from "@/utils/menuData";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

const MenuCatalogContext = createContext(null);

export function MenuCatalogProvider({ children }) {
  const [menuItems, setMenuItems] = useState(() => STATIC_MENU_ITEMS.slice());

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/catalog");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.items)) return;
      setMenuItems(d.items);
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refresh();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
  }, [refresh]);

  const mainMealProductIds = useMemo(() => {
    return new Set(
      menuItems.filter((x) => isMealWizardCategory(x?.category)).map((x) => x.id)
    );
  }, [menuItems]);

  const value = useMemo(
    () => ({ menuItems, mainMealProductIds, refresh }),
    [menuItems, mainMealProductIds, refresh]
  );

  return (
    <MenuCatalogContext.Provider value={value}>{children}</MenuCatalogContext.Provider>
  );
}

export function useMenuCatalog() {
  const ctx = useContext(MenuCatalogContext);
  if (!ctx) {
    throw new Error("useMenuCatalog must be used within MenuCatalogProvider");
  }
  return ctx;
}
