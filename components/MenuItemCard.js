import MenuMealPreviewCard from "@/components/MenuMealPreviewCard";
import SimpleMenuItemCard from "@/components/SimpleMenuItemCard";
import { isMealWizardCategory } from "@/utils/menuMealCategories";

export default function MenuItemCard({
  item,
  onOpenMealWizard,
  onOpenSpecialSaladsEdit,
}) {
  const isMeal = isMealWizardCategory(item?.category);
  if (isMeal) {
    return (
      <MenuMealPreviewCard
        item={item}
        onOpenWizard={onOpenMealWizard}
        onOpenSpecialSaladsEdit={onOpenSpecialSaladsEdit}
      />
    );
  }
  return <SimpleMenuItemCard item={item} />;
}
