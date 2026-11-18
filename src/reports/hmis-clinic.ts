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

export const FP_AGE_KEYS = ["10-14", "15-19", "20-24", "25-29", "30-49"] as const;
export type FpAgeKey = (typeof FP_AGE_KEYS)[number];

export const FP_METHOD_KEYS = [
  "Oral contraceptives",
  "Injectables",
  "Implants",
  "IUD",
  "Vasectomy",
  "Tubal ligation",
  "Others",
] as const;
export type FpMethodKey = (typeof FP_METHOD_KEYS)[number];

export const ANC_AGE_KEYS = ["10-14", "15-19", ">=20"] as const;
export type AncAgeKey = (typeof ANC_AGE_KEYS)[number];

export const OPD_AGE_BANDS = [
  "<5",
  "5-10",
  "11-19",
  "20-29",
  "30-45",
  "46-65",
  ">=66",
] as const;
export type OpdAgeBand = (typeof OPD_AGE_BANDS)[number];

export type HmisLabRow = {
  test: string;
  op_neg: number;
  op_pos: number;
  ip_neg: number;
  ip_pos: number;
  /** No positive/negative meaning. The count is included under Others. */
  countOnly: boolean;
  performed: number;
};

export type HmisWeeklyRow = {
  indicator: string;
  cases: number | null;
  deaths: number | null;
};

export type HmisMorbidityRow = {
  name: string;
  total: number;
  bands: Record<HmisAgeBand, { M: number; F: number }>;
};

type LabRowDef = {
  test: string;
  codes: string[];
  keywords: string[];
  countOnly: boolean;
};

/** Ministry lab lines. Codes win so HbA1c is not counted as Hemoglobin. */
export const HMIS_LAB_ROWS: LabRowDef[] = [
  { test: "Blood Film", codes: ["MAL"], keywords: ["blood film", "malaria smear", "blood smear"], countOnly: false },
  { test: "RDT test", codes: ["RDT"], keywords: ["rapid diagnostic"], countOnly: false },
  { test: "Stool exam", codes: ["STOOL"], keywords: ["stool", "ova"], countOnly: false },
  { test: "AFB", codes: ["AFB"], keywords: ["sputum afb"], countOnly: false },
  { test: "Urinalysis microscp", codes: ["UA"], keywords: ["urine microscopy"], countOnly: false },
  { test: "Urinalysis dipstick", codes: ["UASG", "UAPH", "UAPROT", "UAGLU", "UAKET"], keywords: ["dipstick"], countOnly: false },
  { test: "Widal test", codes: ["WIDAL"], keywords: ["widal"], countOnly: false },
  { test: "Rpr(vdrl)test", codes: ["VDRL", "RPR"], keywords: ["vdrl", "rpr"], countOnly: false },
  { test: "H/pylori test", codes: ["HPYL"], keywords: ["pylori", "helicobacter"], countOnly: false },
  { test: "Hemoglobin", codes: ["HGB"], keywords: ["hemoglobin"], countOnly: true },
  { test: "Esr test", codes: ["ESR"], keywords: ["esr"], countOnly: true },
  { test: "Differential count", codes: ["NEU"], keywords: ["differential"], countOnly: true },
  { test: "Blood group test", codes: ["BG"], keywords: ["blood group"], countOnly: true },
  { test: "Gram stain test", codes: ["GRAM"], keywords: ["gram stain"], countOnly: false },
  { test: "Pregnancy (Hcg)test", codes: ["BHCG"], keywords: ["hcg", "pregnancy"], countOnly: false },
  { test: "Hepatitis b test", codes: ["HBSAG"], keywords: ["hepatitis b", "hbsag"], countOnly: false },
  { test: "Hepatitis c test", codes: ["HCV"], keywords: ["hepatitis c", "hcv"], countOnly: false },
];

export const HMIS_OTHERS_ROW = "Others";

