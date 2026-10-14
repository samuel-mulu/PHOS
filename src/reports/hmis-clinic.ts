/** Ethiopia HMIS clinic tables, mapped from PHOS doctor + lab records. */

export const HMIS_AGE_BANDS = [
  "<1yr",
  "1-4yr",
  "5-14yr",
  "15-29yr",
  "30-64yr",
  ">=65yr",
] as const;

export type HmisAgeBand = (typeof HMIS_AGE_BANDS)[number];

export type HmisSex = "M" | "F";

export type HmisLabRow = {
  test: string;
  op_neg: number;
  op_pos: number;
  ip_neg: number;
  ip_pos: number;
};

type LabRowDef = {
  test: string;
  codes: string[];
  keywords: string[];
};

/** Ministry lab lines. Codes win so HbA1c is not counted as Hemoglobin. */
export const HMIS_LAB_ROWS: LabRowDef[] = [
  { test: "Blood Film", codes: ["MAL"], keywords: ["blood film", "malaria smear", "blood smear"] },
  { test: "RDT test", codes: ["RDT"], keywords: ["rapid diagnostic"] },
  { test: "Stool exam", codes: ["STOOL"], keywords: ["stool", "ova"] },
  { test: "AFB", codes: ["AFB"], keywords: ["sputum afb"] },
  { test: "Urinalysis microscp", codes: ["UA"], keywords: ["urine microscopy"] },
  { test: "Urinalysis dipstick", codes: ["UASG", "UAPH", "UAPROT", "UAGLU", "UAKET"], keywords: ["dipstick"] },
  { test: "Widal test", codes: ["WIDAL"], keywords: ["widal"] },
  { test: "Rpr(vdrl)test", codes: ["VDRL", "RPR"], keywords: ["vdrl", "rpr"] },
  { test: "H/pylori test", codes: ["HPYL"], keywords: ["pylori", "helicobacter"] },
  { test: "Hemoglobin", codes: ["HGB"], keywords: ["hemoglobin"] },
  { test: "Esr test", codes: ["ESR"], keywords: ["esr"] },
  { test: "Differential count", codes: ["NEU"], keywords: ["differential"] },
  { test: "Blood group test", codes: ["BG"], keywords: ["blood group"] },
  { test: "Gram stain test", codes: ["GRAM"], keywords: ["gram stain"] },
  { test: "Pregnancy (Hcg)test", codes: ["BHCG"], keywords: ["hcg", "pregnancy"] },
  { test: "Hepatitis b test", codes: ["HBSAG"], keywords: ["hepatitis b", "hbsag"] },
  { test: "Hepatitis c test", codes: ["HCV"], keywords: ["hepatitis c", "hcv"] },
  { test: "HIV test", codes: ["HIV"], keywords: ["hiv"] },
];

export function emptyLabRows(): HmisLabRow[] {
  return HMIS_LAB_ROWS.map((row) => ({
    test: row.test,
    op_neg: 0,
    op_pos: 0,
    ip_neg: 0,
    ip_pos: 0,
  }));
}

export function matchHmisLabTest(test: {
  code: string;
  name: string;
  category?: string | null;
}): string | null {
  const code = test.code.trim().toUpperCase();
  for (const row of HMIS_LAB_ROWS) {
    if (row.codes.includes(code)) return row.test;
  }
  const hay = `${test.name} ${test.category ?? ""}`.toLowerCase();
  for (const row of HMIS_LAB_ROWS) {
    if (row.keywords.some((kw) => hay.includes(kw))) return row.test;
  }
  return null;
}

export function isQualitativePositive(
  value: string | null | undefined,
  flag?: string | null,
): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return false;
  if (
    /^(neg|negative|non[- ]?reactive|nr|not detected|normal|nil|none|nad)$/i.test(
      v,
    )
  ) {
    return false;
  }
  if (
    /(positive|reactive|detected|falciparum|vivax|ova|parasite|\+\+|1\+|2\+|3\+)/.test(
      v,
    )
  ) {
    return true;
  }
  return flag === "ABNORMAL" || flag === "CRITICAL";
}

export function ageYearsAt(dob: Date | null | undefined, at: Date): number | null {
  if (!dob) return null;
  let years = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) years -= 1;
  return years < 0 ? null : years;
}

export function ageBand(years: number | null): HmisAgeBand {
  if (years == null) return "15-29yr";
  if (years < 1) return "<1yr";
  if (years < 5) return "1-4yr";
  if (years < 15) return "5-14yr";
  if (years < 30) return "15-29yr";
  if (years < 65) return "30-64yr";
  return ">=65yr";
}

export function fpAgeKey(years: number | null): string | null {
  if (years == null || years < 10) return null;
  if (years <= 14) return "10-14";
  if (years <= 19) return "15-19";
  if (years <= 24) return "20-24";
  if (years <= 29) return "25-29";
  if (years <= 49) return "30-49";
  return null;
}

export function sexHmis(sex: string | null | undefined): HmisSex {
  return sex === "FEMALE" ? "F" : "M";
}

export function emptyAgeGrid(): Record<HmisAgeBand, { M: number; F: number }> {
  return {
    "<1yr": { M: 0, F: 0 },
    "1-4yr": { M: 0, F: 0 },
    "5-14yr": { M: 0, F: 0 },
    "15-29yr": { M: 0, F: 0 },
    "30-64yr": { M: 0, F: 0 },
    ">=65yr": { M: 0, F: 0 },
  };
}

export function classifySurveillance(label: string, years: number | null) {
  const d = label.toLowerCase();
  return {
    malariaPF: d.includes("malaria") && (d.includes("falciparum") || !d.includes("vivax")),
    malariaPV: d.includes("malaria") && d.includes("vivax"),
    meningitis: d.includes("meningitis"),
    dysentery: d.includes("dysentery") || d.includes("shigella"),
    typhoid: d.includes("typhoid"),
    relapsingFever: d.includes("relapsing"),
    epidemicTyphus: d.includes("typhus"),
    scabies: d.includes("scabies"),
    samUnder5:
      years != null &&
      years < 5 &&
      (d.includes("severe acute malnutrition") || /\bsam\b/.test(d)),
  };
}
