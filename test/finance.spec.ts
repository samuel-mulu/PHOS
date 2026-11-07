import {
  calculateExpectedCash,
  calculateInvoiceTotals,
  clampDeferred,
  invoiceBalance,
  invoiceDueNow,
  invoiceStatusFor,
} from "../src/common/domain/finance";
describe("finance domain rules", () => {
  it("calculates invoice amounts in integer cents", () => {
    expect(
      calculateInvoiceTotals(
        [
          { quantity: 2, unitPriceCents: 1250 },
          { quantity: 1, unitPriceCents: 30000 },
        ],
        500,
      ),
    ).toEqual({ subtotalCents: 32500, totalCents: 32000 });
  });
  it("rejects a discount above subtotal", () => {
    expect(() =>
      calculateInvoiceTotals([{ quantity: 1, unitPriceCents: 100 }], 101),
    ).toThrow(RangeError);
  });
  it("reconciles opening float, cash receipts and refunds", () => {
    expect(calculateExpectedCash(50000, 125000, 10000)).toBe(165000);
  });
});

describe("partial / pay later / waive balance rules", () => {
  const inv = { totalCents: 50000, paidCents: 0, waivedCents: 0, deferredCents: 0 };

  it("unpaid invoice is fully due now", () => {
    expect(invoiceBalance(inv)).toBe(50000);
    expect(invoiceDueNow(inv)).toBe(50000);
    expect(invoiceStatusFor(inv)).toBe("ISSUED");
  });

  it("partial payment + send back: rest is debt, nothing due now", () => {
    const paid = { ...inv, paidCents: 20000, deferredCents: 30000 };
    expect(invoiceBalance(paid)).toBe(30000);
    expect(invoiceDueNow(paid)).toBe(0);
    expect(invoiceStatusFor(paid)).toBe("PARTIALLY_PAID");
  });

  it("partial payment + keep waiting: rest is still due now", () => {
    const paid = { ...inv, paidCents: 20000 };
    expect(invoiceDueNow(paid)).toBe(30000);
  });

  it("waive reduces balance and clamps pay-later debt", () => {
    const w = { ...inv, paidCents: 20000, deferredCents: 30000, waivedCents: 10000 };
    expect(invoiceBalance(w)).toBe(20000);
    expect(clampDeferred(w)).toBe(20000);
    expect(invoiceStatusFor({ ...w, waivedCents: 30000 })).toBe("PAID");
  });

  it("new charge after pay later is due now; old debt stays deferred", () => {
    const later = { totalCents: 60000, paidCents: 0, waivedCents: 0, deferredCents: 50000 };
    expect(invoiceDueNow(later)).toBe(10000);
    expect(invoiceBalance(later)).toBe(60000);
  });

  it("refund back to zero paid returns to ISSUED", () => {
    expect(invoiceStatusFor({ ...inv, paidCents: 0 })).toBe("ISSUED");
    expect(invoiceStatusFor({ ...inv, paidCents: 50000 })).toBe("PAID");
  });
});