const NCOD_ROWS: { name: string; keywords: string[]; priority: number }[] = [
  { name: "Amoebiasis (Acute Amoebic Dysentery)", keywords: ["amoebic dysentery", "acute amoebic"], priority: 100 },
  { name: "Malaria (Plasmodium Vivax malaria)", keywords: ["vivax"], priority: 95 },
  { name: "Malaria (Plasmodium falciparum malaria)", keywords: ["falciparum", "malaria"], priority: 90 },
  { name: "Tuberculosis of lung, confirmed by sputum microscopy", keywords: ["tuberculosis", "pulmonary tb"], priority: 90 },
  { name: "Tinea corporis", keywords: ["tinea corporis", "tinea"], priority: 88 },
  { name: "Seborrhoeic dermatitis", keywords: ["seborrh"], priority: 86 },
  { name: "Atopic dermatitis", keywords: ["atopic"], priority: 86 },
  { name: "Dermatitis (allergic contact dermatitis)", keywords: ["contact dermatitis", "allergic contact"], priority: 84 },
  { name: "Dermatophytoses", keywords: ["dermatophyt"], priority: 84 },
  { name: "Pyelonephritis", keywords: ["pyelo"], priority: 84 },
  { name: "Neonatal sepsis", keywords: ["neonatal sepsis", "sepsis of newborn", "newborn sepsis"], priority: 84 },
  { name: "Snake bite", keywords: ["snake"], priority: 84 },
  { name: "HIV disease resulting in encephalopathy", keywords: ["encephalopathy"], priority: 84 },
  { name: "Rheumatoid arthritis", keywords: ["rheumatoid"], priority: 82 },
  { name: "Juvenile arthritis", keywords: ["juvenile arthritis"], priority: 80 },
  { name: "Syphilis", keywords: ["syphilis"], priority: 80 },
  { name: "Diarrhea (Shigella)", keywords: ["shigella", "dysentery"], priority: 80 },
  { name: "Giardiasis", keywords: ["giardia"], priority: 80 },
  { name: "Typhoid fever", keywords: ["typhoid"], priority: 80 },
  { name: "Tonsillitis (acute pharyngitis)", keywords: ["tonsillitis", "pharyngitis"], priority: 78 },
  { name: "Acute bronchitis", keywords: ["bronchitis"], priority: 78 },
  { name: "Bacterial pneumonia", keywords: ["pneumonia"], priority: 78 },
  { name: "Migraine", keywords: ["migraine"], priority: 78 },
  { name: "Excessive vomiting in pregnancy", keywords: ["hyperemesis", "vomiting in pregnancy", "vomiting pregnancy"], priority: 78 },
  { name: "Pregnancy examination confirmed", keywords: ["confirmed pregnancy", "pregnancy confirmed"], priority: 76 },
  { name: "Pregnancy examination and test", keywords: ["pregnancy test", "pregnancy examination"], priority: 74 },
  { name: "Abortion (spontaneous abortion)", keywords: ["abortion"], priority: 74 },
  { name: "Antepartum hemorrhage", keywords: ["antepartum", "ante partum", "ante-partum"], priority: 70 },
  { name: "Maternal care for malpresentation", keywords: ["malpresentation", "mal presentation"], priority: 74 },
  { name: "Infection of obstetric surgical wound", keywords: ["obstetric wound", "surgical wound", "episiotomy infection"], priority: 74 },
  { name: "Irregular menstruation", keywords: ["irregular menstruation", "irregular menses"], priority: 74 },
  { name: "Dysmenorrhoea", keywords: ["dysmen"], priority: 74 },
  { name: "Excessive and frequent menstruation", keywords: ["menorrhagia", "excessive menstruation"], priority: 74 },
  { name: "Burn of wrist and hand", keywords: ["burn"], priority: 70 },
  { name: "Injury of head, eye and orbit", keywords: ["head injury", "orbit"], priority: 72 },
  { name: "Injury of ankle and foot", keywords: ["ankle", "foot injury"], priority: 68 },
  { name: "Injury of wrist and hand", keywords: ["wrist", "hand injury"], priority: 66 },
  { name: "Injury of lower leg", keywords: ["lower leg", "leg injury"], priority: 66 },
  { name: "Injury of forearm", keywords: ["forearm", "fore arm"], priority: 66 },
  { name: "Schistosomiasis", keywords: ["schisto"], priority: 70 },
  { name: "Taeniasis", keywords: ["taenia", "tapeworm"], priority: 70 },
  { name: "Helminthiasis", keywords: ["helminth", "intestinal parasite", "worm"], priority: 60 },
  { name: "Urinary tract infection", keywords: ["urinary tract", "uti"], priority: 60 },
  { name: "Acute upper respiratory infection", keywords: ["upper respiratory", "urti", "respiratory infection"], priority: 50 },
  { name: "Gastroenteritis and colitis", keywords: ["gastroenteritis", "colitis"], priority: 60 },
  { name: "Bacterial intestinal infection", keywords: ["intestinal infection"], priority: 50 },
  { name: "Sexually transmitted disease", keywords: ["sexually transmitted", "sti"], priority: 50 },
  { name: "Dermatitis, unspecified", keywords: ["dermatitis"], priority: 40 },
  { name: "Injury, unspecified", keywords: ["injury", "trauma"], priority: 30 },
  { name: "Gastritis, unspecified", keywords: ["gastritis"], priority: 50 },
  { name: "Amoebiasis (intestine)", keywords: ["amoebiasis", "amoeba"], priority: 55 },
  { name: "Hypertension", keywords: ["hypertension", "htn"], priority: 50 },
  { name: "Post traumatic wound infection", keywords: ["wound infection", "post traumatic", "post-traumatic"], priority: 60 },
  { name: "Asthma", keywords: ["asthma"], priority: 50 },
  { name: "Conjunctivitis", keywords: ["conjunctiv"], priority: 50 },
  { name: "Mumps", keywords: ["mumps"], priority: 50 },
  { name: "Myalgia", keywords: ["myalgia"], priority: 50 },
  { name: "Herpes zoster", keywords: ["zoster", "shingles"], priority: 50 },
  { name: "Impetigo", keywords: ["impetigo"], priority: 50 },
  { name: "Pulpitis", keywords: ["pulpitis", "pulpits"], priority: 50 },
  { name: "Scabies", keywords: ["scabies"], priority: 50 },
  { name: "Laboratory examination", keywords: ["laboratory examination", "lab examination"], priority: 50 },
  { name: "Inflammatory disorders of breast", keywords: ["mastitis", "breast abscess", "inflammatory breast"], priority: 50 },
  { name: "Allergy, unspecified", keywords: ["allergy", "allergic"], priority: 35 },
  { name: "Common cold", keywords: ["common cold", "coryza"], priority: 50 },
  { name: "General medical examination", keywords: ["general medical", "medical examination", "check up", "checkup"], priority: 45 },
  { name: "Croup", keywords: ["croup", "laryngitis"], priority: 55 },
  { name: "Cellulitis", keywords: ["cellulitis", "cellulites"], priority: 50 },
  { name: "Candidiasis", keywords: ["candid"], priority: 50 },
  { name: "Acute gingivitis", keywords: ["gingivitis"], priority: 50 },
  { name: "Urticaria", keywords: ["urticaria"], priority: 50 },
  { name: "Anemia, unspecified", keywords: ["anemia", "anaemia"], priority: 50 },
  { name: "Headache", keywords: ["headache"], priority: 40 },
  { name: "Otitis media", keywords: ["otitis"], priority: 50 },
  { name: "Chalazion", keywords: ["chalazion"], priority: 50 },
  { name: "Enlarged lymph nodes", keywords: ["lymph"], priority: 40 },
  { name: "Anal fissure", keywords: ["anal fissure"], priority: 50 },
  { name: "Animal bite", keywords: ["animal bite", "dog bite", "mammal bite"], priority: 50 },
  { name: "Impacted cerumen", keywords: ["cerumen", "ear wax"], priority: 50 },
  { name: "Epilepsy", keywords: ["epilepsy"], priority: 50 },
  { name: "Dental caries", keywords: ["dental caries", "dental", "caries"], priority: 45 },
  { name: "Oral thrush", keywords: ["thrush", "oral trash"], priority: 55 },
];

