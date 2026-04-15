import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import MealCustomizeWizard from "@/components/MealCustomizeWizard";
import { useCart } from "@/hooks/useCart";
import { useLocale } from "@/contexts/LocaleContext";
import {
  simulateCartAfterAdd,
  pattyInsufficientAddToCartMessage,
  validatePattyStockForSimulatedCart,
} from "@/utils/pattyStockClient";
import {
  buildSpecialBurgerCartLine,
  defaultSaladsForSpecialProductId,
} from "@/utils/specialBurgerDefaults";

const MealWizardContext = createContext(null);

export function MealWizardProvider({ children }) {
  const [wizard, setWizard] = useState(null);
  const { t, locale } = useLocale();
  const { addItem, items: cartItems } = useCart();

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

  const addSpecialMealQuick = useCallback(
    async (item) => {
      if (!item || item.category !== "specials") return;
      const saladIds = defaultSaladsForSpecialProductId(item.id);
      const linePayload = buildSpecialBurgerCartLine({
        item,
        selectedSaladIds: saladIds,
        quantity: 1,
        t,
        locale,
        burgerDoneness: null,
      });
      const afterMerge = simulateCartAfterAdd(cartItems, linePayload);
      const pattyCheck = await validatePattyStockForSimulatedCart(
        afterMerge,
        item.id
      );
      if (!pattyCheck.ok) {
        if (typeof window !== "undefined") {
          window.alert(pattyInsufficientAddToCartMessage(t, pattyCheck));
        }
        return;
      }
      addItem(linePayload);
    },
    [addItem, cartItems, locale, t]
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
