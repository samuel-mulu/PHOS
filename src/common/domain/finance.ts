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

/** Invoice money fields used by the shared balance rules. */
export interface InvoiceMoney {
  totalCents: number;
  paidCents: number;
  waivedCents?: number | null;
  deferredCents?: number | null;
}

/** Still owed on the invoice (includes approved "pay later" debt). */
export function invoiceBalance(inv: InvoiceMoney): number {
  return Math.max(0, inv.totalCents - inv.paidCents - (inv.waivedCents ?? 0));
}

/** Must be settled before the patient may leave the cashier. */
export function invoiceDueNow(inv: InvoiceMoney): number {
  return Math.max(0, invoiceBalance(inv) - (inv.deferredCents ?? 0));
}

/** Pay-later amount can never exceed what is still owed. */
export function clampDeferred(inv: InvoiceMoney): number {
  return Math.min(inv.deferredCents ?? 0, invoiceBalance(inv));
}

export type PayableInvoiceStatus = "ISSUED" | "PARTIALLY_PAID" | "PAID";

export function invoiceStatusFor(inv: InvoiceMoney): PayableInvoiceStatus {
  if (invoiceBalance(inv) <= 0) return "PAID";
  if (inv.paidCents > 0 || (inv.waivedCents ?? 0) > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}
