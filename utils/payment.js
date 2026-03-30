export const PAYMENT_METHODS = [
  { id: "cash" },
  { id: "card" },
  { id: "bit" },
];

/** @deprecated Card payments use POST /api/create-payment (Hyp Pay Protocol). */
export function getPaymentRedirectUrl() {
  return null;
}
