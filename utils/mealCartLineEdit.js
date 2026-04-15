import { cartLineProductId } from "@/hooks/useCart";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

/** בורגר / קריספי / מיוחדים בלבד — לא צ'יפס, שתייה וכו׳ */
export function isEditableMealCartLine(line, menuItems) {
  if (!line || !Array.isArray(menuItems)) return false;
  const pid = cartLineProductId(line);
  if (!pid) return false;
  const cat =
    line.menuCategory ||
    menuItems.find((m) => m && m.id === pid)?.category ||
    "";
  if (!isMealWizardCategory(cat)) return false;
  return menuItems.some((m) => m && m.id === pid);
}

export function mealCatalogItemForCartLine(line, menuItems) {
  if (!line || !Array.isArray(menuItems)) return null;
  const pid = cartLineProductId(line);
  return menuItems.find((m) => m && m.id === pid) || null;
}
