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

/** Invoice line used when spreading money over lines. */
export interface MoneyLine {
  id: string;
  totalCents: number;
}

/**
 * Lines not yet covered by paid, waived or pay-later money, with what remains.
 * Money is spread over lines in order (same rule as the frontend line states).
 */
export function unsettledItems<T extends MoneyLine>(
  inv: InvoiceMoney,
  items: T[],
): Array<T & { remainingCents: number }> {
  let covered = inv.paidCents + (inv.waivedCents ?? 0) + clampDeferred(inv);
  const out: Array<T & { remainingCents: number }> = [];
  for (const item of items) {
    const used = Math.min(covered, item.totalCents);
    covered -= used;
    const remaining = item.totalCents - used;
    if (remaining > 0) out.push({ ...item, remainingCents: remaining });
  }
  return out;
}
