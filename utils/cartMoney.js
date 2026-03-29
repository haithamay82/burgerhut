export function safePrice(item) {
  const n = Number(item?.price);
  return Number.isFinite(n) ? n : 0;
}

export function safeQty(item) {
  const n = Number(item?.quantity);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function lineTotal(item) {
  return safePrice(item) * safeQty(item);
}

export function sumCartLines(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function formatIls(amount) {
  const n = Number(amount);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