export const NCOD_NAMES = [
  "Gastritis, unspecified",
  "Amoebiasis (intestine)",
  "Dermatitis, unspecified",
  "Atopic dermatitis",
  "Dermatitis (allergic contact dermatitis)",
  "Dermatophytoses",
  "Hypertension",
  "Post traumatic wound infection",
  "Tonsillitis (acute pharyngitis)",
  "Acute upper respiratory infection",
  "Urinary tract infection",
  "Bacterial intestinal infection",
  "Malaria (Plasmodium Vivax malaria)",
  "Malaria (Plasmodium falciparum malaria)",
  "Typhoid fever",
  "Asthma",
  "Sexually transmitted disease",
  "Conjunctivitis",
  "Mumps",
  "Myalgia",
  "Pyelonephritis",
  "Herpes zoster",
  "Impetigo",
  "Pulpitis",
  "Scabies",
  "Acute bronchitis",
  "Burn of wrist and hand",
  "Laboratory examination",
  "Pregnancy examination and test",
  "Pregnancy examination confirmed",
  "Inflammatory disorders of breast",
  "Allergy, unspecified",
  "Giardiasis",
  "Common cold",
  "Diarrhea (Shigella)",
  "Gastroenteritis and colitis",
  "General medical examination",
  "Schistosomiasis",
  "Taeniasis",
  "Bacterial pneumonia",
  "Croup",
  "Cellulitis",
  "Candidiasis",
  "Injury of ankle and foot",
  "Injury of wrist and hand",
  "Injury of lower leg",
  "Injury, unspecified",
  "Injury of head, eye and orbit",
  "Injury of forearm",
  "Syphilis",
  "Irregular menstruation",
  "Excessive and frequent menstruation",
  "Abortion (spontaneous abortion)",
  "Amoebiasis (Acute Amoebic Dysentery)",
  "Tuberculosis of lung, confirmed by sputum microscopy",
  "Acute gingivitis",
  "Urticaria",
  "Dysmenorrhoea",
  "Anemia, unspecified",
  "Headache",
  "Helminthiasis",
  "Otitis media",
  "Infection of obstetric surgical wound",
  "Migraine",
  "Seborrhoeic dermatitis",
  "Chalazion",
  "Enlarged lymph nodes",
  "Anal fissure",
  "Snake bite",
  "Animal bite",
  "Antepartum hemorrhage",
  "Impacted cerumen",
  "Juvenile arthritis",
  "Epilepsy",
  "Dental caries",
  "Tinea corporis",
  "Oral thrush",
  "Neonatal sepsis",
  "Excessive vomiting in pregnancy",
  "Maternal care for malpresentation",
  "Rheumatoid arthritis",
  "HIV disease resulting in encephalopathy",
  "Other",
] as const;

