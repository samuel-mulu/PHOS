import {
  formatAutoPatientNumber,
  isSanePatientNumberNumeric,
  normalizePatientNumber,
  parsePatientNumberNumeric,
} from "./patient-number.util";

describe("patient-number.util", () => {
  it("normalizes clinic card variants to HC", () => {
    expect(normalizePatientNumber("HC15274")).toBe("HC15274");
    expect(normalizePatientNumber("hc15274")).toBe("HC15274");
    expect(normalizePatientNumber("Hc015274")).toBe("HC15274");
    expect(normalizePatientNumber("15274")).toBe("HC15274");
    expect(normalizePatientNumber("Hcm123")).toBe("HC123");
    expect(normalizePatientNumber("HV99")).toBe("HC99");
  });

  it("rejects unusable ids", () => {
    expect(normalizePatientNumber("")).toBeNull();
    expect(normalizePatientNumber("abc")).toBeNull();
    expect(normalizePatientNumber("HC")).toBeNull();
  });

  it("formats auto numbers and parses numeric part", () => {
    expect(formatAutoPatientNumber(19870)).toBe("HC019870");
    expect(parsePatientNumberNumeric("HC019870")).toBe(19870);
    expect(isSanePatientNumberNumeric(19869)).toBe(true);
    expect(isSanePatientNumberNumeric(166397)).toBe(false);
  });
});
