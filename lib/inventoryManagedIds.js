import { getCatalogEditor } from "@/lib/catalogStore";
import { managedMenuProductIdsFromEditor } from "@/utils/mergeMenuCatalog";
import {
  BURGER_TOPPING_IDS,
  INVENTORY_MANAGED_SALAD_IDS,
} from "@/utils/menuData";

/**
 * מזהים שמותר לסמן כלא זמינים / לחשב חסימה אוטומטית — תפריט מאוחד + תוספות/סלטים מנוהלים.
 */
export async function getManagedInventoryProductIds() {
  const editor = await getCatalogEditor();
  const allowed = managedMenuProductIdsFromEditor(editor);
  for (const tid of BURGER_TOPPING_IDS) {
    allowed.add(tid);
  }
  for (const sid of INVENTORY_MANAGED_SALAD_IDS) {
    allowed.add(sid);
  }
  return allowed;
}