const IMMEDIATE_DISEASES: { label: string; keywords: string[] }[] = [
  { label: "AFP/Polio", keywords: ["acute flaccid", "afp", "poliomyelitis"] },
  { label: "Anthrax", keywords: ["anthrax"] },
  { label: "Cholera (AWD)", keywords: ["cholera", "acute watery diarrhea", "acute watery diarrhoea"] },
  { label: "Dracunculiasis (Guinea worm)", keywords: ["guinea worm", "dracuncul"] },
  { label: "Measles", keywords: ["measles"] },
  { label: "Neonatal tetanus", keywords: ["neonatal tetanus"] },
  { label: "Pandemic influenza", keywords: ["pandemic influenza"] },
  { label: "Rabies", keywords: ["rabies"] },
  { label: "SARS", keywords: ["sars"] },
  { label: "Smallpox", keywords: ["smallpox", "small pox"] },
  { label: "Viral haemorrhagic fever", keywords: ["haemorrhagic fever", "hemorrhagic fever", "ebola"] },
  { label: "Yellow fever", keywords: ["yellow fever"] },
];

export function emptyLabRows(): HmisLabRow[] {
  return HMIS_LAB_ROWS.map((row) => ({
    test: row.test,
    op_neg: 0,
    op_pos: 0,
    ip_neg: 0,
    ip_pos: 0,
    countOnly: row.countOnly,
    performed: 0,
  }));
}

export function emptyOthersRow(): HmisLabRow {
  return {
    test: HMIS_OTHERS_ROW,
    op_neg: 0,
    op_pos: 0,
    ip_neg: 0,
    ip_pos: 0,
    countOnly: true,
    performed: 0,
  };
}

export function matchHmisLabTest(test: {
  code: string;
  name: string;
  category?: string | null;
}): { test: string; countOnly: boolean } | null {
  const code = test.code.trim().toUpperCase();
  for (const row of HMIS_LAB_ROWS) {
    if (row.codes.includes(code)) return { test: row.test, countOnly: row.countOnly };
  }
  const hay = `${test.name} ${test.category ?? ""}`.toLowerCase();
  for (const row of HMIS_LAB_ROWS) {
    if (row.keywords.some((kw) => hay.includes(kw))) {
      return { test: row.test, countOnly: row.countOnly };
    }
  }
  return null;
}

