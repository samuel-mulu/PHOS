import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ageBand,
  ageYearsAt,
  classifySurveillance,
  emptyAgeGrid,
  emptyLabRows,
  fpAgeKey,
  HMIS_AGE_BANDS,
  isQualitativePositive,
  matchHmisLabTest,
  sexHmis,
  type HmisAgeBand,
} from "./hmis-clinic";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const today = startOfToday();
    const activeStatuses = [
      "REGISTERED",
      "WAITING_TRIAGE",
      "IN_TRIAGE",
      "WAITING_DOCTOR",
      "IN_CONSULTATION",
      "WAITING_LAB",
      "WAITING_REVIEW",
      "WAITING_PHARMACY",
      "WAITING_PAYMENT",
    ] as const;

    const [
      patientsRegisteredToday,
      activeEncounters,
      withDoctor,
      waitingDoctor,
      inTriage,
      waitingPayment,
      activeLabOrders,
      pendingInvoices,
      appointmentsToday,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: { createdAt: { gte: today }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: { in: [...activeStatuses] }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: "IN_CONSULTATION", deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: "WAITING_DOCTOR", deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: {
          status: { in: ["WAITING_TRIAGE", "IN_TRIAGE"] },
          deletedAt: null,
        },
      }),
      this.prisma.encounter.count({
        where: { status: "WAITING_PAYMENT", deletedAt: null },
      }),
      this.prisma.labOrder.count({
        where: {
          status: { notIn: ["VERIFIED", "CANCELLED"] },
        },
      }),
      this.prisma.invoice.count({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: today } },
      }),
    ]);

    return {
      asOf: new Date().toISOString(),
      patientsRegisteredToday,
      activeEncounters,
      withDoctor,
      waitingDoctor,
      inTriage,
      waitingPayment,
      activeLabOrders,
      pendingInvoices,
      appointmentsToday,
    };
  }

  async hmis(from: Date, to: Date) {
    const [
      newPatients,
      encounters,
      encountersByStatus,
      labVerified,
      prescriptions,
      paymentsAgg,
      appointmentsScheduled,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
      }),
      this.prisma.encounter.groupBy({
        by: ["status"],
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.labOrder.count({
        where: {
          status: "VERIFIED",
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.prescription.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: from, lte: to } },
      }),
    ]);

    const clinic = await this.clinicHmis(from, to);

    return {
      facility: clinic.facility,
      period: { from: from.toISOString(), to: to.toISOString() },
      newPatients,
      encounters,
      encountersByStatus: Object.fromEntries(
        encountersByStatus.map((row) => [row.status, row._count._all]),
      ),
      labOrdersVerified: labVerified,
      prescriptions,
      appointmentsScheduled,
      paymentsCount: paymentsAgg._count._all,
      paymentsTotalCents: paymentsAgg._sum.amountCents ?? 0,
      clinic,
    };
  }

  /**
   * Live HMIS tables from encounters, diagnoses, and verified lab results.
   * FP methods / ANC visit number / EPI / IPD / deaths are not captured yet.
   */
  private async clinicHmis(from: Date, to: Date) {
    const facility = await this.prisma.facility.findFirst({
      where: { deletedAt: null, active: true },
      orderBy: { createdAt: "asc" },
    });

    const [visitRows, labRows, diagnosisRows] = await Promise.all([
      this.prisma.encounter.findMany({
        where: {
          startedAt: { gte: from, lte: to },
          deletedAt: null,
          status: { not: "CANCELLED" },
        },
        select: {
          startedAt: true,
          service: { select: { code: true } },
          patient: { select: { sex: true, dateOfBirth: true } },
        },
      }),
      this.prisma.labResult.findMany({
        where: {
          item: { labOrder: { status: "VERIFIED", cancelledAt: null } },
          OR: [
            { verifiedAt: { gte: from, lte: to } },
            { verifiedAt: null, enteredAt: { gte: from, lte: to } },
          ],
        },
        select: {
          value: true,
          flag: true,
          item: {
            select: {
              labTest: { select: { code: true, name: true, category: true } },
              labOrder: {
                select: {
                  encounter: {
                    select: {
                      service: { select: { code: true } },
                      patient: { select: { sex: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.diagnosis.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: from, lte: to },
          consultation: { deletedAt: null },
        },
        select: {
          label: true,
          consultation: {
            select: {
              encounter: {
                select: {
                  startedAt: true,
                  patient: { select: { sex: true, dateOfBirth: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const opd = { M: 0, F: 0, total: 0 };
    const ipd = { M: 0, F: 0, total: 0 };
    const fpByAge: Record<string, number> = {
      "10-14": 0,
      "15-19": 0,
      "20-24": 0,
      "25-29": 0,
      "30-49": 0,
    };
    let ancFirstVisit = 0;
    let pncVisits = 0;

    for (const visit of visitRows) {
      const sex = sexHmis(visit.patient.sex);
      opd[sex] += 1;
      opd.total += 1;
      const years = ageYearsAt(visit.patient.dateOfBirth, visit.startedAt);
      const code = visit.service?.code ?? "";
      if (code === "FP") {
        const key = fpAgeKey(years);
        if (key) fpByAge[key] += 1;
      }
      if (code === "MCH") ancFirstVisit += 1;
      if (code === "PNC") pncVisits += 1;
    }

    const labTests = emptyLabRows();
    const labIndex = new Map(labTests.map((row) => [row.test, row]));
    let hivTestedGeneral = 0;
    let hivPositiveGeneral = 0;
    let hivTestedPregnant = 0;
    let hivPositivePregnant = 0;
    let syphilisTested = 0;
    let syphilisReactive = 0;
    let hepaTested = 0;
    let hepaReactive = 0;

    for (const result of labRows) {
      const test = result.item.labTest;
      const rowName = matchHmisLabTest(test);
      const positive = isQualitativePositive(result.value, result.flag);
      if (rowName) {
        const row = labIndex.get(rowName);
        if (row) {
          if (positive) row.op_pos += 1;
          else row.op_neg += 1;
        }
      }
      const code = test.code.toUpperCase();
      const service = result.item.labOrder.encounter.service?.code ?? "";
      const mch = service === "MCH" || service === "PNC";
      if (code === "HIV" || rowName === "HIV test") {
        hivTestedGeneral += 1;
        if (positive) hivPositiveGeneral += 1;
        if (mch) {
          hivTestedPregnant += 1;
          if (positive) hivPositivePregnant += 1;
        }
      }
      if (code === "VDRL" || rowName === "Rpr(vdrl)test") {
        syphilisTested += 1;
        if (positive) syphilisReactive += 1;
      }
      if (
        code === "HBSAG" ||
        code === "HCV" ||
        rowName === "Hepatitis b test" ||
        rowName === "Hepatitis c test"
      ) {
        hepaTested += 1;
        if (positive) hepaReactive += 1;
      }
    }

    const diseases = {
      malariaPF: 0,
      malariaPV: 0,
      meningitis: 0,
      dysentery: 0,
      typhoid: 0,
      relapsingFever: 0,
      epidemicTyphus: 0,
      scabies: 0,
      samUnder5: 0,
    };
    const morbidityMap = new Map<
      string,
      Record<HmisAgeBand, { M: number; F: number }>
    >();

    for (const dx of diagnosisRows) {
      const patient = dx.consultation.encounter.patient;
      const at = dx.consultation.encounter.startedAt;
      const years = ageYearsAt(patient.dateOfBirth, at);
      const flags = classifySurveillance(dx.label, years);
      for (const key of Object.keys(diseases) as (keyof typeof diseases)[]) {
        if (flags[key]) diseases[key] += 1;
      }
      const name = dx.label.trim() || "Unspecified";
      if (!morbidityMap.has(name)) morbidityMap.set(name, emptyAgeGrid());
      const band = ageBand(years);
      const sex = sexHmis(patient.sex);
      morbidityMap.get(name)![band][sex] += 1;
    }

    const topMorbidities = [...morbidityMap.entries()]
      .map(([name, bands]) => {
        let total = 0;
        for (const band of HMIS_AGE_BANDS) total += bands[band].M + bands[band].F;
        return { name, total, bands };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 45);

    const fpTotal = Object.values(fpByAge).reduce((sum, n) => sum + n, 0);

    return {
      facility: facility?.name ?? "Hiwet Clinic",
      opd,
      ipd,
      labTests,
      diseases,
      hiv: {
        testedGeneral: hivTestedGeneral,
        positiveGeneral: hivPositiveGeneral,
        testedPregnant: hivTestedPregnant,
        positivePregnant: hivPositivePregnant,
        artNew: 0,
      },
      topMorbidities,
      ageGroups: [...HMIS_AGE_BANDS],
      familyPlanning: {
        newAcceptors: { total: fpTotal, ...fpByAge },
        methodNew: {
          "Oral contraceptives": 0,
          Injectables: 0,
          Implants: 0,
          IUD: 0,
          Vasectomy: 0,
          "Tubal ligation": 0,
          Others: 0,
        },
      },
      anc: {
        firstVisit: ancFirstVisit,
        fourthVisit: 0,
        syphilisTested,
        syphilisReactive,
        syphilisTreated: 0,
        hepaTested,
        hepaReactive,
        pncVisits,
      },
      epi: {
        BCG: 0,
        Penta1: 0,
        Penta3: 0,
        PCV1: 0,
        PCV3: 0,
        Polio1: 0,
        Polio3: 0,
        Measles1: 0,
        Measles2: 0,
      },
      notes: [
        "OPD is clinic encounters in the period (this site has no inpatient ward).",
        "Lab +/− uses verified results; numeric tests count as tested (−ve) unless flagged abnormal/critical or the value is positive/reactive.",
        "Family planning methods, ANC visit number, EPI, ART, and deaths are not captured in PHOS yet.",
      ],
    };
  }
}
