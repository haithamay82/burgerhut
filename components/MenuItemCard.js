import MenuMealPreviewCard from "@/components/MenuMealPreviewCard";
import SimpleMenuItemCard from "@/components/SimpleMenuItemCard";

export default function MenuItemCard({ item, onOpenMealWizard }) {
  const isMeal =
    item.category === "burgers" || item.category === "crispy";
  if (isMeal) {
    return (
      <MenuMealPreviewCard item={item} onOpenWizard={onOpenMealWizard} />
    );
  }
  return <SimpleMenuItemCard item={item} />;
}
