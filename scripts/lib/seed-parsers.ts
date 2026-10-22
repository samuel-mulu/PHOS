/** Parsers for Firebase free-text → PHOS structured seed fields. */

export function parseBp(raw: string | undefined): {
  systolic?: number;
  diastolic?: number;
} {
  if (!raw?.trim()) return {};
  const m = raw.trim().match(/(\d+)\s*[\/\\]\s*(\d+)/);
  if (!m) return {};
  const systolic = Number(m[1]);
  const diastolic = Number(m[2]);
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return {};
  return { systolic, diastolic };
}

export function parseNum(raw: string | undefined): number | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const n = Number.parseFloat(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Map Firebase service label / payment service free-text → invoice item type. */
export function mapInvoiceItemType(
  service: string | undefined,
): "CONSULTATION" | "LAB" | "MEDICINE" | "PROCEDURE" | "OTHER" {
  const s = (service ?? "").toLowerCase();
  if (!s) return "OTHER";
  if (/\blab\b|cbc|ua\b|bg\b|urin|hormone|blood/.test(s)) return "LAB";
  if (/\bus\b|u\/s|ultrasound|uss\b/.test(s)) return "PROCEDURE";
  if (
    /ceftria|diclofen|mif|miso|depo|implanon|tramadol|plasil|cimet|dress|wound|sutur|circum|mva|delivery|injection|op\b/.test(
      s,
    )
  )
    return "MEDICINE";
  if (/consult|opd|exam|trauma|vct/.test(s)) return "CONSULTATION";
  return "OTHER";
}

export function mapPaymentMethod(
  method: string | undefined,
): "CASH" | "CARD" | "TELEBIRR" | "BANK_TRANSFER" | "INSURANCE" | "OTHER" {
  const m = (method ?? "").toLowerCase();
  if (m.includes("cash")) return "CASH";
  if (m.includes("telebirr") || m.includes("tele birr")) return "TELEBIRR";
  if (m.includes("bank") || m.includes("transfer")) return "BANK_TRANSFER";
  if (m.includes("card")) return "CARD";
  if (m.includes("insurance")) return "INSURANCE";
  return "OTHER";
}

export function mapAppointmentStatus(
  status: string | undefined,
): "SCHEDULED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW" {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return "CANCELLED";
  if (s.includes("complete") || s.includes("done")) return "COMPLETED";
  if (s.includes("check")) return "CHECKED_IN";
  if (s.includes("no") && s.includes("show")) return "NO_SHOW";
  return "SCHEDULED";
}

export function mapApptServiceCode(service: string | undefined): string | undefined {
  const s = (service ?? "").toUpperCase();
  if (!s) return undefined;
  if (s === "US" || s.includes("ULTRA")) return "USG";
  if (s.includes("LAB")) return "CLINIC_LAB";
  if (s.includes("OPD") || s.includes("CONSULT")) return "OPD";
  if (s.includes("MCH")) return "MCH";
  if (s.includes("FP")) return "FP";
  return "OPD";
}

const LAB_LABEL_TO_CODE: Array<{ match: RegExp; code: string }> = [
  { match: /hemoglobin|hgb|hb\b/i, code: "HGB" },
  { match: /hematocrit|hct/i, code: "HCT" },
  { match: /rbc count|rbc\b/i, code: "RBC" },
  { match: /wbc count|^wbc\b/i, code: "WBC" },
  { match: /platelet/i, code: "PLT" },
  { match: /\bmcv\b/i, code: "MCV" },
  { match: /\bmchc\b/i, code: "MCHC" },
  { match: /\bmch\b/i, code: "MCH" },
  { match: /neutrophil/i, code: "NEU" },
  { match: /lymphocyte/i, code: "LYM" },
  { match: /monocyte/i, code: "MON" },
  { match: /eosinophil/i, code: "EOS" },
  { match: /basophil/i, code: "BAS" },
  { match: /\bmpv\b/i, code: "MPV" },
  { match: /blood group|blood type|\bbg\b/i, code: "BG" },
  { match: /specific gravity/i, code: "UASG" },
  { match: /\bpH\b/i, code: "UAPH" },
  { match: /protein/i, code: "UAPROT" },
  { match: /glucose \(fasting\)|fasting glucose|^glucose/i, code: "GLU" },
  { match: /\bbun\b/i, code: "BUN" },
  { match: /creatinine/i, code: "CREAT" },
  { match: /sodium|\bna\b/i, code: "NA" },
  { match: /potassium|\bk\b/i, code: "K" },
  { match: /\balt\b|sgpt/i, code: "ALT" },
  { match: /\bast\b|sgot/i, code: "AST" },
  { match: /alkaline|alp\b/i, code: "ALP" },
  { match: /\bggt\b/i, code: "GGT" },
  { match: /total bilirubin/i, code: "TBILI" },
  { match: /direct bilirubin/i, code: "DBILI" },
  { match: /total cholesterol|cholesterol/i, code: "CHOL" },
  { match: /\bhdl\b/i, code: "HDL" },
  { match: /\bldl\b/i, code: "LDL" },
  { match: /triglyceride/i, code: "TG" },
  { match: /hbsag|hepatitis b/i, code: "HBsAg" },
  { match: /hepatitis c|anti-hcv|\bhcv\b/i, code: "HCV" },
  { match: /\bhiv\b/i, code: "HIV" },
  { match: /vdrl|rpr/i, code: "VDRL" },
  { match: /malaria|blood film/i, code: "MAL" },
  { match: /stool|ova/i, code: "STOOL" },
  { match: /hba1c|glycated/i, code: "HBA1C" },
  { match: /vitamin d/i, code: "VITD" },
  { match: /\btsh\b/i, code: "TSH" },
  { match: /free t4|ft4/i, code: "FT4" },
  { match: /\bt3\b/i, code: "T3" },
  { match: /\bt4\b/i, code: "T4" },
  { match: /\bfsh\b/i, code: "FSH" },
  { match: /\blh\b/i, code: "LH" },
  { match: /bhcg|b hcg|hcg|pregnancy/i, code: "BHCG" },
  { match: /urin/i, code: "UA" },
];

export type ParsedLabAnalyte = {
  labTestCode: string;
  value: string;
  unit?: string;
  label: string;
};

/**
 * Extract filled analyte cells from Firebase lab sheet text.
 * Patterns: [___54___], [ 12.3 ], BG=O+, plain "Hemoglobin: 12.5"
 */
export function parseLabAnalytes(resultsText: string): ParsedLabAnalyte[] {
  const out: ParsedLabAnalyte[] = [];
  const seen = new Set<string>();

  // BG=O+ style doctor notes
  const bg = resultsText.match(/\bBG\s*=\s*([ABO]{1,2}[+-]?)/i);
  if (bg) {
    out.push({ labTestCode: "BG", value: bg[1]!.toUpperCase(), label: "Blood Group" });
    seen.add("BG");
  }

  const lines = resultsText.split(/\r?\n/);
  for (const line of lines) {
    // Bracket fill: Label: [___54___] unit
    const bracket = line.match(
      /^(.{2,60}?):\s*\[\s*_*(?:_*)?([A-Za-z0-9.+\/-]+)_*\s*\]\s*([^\s(]*)?/i,
    );
    if (bracket) {
      const label = bracket[1]!.trim();
      const value = bracket[2]!.trim();
      const unit = bracket[3]?.trim() || undefined;
      if (!value || /^_+$/.test(value)) continue;
      const code = mapLabLabelToCode(label);
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({ labTestCode: code, value, unit, label });
      continue;
    }

    // Label: 12.5 g/dL (no brackets)
    const plain = line.match(
      /^([A-Za-z][A-Za-z0-9 .\/()+-]{1,50}?):\s+([A-Za-z0-9.+\/-]{1,20})\s*([a-zA-Z%µu\/^0-9]*)?/i,
    );
    if (plain) {
      const label = plain[1]!.trim();
      const value = plain[2]!.trim();
      if (/^\[/.test(value) || value === "______") continue;
      const code = mapLabLabelToCode(label);
      if (code === "OTHER" && !/\d/.test(value)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({
        labTestCode: code,
        value,
        unit: plain[3]?.trim() || undefined,
        label,
      });
    }
  }

  return out;
}

function mapLabLabelToCode(label: string): string {
  for (const row of LAB_LABEL_TO_CODE) {
    if (row.match.test(label)) return row.code;
  }
  return "OTHER";
}

export type ParsedRxLine = {
  raw: string;
  medicineName: string;
  medicineCode: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
};

/** Parse free-text prescription lines into medicine + sig fields. */
export function parsePrescriptionLines(text: string): ParsedRxLine[] {
  if (!text?.trim()) return [];
  const lines = text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !/^appointment/i.test(l));

  const out: ParsedRxLine[] = [];
  for (const raw of lines) {
    const cleaned = raw.replace(/^[-•*\d.)\s]+/, "").trim();
    if (!cleaned) continue;

    const doseMatch = cleaned.match(
      /(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|%|tab|caps?))/i,
    );
    const dose = doseMatch?.[1]?.trim() || "as directed";

    let route = "PO";
    if (/\bim\b/i.test(cleaned)) route = "IM";
    else if (/\biv\b/i.test(cleaned)) route = "IV";
    else if (/vaginal|pv\b/i.test(cleaned)) route = "PV";
    else if (/topical|apply/i.test(cleaned)) route = "TOPICAL";
    else if (/\bpo\b|oral/i.test(cleaned)) route = "PO";

    let frequency = "OD";
    if (/\btid\b|three times/i.test(cleaned)) frequency = "TID";
    else if (/\bid\b|twice|bid\b/i.test(cleaned)) frequency = "BID";
    else if (/\bqid\b|four times/i.test(cleaned)) frequency = "QID";
    else if (/\bstat\b/i.test(cleaned)) frequency = "STAT";
    else if (/\bprn\b/i.test(cleaned)) frequency = "PRN";
    else if (/\bod\b|once daily|daily/i.test(cleaned)) frequency = "OD";

    let duration = "as directed";
    const dur = cleaned.match(
      /(?:for\s+)?(\d+\s*(?:days?|day|weeks?|week|months?|month))/i,
    );
    if (dur) duration = dur[1]!.trim();
    else if (/\bstat\b/i.test(cleaned)) duration = "stat";

    // Medicine name = text before dose / route keywords
    let medicineName = cleaned
      .split(/\s+(?:\d|po\b|im\b|iv\b|tid|bid|qid|stat|for\b)/i)[0]
      ?.trim() || cleaned;
    medicineName = medicineName.replace(/[^a-zA-Z0-9 +\-]/g, "").trim();
    if (medicineName.length < 2) medicineName = cleaned.slice(0, 40);

    const medicineCode = medicineCodeFromName(medicineName, dose);
    const qtyMatch = duration.match(/(\d+)/);
    const quantity = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;

    out.push({
      raw: cleaned,
      medicineName: medicineName.slice(0, 120),
      medicineCode,
      dose,
      route,
      frequency,
      duration,
      quantity,
    });
  }
  return out;
}

function medicineCodeFromName(name: string, dose: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
  const d = dose.replace(/[^0-9]/g, "").slice(0, 4);
  return `MIG-${base}${d || "X"}`.slice(0, 24);
}

export function toCents(amount: string | number | undefined): number {
  const n = typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? "0"));
  if (!Number.isFinite(n) || n < 0) return 0;
  // Firebase amounts are ETB whole units
  return Math.round(n * 100);
}
