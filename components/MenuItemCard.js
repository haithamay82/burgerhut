import MenuMealPreviewCard from "@/components/MenuMealPreviewCard";
import SimpleMenuItemCard from "@/components/SimpleMenuItemCard";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

export default function MenuItemCard({ item, onOpenMealWizard }) {
  const isMeal = isMealWizardCategory(item?.category);
  if (isMeal) {
    return (
      <MenuMealPreviewCard item={item} onOpenWizard={onOpenMealWizard} />
    );
  }
  return <SimpleMenuItemCard item={item} />;
}
