/**
 * @param {{ id: string, nameHe?: string, nameAr?: string }} item
 * @param {(k: string) => string} t
 * @param {'he'|'ar'} locale
 */
export function menuItemName(item, t, locale) {
  if (locale === "ar" && item.nameAr) return item.nameAr;
  if (locale === "he" && item.nameHe) return item.nameHe;
  if (item.nameHe) return item.nameHe;
  if (item.nameAr) return item.nameAr;
  const key = `menu.${item.id}.name`;
  const v = t(key);
  return v === key ? item.id : v;
}

/**
 * @param {{ id: string, descHe?: string, descAr?: string }} item
 * @param {(k: string) => string} t
 * @param {'he'|'ar'} locale
 */
export function menuItemDesc(item, t, locale) {
  if (locale === "ar" && item.descAr) return item.descAr;
  if (locale === "he" && item.descHe) return item.descHe;
  if (item.descHe) return item.descHe;
  if (item.descAr) return item.descAr;
  const key = `menu.${item.id}.desc`;
  const v = t(key);
  return v === key ? "" : v;
}
