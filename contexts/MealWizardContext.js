import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import MealCustomizeWizard from "@/components/MealCustomizeWizard";

const MealWizardContext = createContext(null);

export function MealWizardProvider({ children }) {
  const [wizard, setWizard] = useState(null);

  const closeMealWizard = useCallback(() => setWizard(null), []);

  const openMealFromMenu = useCallback((item, opts = {}) => {
    if (!item) return;
    setWizard({
      item,
      initialCartLine: null,
      replaceLineId: null,
      specialWizardMode: opts.mode ?? null,
    });
  }, []);

  const openMealEditLine = useCallback((catalogItem, cartLine) => {
    if (!catalogItem || !cartLine?.id) return;
    setWizard({
      item: catalogItem,
      initialCartLine: cartLine,
      replaceLineId: String(cartLine.id),
      specialWizardMode: null,
    });
  }, []);

  /** כמו «בחירת מנה» — חובה לבחור צ'יפס וכו' בוויזארד */
  const addSpecialMealQuick = useCallback(
    (item) => {
      if (!item || item.category !== "specials") return;
      openMealFromMenu(item);
    },
    [openMealFromMenu]
  );

  const value = useMemo(
    () => ({
      openMealFromMenu,
      openMealEditLine,
      closeMealWizard,
      addSpecialMealQuick,
    }),
    [openMealFromMenu, openMealEditLine, closeMealWizard, addSpecialMealQuick]
  );

  return (
    <MealWizardContext.Provider value={value}>
      {children}
      <MealCustomizeWizard
        item={wizard?.item ?? null}
        open={wizard != null}
        onClose={closeMealWizard}
        initialCartLine={wizard?.initialCartLine ?? null}
        replaceLineId={wizard?.replaceLineId ?? null}
        specialWizardMode={wizard?.specialWizardMode ?? null}
      />
    </MealWizardContext.Provider>
  );
}

export function useMealWizard() {
  const ctx = useContext(MealWizardContext);
  if (!ctx) {
    throw new Error("useMealWizard must be used within MealWizardProvider");
  }
  return ctx;
}