export function isHivLabTest(test: {
  code: string;
  name: string;
  category?: string | null;
}): boolean {
  if (test.code.trim().toUpperCase() === "HIV") return true;
  return `${test.name} ${test.category ?? ""}`.toLowerCase().includes("hiv");
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

export type MalariaSpecies = "pf" | "pv" | "both" | "unspecified" | "negative";

export function malariaSpecies(
  value: string | null | undefined,
  flag?: string | null,
): MalariaSpecies {
  if (!isQualitativePositive(value, flag)) return "negative";
  const v = (value ?? "").toLowerCase();
  const pf = v.includes("falciparum") || /\bpf\b/.test(v);
  const pv = v.includes("vivax") || /\bpv\b/.test(v);
  if (pf && pv) return "both";
  if (pv) return "pv";
  if (pf) return "pf";
  return "unspecified";
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

export function fpAgeKey(years: number | null): FpAgeKey | null {
  if (years == null || years < 10 || years > 49) return null;
  if (years <= 14) return "10-14";
  if (years <= 19) return "15-19";
  if (years <= 24) return "20-24";
  if (years <= 29) return "25-29";
  return "30-49";
}

export function ancAgeKey(years: number | null): AncAgeKey {
  if (years != null && years <= 14) return "10-14";
  if (years != null && years <= 19) return "15-19";
  return ">=20";
}

export function opdAgeBand(years: number | null): OpdAgeBand {
  if (years == null) return "20-29";
  if (years < 5) return "<5";
  if (years <= 10) return "5-10";
  if (years <= 19) return "11-19";
  if (years <= 29) return "20-29";
  if (years <= 45) return "30-45";
  if (years <= 65) return "46-65";
  return ">=66";
}

export function fpMethodKey(method: string | null | undefined): FpMethodKey {
  switch (method) {
    case "COC":
    case "POP":
      return "Oral contraceptives";
    case "INJECTABLE_DMPA":
      return "Injectables";
    case "IMPLANT":
      return "Implants";
    case "IUCD":
      return "IUD";
    case "VASECTOMY":
      return "Vasectomy";
    case "TUBAL_LIGATION":
      return "Tubal ligation";
    default:
      return "Others";
  }
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

export function emptySexMap<T extends string>(keys: readonly T[]): Record<T, { M: number; F: number }> {
  return Object.fromEntries(keys.map((key) => [key, { M: 0, F: 0 }])) as Record<
    T,
    { M: number; F: number }
  >;
}

export function emptyCountMap<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function matchNcod(label: string): string {
  const d = label.toLowerCase();
  let best: { name: string; priority: number } | null = null;
  for (const row of NCOD_ROWS) {
    if (!row.keywords.some((kw) => d.includes(kw))) continue;
    if (!best || row.priority > best.priority) best = row;
  }
  return best?.name ?? "Other";
}

export function emptyMorbidities(): HmisMorbidityRow[] {
  return NCOD_NAMES.map((name) => ({
    name,
    total: 0,
    bands: emptyAgeGrid(),
  }));
}

export function classifySurveillance(label: string, years: number | null) {
  const d = label.toLowerCase();
  const malaria = d.includes("malaria") || d.includes("falciparum") || d.includes("vivax");
  return {
    malaria,
    malariaPF: malaria && (d.includes("falciparum") || !d.includes("vivax")),
    malariaPV: malaria && d.includes("vivax"),
    meningitis: d.includes("meningitis"),
    dysentery: d.includes("dysentery") || d.includes("shigella"),
    typhoid: d.includes("typhoid"),
    relapsingFever: d.includes("relapsing"),
    epidemicTyphus: d.includes("typhus"),
    scabies: d.includes("scabies"),
    hepaticVod: d.includes("veno-occlus") || d.includes("hepatic vod"),
    samUnder5:
      years != null &&
      years < 5 &&
      (d.includes("severe acute malnutrition") || /\bsam\b/.test(d)),
  };
}

export function matchImmediate(label: string): string | null {
  const d = label.toLowerCase();
  for (const row of IMMEDIATE_DISEASES) {
    if (row.keywords.some((kw) => d.includes(kw))) return row.label;
  }
  return null;
}

export function immediateDiseaseLabels(): string[] {
  return [
    ...IMMEDIATE_DISEASES.map((row) => row.label),
    "Perinatal and neonatal death",
  ];
}

export const NOT_RECORDED = [
  "Inpatient ward (this clinic has no admission register)",
  "Deaths, so every deaths column is left blank",
  "EPI doses, HPV, TT, and vaccine wastage",
  "ART regimens, PMTCT programme detail, and partner testing",
  "Nutrition programme (GMP, vitamin A, deworming, SAM treatment outcomes)",
  "Diabetes, hypertension, and cardiovascular risk cohorts",
  "Tracer drug availability and LQAS",
  "Syphilis and hepatitis treatment (testing is counted; treatment is not stored)",
];
