export const PAYMENT_METHODS = [
  { id: "cash" },
  { id: "card" },
  { id: "bit" },
];

/** @deprecated Card payments use POST /api/create-payment (Hyp Relay). */
export function getPaymentRedirectUrl() {
  return null;
}
