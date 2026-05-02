import { getCatalogEditor } from "@/lib/catalogStore";
import {
  allBurgerToppingIdsFromEditor,
  managedMenuProductIdsFromEditor,
} from "@/utils/mergeMenuCatalog";
import { INVENTORY_MANAGED_SALAD_IDS } from "@/utils/menuData";

/**
 * מזהים שמותר לסמן כלא זמינים / לחשב חסימה אוטומטית — תפריט מאוחד + תוספות/סלטים מנוהלים.
 */
export async function getManagedInventoryProductIds() {
  const editor = await getCatalogEditor();
  const allowed = managedMenuProductIdsFromEditor(editor);
  for (const tid of allBurgerToppingIdsFromEditor(editor)) {
    allowed.add(tid);
  }
  for (const sid of INVENTORY_MANAGED_SALAD_IDS) {
    allowed.add(sid);
  }
  return allowed;
}
