import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { MENU_ITEMS as STATIC_MENU_ITEMS } from "@/utils/menuData";
import {
  emptyCatalogEditor,
  mergeBurgerToppingsFromEditor,
  mergeCrispyMealToppingsFromEditor,
} from "@/utils/mergeMenuCatalog";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

const MenuCatalogContext = createContext(null);

const initialEditor = emptyCatalogEditor();

export function MenuCatalogProvider({ children }) {
  const [menuItems, setMenuItems] = useState(() => STATIC_MENU_ITEMS.slice());
  const [burgerToppings, setBurgerToppings] = useState(() =>
    mergeBurgerToppingsFromEditor(initialEditor)
  );
  const [crispyMealToppings, setCrispyMealToppings] = useState(() =>
    mergeCrispyMealToppingsFromEditor(initialEditor)
  );

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/catalog");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.items)) return;
      setMenuItems(d.items);
      if (Array.isArray(d.burgerToppings)) {
        setBurgerToppings(d.burgerToppings);
      }
      if (Array.isArray(d.crispyMealToppings)) {
        setCrispyMealToppings(d.crispyMealToppings);
      }
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
    () => ({
      menuItems,
      burgerToppings,
      crispyMealToppings,
      mainMealProductIds,
      refresh,
    }),
    [menuItems, burgerToppings, crispyMealToppings, mainMealProductIds, refresh]
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
