const CHEDDAR_ID = "sauce_cheddar";
const STANDARD_EXTRA = 4;
const CHEDDAR_PRICE = 8;

/**
 * רוטב ראשון שאינו צ'דר — בחינם. כל רוטב סטנדרטי נוסף — 4₪. צ'דר תמיד 8₪.
 * הסדר הוא סדר הבחירה של הלקוח.
 *
 * @param {string[]} selectedOrder
 * @returns {{ total: number, details: { id: string, charge: number }[] }}
 */
export function computeSaucesCharge(selectedOrder) {
  let total = 0;
  let freeStandardUsed = false;
  const details = [];

  for (const id of selectedOrder) {
    if (id === CHEDDAR_ID) {
      total += CHEDDAR_PRICE;
      details.push({ id, charge: CHEDDAR_PRICE });
      continue;
    }
    if (!freeStandardUsed) {
      freeStandardUsed = true;
      details.push({ id, charge: 0 });
      continue;
    }
    total += STANDARD_EXTRA;
    details.push({ id, charge: STANDARD_EXTRA });
  }

  return { total, details };
}

/** מחיר שיתווסף אם מוסיפים את הרוטב בסוף הרשימה הנוכחית (להצגה על הכפתור). */
export function marginalSauceCharge(id, currentOrder) {
  if (currentOrder.includes(id)) return null;
  const next = [...currentOrder, id];
  const { details } = computeSaucesCharge(next);
  const row = details[details.length - 1];
  return row?.charge ?? 0;
}
