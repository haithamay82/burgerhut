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

  const openMealFromMenu = useCallback((item) => {
    if (!item) return;
    setWizard({
      item,
      initialCartLine: null,
      replaceLineId: null,
    });
  }, []);

  const openMealEditLine = useCallback((catalogItem, cartLine) => {
    if (!catalogItem || !cartLine?.id) return;
    setWizard({
      item: catalogItem,
      initialCartLine: cartLine,
      replaceLineId: String(cartLine.id),
    });
  }, []);

  const value = useMemo(
    () => ({
      openMealFromMenu,
      openMealEditLine,
      closeMealWizard,
    }),
    [openMealFromMenu, openMealEditLine, closeMealWizard]
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
