import {
  calculateExpectedCash,
  calculateInvoiceTotals,
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
