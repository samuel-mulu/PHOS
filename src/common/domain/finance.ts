export interface PriceLine {
  quantity: number;
  unitPriceCents: number;
}
export function calculateInvoiceTotals(
  items: PriceLine[],
  discountCents: number,
) {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  if (discountCents < 0 || discountCents > subtotalCents)
    throw new RangeError("Invalid discount");
  return { subtotalCents, totalCents: subtotalCents - discountCents };
}
export function calculateExpectedCash(
  openingFloatCents: number,
  receivedCents: number,
  refundedCents: number,
) {
  return openingFloatCents + receivedCents - refundedCents;
}
