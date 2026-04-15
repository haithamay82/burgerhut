import MenuMealPreviewCard from "@/components/MenuMealPreviewCard";
import SimpleMenuItemCard from "@/components/SimpleMenuItemCard";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

export default function MenuItemCard({
  item,
  onOpenMealWizard,
  onOpenSpecialSaladsEdit,
  onSpecialQuickAdd,
}) {
  const isMeal = isMealWizardCategory(item?.category);
  if (isMeal) {
    return (
      <MenuMealPreviewCard
        item={item}
        onOpenWizard={onOpenMealWizard}
        onOpenSpecialSaladsEdit={onOpenSpecialSaladsEdit}
        onSpecialQuickAdd={onSpecialQuickAdd}
      />
    );
  }
  return <SimpleMenuItemCard item={item} />;
}
