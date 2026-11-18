import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { invoiceBalance } from "../common/domain/finance";
import {
  ageBand,
  ageYearsAt,
  ancAgeKey,
  ANC_AGE_KEYS,
  classifySurveillance,
  emptyCountMap,
  emptyLabRows,
  emptyMorbidities,
  emptyOthersRow,
  emptySexMap,
  fpAgeKey,
  fpMethodKey,
  FP_AGE_KEYS,
  FP_METHOD_KEYS,
  immediateDiseaseLabels,
  isHivLabTest,
  isQualitativePositive,
  malariaSpecies,
  matchHmisLabTest,
  matchImmediate,
  matchNcod,
  NOT_RECORDED,
  opdAgeBand,
  OPD_AGE_BANDS,
  sexHmis,
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
      openInvoiceSums,
      deferredTodayCount,
      waivedToday,
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
      this.prisma.invoice.aggregate({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
        _sum: { totalCents: true, paidCents: true, waivedCents: true },
      }),
      this.prisma.invoiceAdjustment.count({
        where: { type: "DEFER", createdAt: { gte: today } },
      }),
      this.prisma.invoiceAdjustment.aggregate({
        where: { type: "WAIVE", createdAt: { gte: today } },
        _sum: { amountCents: true },
      }),
    ]);
    const outstandingCents = Math.max(
      0,
      (openInvoiceSums._sum.totalCents ?? 0) -
        (openInvoiceSums._sum.paidCents ?? 0) -
        (openInvoiceSums._sum.waivedCents ?? 0),
    );

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
      outstandingCents,
      deferredTodayCount,
      waivedTodayCents: waivedToday._sum.amountCents ?? 0,
    };
  }

  /**
   * Unpaid & debts: every invoice that still has a balance (as of now), plus
   * billed / collected / pay later / waived totals for the selected period.
   */
  async receivables(from: Date, to: Date) {
    const now = new Date();
    const [open, billed, payments, adjustments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
        orderBy: { createdAt: "asc" },
        take: 5_000,
        include: {
          patient: {
            select: {
              id: true,
              patientNumber: true,
              firstName: true,
              middleName: true,
              lastName: true,
              phone: true,
            },
          },
          encounter: {
            select: {
              id: true,
              encounterNumber: true,
              visitNumber: true,
              status: true,
              startedAt: true,
            },
          },
          adjustments: {
            where: { type: "DEFER" },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              recordedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: { not: "VOID" },
          issuedAt: { gte: from, lte: to },
        },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        },
        select: { amountCents: true, refundedCents: true, isDebtPayment: true },
      }),
      this.prisma.invoiceAdjustment.groupBy({
        by: ["type"],
        where: { createdAt: { gte: from, lte: to } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);

    const aging = { days0to7: 0, days8to30: 0, days31plus: 0 };
    const rows = open
      .map((inv) => {
        const balanceCents = invoiceBalance(inv);
        const since = inv.issuedAt ?? inv.createdAt;
        const ageDays = Math.max(
          0,
          Math.floor((now.getTime() - since.getTime()) / 86_400_000),
        );
        const lastDefer = inv.adjustments[0];
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          issuedAt: since.toISOString(),
          ageDays,
          totalCents: inv.totalCents,
          paidCents: inv.paidCents,
          waivedCents: inv.waivedCents,
          deferredCents: Math.min(inv.deferredCents, balanceCents),
          balanceCents,
          atCashier: inv.encounter.status === "WAITING_PAYMENT",
          patient: inv.patient,
          encounter: inv.encounter,
          deferReason: lastDefer?.reason ?? null,
          deferredAt: lastDefer?.createdAt.toISOString() ?? null,
          deferredBy: lastDefer?.recordedBy ?? null,
        };
      })
      .filter((r) => r.balanceCents > 0)
      .sort((a, b) => b.ageDays - a.ageDays);

    for (const r of rows) {
      if (r.ageDays <= 7) aging.days0to7 += r.balanceCents;
      else if (r.ageDays <= 30) aging.days8to30 += r.balanceCents;
      else aging.days31plus += r.balanceCents;
    }

    let collectedCents = 0;
    let debtCollectedCents = 0;
    for (const p of payments) {
      const net = p.amountCents - p.refundedCents;
      collectedCents += net;
      if (p.isDebtPayment) debtCollectedCents += net;
    }
    const adj = (type: "DEFER" | "WAIVE") =>
      adjustments.find((a) => a.type === type);

    return {
      asOf: now.toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        outstandingCents: rows.reduce((sum, r) => sum + r.balanceCents, 0),
        outstandingCount: rows.length,
        patientsOwing: new Set(rows.map((r) => r.patient.id)).size,
        aging,
      },
      periodTotals: {
        billedCents: billed._sum.totalCents ?? 0,
        invoiceCount: billed._count._all,
        collectedCents,
        debtCollectedCents,
        payLaterCents: adj("DEFER")?._sum.amountCents ?? 0,
        payLaterCount: adj("DEFER")?._count._all ?? 0,
        waivedCents: adj("WAIVE")?._sum.amountCents ?? 0,
        waivedCount: adj("WAIVE")?._count._all ?? 0,
      },
      rows,
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
   * Live ministry tables from encounters, diagnoses, verified lab results,
   * family planning, antenatal visits, and deliveries.
   * Deaths, EPI, ART regimens, and nutrition cohorts are not stored.
   */
  private async clinicHmis(from: Date, to: Date) {
    const facility = await this.prisma.facility.findFirst({
      where: { deletedAt: null, active: true },
      orderBy: { createdAt: "asc" },
    });

    const [visitRows, labRows, diagnosisRows, fpRows, ancRows, deliveries] =
      await Promise.all([
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
                        patient: { select: { id: true, sex: true } },
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
        this.prisma.familyPlanningRecord.findMany({
          where: {
            deletedAt: null,
            OR: [
              { procedureDate: { gte: from, lte: to } },
              { procedureDate: null, createdAt: { gte: from, lte: to } },
            ],
          },
          select: {
            visitType: true,
            currentMethod: true,
            procedureDate: true,
            createdAt: true,
            patient: { select: { dateOfBirth: true } },
          },
        }),
        this.prisma.ancVisit.findMany({
          where: {
            deletedAt: null,
            visitDate: { gte: from, lte: to },
          },
          select: {
            patientId: true,
            visitNumber: true,
            gaWeeks: true,
            visitDate: true,
            patient: { select: { dateOfBirth: true } },
          },
        }),
        this.prisma.deliverySummary.findMany({
          where: {
            deletedAt: null,
            OR: [
              { deliveredAt: { gte: from, lte: to } },
              { deliveredAt: null, createdAt: { gte: from, lte: to } },
            ],
          },
          select: {
            modeOfDelivery: true,
            newborns: {
              select: { status: true, birthWeightGrams: true },
            },
          },
        }),
      ]);

    const opd = { M: 0, F: 0, total: 0 };
    const ipd = { M: 0, F: 0, total: 0 };
    const opdByAge = emptySexMap(OPD_AGE_BANDS);
    let pncVisits = 0;

    for (const visit of visitRows) {
      const sex = sexHmis(visit.patient.sex);
      opd[sex] += 1;
      opd.total += 1;
      const years = ageYearsAt(visit.patient.dateOfBirth, visit.startedAt);
      opdByAge[opdAgeBand(years)][sex] += 1;
      if (visit.service?.code === "PNC") pncVisits += 1;
    }

    const fpNewAge = emptyCountMap(FP_AGE_KEYS);
    const fpRepeatAge = emptyCountMap(FP_AGE_KEYS);
    const fpNewMethod = emptyCountMap(FP_METHOD_KEYS);
    const fpRepeatMethod = emptyCountMap(FP_METHOD_KEYS);
    let fpUntyped = 0;

    for (const row of fpRows) {
      const at = row.procedureDate ?? row.createdAt;
      const key = fpAgeKey(ageYearsAt(row.patient.dateOfBirth, at));
      const method = fpMethodKey(row.currentMethod);
      const isNew = row.visitType === "NEW";
      const isRepeat =
        row.visitType === "RETURNING" ||
        row.visitType === "FOLLOW_UP" ||
        row.visitType === "SWITCHING";
      if (!isNew && !isRepeat) fpUntyped += 1;
      const ageMap = isNew ? fpNewAge : fpRepeatAge;
      const methodMap = isNew ? fpNewMethod : fpRepeatMethod;
      if (key) ageMap[key] += 1;
      methodMap[method] += 1;
    }

    const ancFirstAge = emptyCountMap(ANC_AGE_KEYS);
    const ancFourthAge = emptyCountMap(ANC_AGE_KEYS);
    let ancFirstUnder16 = 0;
    let ancFirstAtLeast16 = 0;
    let ancFirstGaUnknown = 0;
    const ancPatientIds = new Set<string>();
    const fourthPatients = new Set<string>();

    for (const visit of ancRows) {
      ancPatientIds.add(visit.patientId);
      const years = ageYearsAt(visit.patient.dateOfBirth, visit.visitDate);
      const ageKey = ancAgeKey(years);
      if (visit.visitNumber === 1) {
        ancFirstAge[ageKey] += 1;
        if (visit.gaWeeks == null) ancFirstGaUnknown += 1;
        else if (visit.gaWeeks < 16) ancFirstUnder16 += 1;
        else ancFirstAtLeast16 += 1;
      }
      if (visit.visitNumber >= 4) fourthPatients.add(visit.patientId);
    }
    for (const patientId of fourthPatients) {
      const visit = ancRows.find(
        (row) => row.patientId === patientId && row.visitNumber >= 4,
      );
      if (!visit) continue;
      const years = ageYearsAt(visit.patient.dateOfBirth, visit.visitDate);
      ancFourthAge[ancAgeKey(years)] += 1;
    }

    const labTests = emptyLabRows();
    const labIndex = new Map(labTests.map((row) => [row.test, row]));
    const others = emptyOthersRow();
    const otherParts = new Map<string, number>();
    const persons = { M: new Set<string>(), F: new Set<string>() };
    let malariaExamined = 0;
    let malariaPfLab = 0;
    let malariaPvLab = 0;
    let malariaUnspecified = 0;
    let hivTestedGeneral = 0;
    let hivPositiveGeneral = 0;
    let hivTestedPregnant = 0;
    let hivPositivePregnant = 0;
    let syphilisTested = 0;
    let syphilisReactive = 0;
    let hepaTested = 0;
    let hepaReactive = 0;

    const addOther = (name: string) => {
      otherParts.set(name, (otherParts.get(name) ?? 0) + 1);
      others.performed += 1;
    };

    for (const result of labRows) {
      const test = result.item.labTest;
      const patient = result.item.labOrder.encounter.patient;
      const sex = sexHmis(patient.sex);
      persons[sex].add(patient.id);
      const service = result.item.labOrder.encounter.service?.code ?? "";
      const pregnant =
        ancPatientIds.has(patient.id) || service === "MCH" || service === "PNC";
      const positive = isQualitativePositive(result.value, result.flag);

      if (isHivLabTest(test)) {
        hivTestedGeneral += 1;
        if (positive) hivPositiveGeneral += 1;
        if (pregnant) {
          hivTestedPregnant += 1;
          if (positive) hivPositivePregnant += 1;
        }
        continue;
      }

      const matched = matchHmisLabTest(test);
      if (!matched) {
        addOther(test.name.trim() || "Unlisted test");
      } else if (matched.countOnly) {
        const row = labIndex.get(matched.test);
        if (row) row.performed += 1;
        addOther(matched.test);
      } else {
        const row = labIndex.get(matched.test);
        if (row) {
          row.performed += 1;
          if (positive) row.op_pos += 1;
          else row.op_neg += 1;
        }
      }

      if (matched?.test === "Blood Film" || matched?.test === "RDT test") {
        malariaExamined += 1;
        const species = malariaSpecies(result.value, result.flag);
        if (species === "pf" || species === "both") malariaPfLab += 1;
        if (species === "pv" || species === "both") malariaPvLab += 1;
        if (species === "unspecified") malariaUnspecified += 1;
      }

      if (pregnant && matched?.test === "Rpr(vdrl)test") {
        syphilisTested += 1;
        if (positive) syphilisReactive += 1;
      }
      if (
        pregnant &&
        (matched?.test === "Hepatitis b test" ||
          matched?.test === "Hepatitis c test")
      ) {
        hepaTested += 1;
        if (positive) hepaReactive += 1;
      }
    }

    labTests.push(others);

    const diseases = {
      malaria: 0,
      malariaPF: 0,
      malariaPV: 0,
      meningitis: 0,
      dysentery: 0,
      typhoid: 0,
      relapsingFever: 0,
      epidemicTyphus: 0,
      scabies: 0,
      samUnder5: 0,
      hepaticVod: 0,
    };
    const immediateCounts = new Map<string, number>(
      immediateDiseaseLabels().map((label) => [label, 0]),
    );
    const morbidities = emptyMorbidities();
    const morbidityIndex = new Map(morbidities.map((row) => [row.name, row]));

    for (const dx of diagnosisRows) {
      const patient = dx.consultation.encounter.patient;
      const at = dx.consultation.encounter.startedAt;
      const years = ageYearsAt(patient.dateOfBirth, at);
      const flags = classifySurveillance(dx.label, years);
      if (flags.malaria) diseases.malaria += 1;
      if (flags.malariaPF) diseases.malariaPF += 1;
      if (flags.malariaPV) diseases.malariaPV += 1;
      if (flags.meningitis) diseases.meningitis += 1;
      if (flags.dysentery) diseases.dysentery += 1;
      if (flags.typhoid) diseases.typhoid += 1;
      if (flags.relapsingFever) diseases.relapsingFever += 1;
      if (flags.epidemicTyphus) diseases.epidemicTyphus += 1;
      if (flags.scabies) diseases.scabies += 1;
      if (flags.samUnder5) diseases.samUnder5 += 1;
      if (flags.hepaticVod) diseases.hepaticVod += 1;

      const immediate = matchImmediate(dx.label);
      if (immediate) {
        immediateCounts.set(immediate, (immediateCounts.get(immediate) ?? 0) + 1);
      }

      const name = matchNcod(dx.label);
      const row = morbidityIndex.get(name);
      if (!row) continue;
      const band = ageBand(years);
      const sex = sexHmis(patient.sex);
      row.bands[band][sex] += 1;
      row.total += 1;
    }

    let skilledBirths = 0;
    let caesarean = 0;
    let stillbirths = 0;
    let liveBirths = 0;
    let lowBirthWeight = 0;
    let weighed = 0;
    for (const delivery of deliveries) {
      skilledBirths += 1;
      if (delivery.modeOfDelivery === "CS") caesarean += 1;
      for (const baby of delivery.newborns) {
        if (baby.status === "STILLBIRTH") {
          stillbirths += 1;
          continue;
        }
        liveBirths += 1;
        if (baby.birthWeightGrams != null) {
          weighed += 1;
          if (baby.birthWeightGrams < 2500) lowBirthWeight += 1;
        }
      }
    }

    const weekly = [
      { indicator: "Total malaria (confirmed and clinical)", cases: diseases.malaria, deaths: null },
      { indicator: "Malaria suspected fever cases examined (RDT or microscopy)", cases: malariaExamined, deaths: null },
      { indicator: "Cases positive for malaria — Pf", cases: malariaPfLab, deaths: null },
      { indicator: "Cases positive for malaria — Pv", cases: malariaPvLab, deaths: null },
      { indicator: "Malaria positive, species not stated", cases: malariaUnspecified, deaths: null },
      { indicator: "Meningitis", cases: diseases.meningitis, deaths: null },
      { indicator: "Dysentery", cases: diseases.dysentery, deaths: null },
      { indicator: "Typhoid fever", cases: diseases.typhoid, deaths: null },
      { indicator: "Relapsing fever", cases: diseases.relapsingFever, deaths: null },
      { indicator: "Epidemic typhus", cases: diseases.epidemicTyphus, deaths: null },
      { indicator: "SAM / MUAC < 11 cm or bilateral edema in children under 5 (new)", cases: diseases.samUnder5, deaths: null },
      { indicator: "Hepatic VOD", cases: diseases.hepaticVod, deaths: null },
      { indicator: "Maternal death", cases: null, deaths: null },
      { indicator: "Scabies", cases: diseases.scabies, deaths: null },
      { indicator: "Other", cases: null, deaths: null },
    ];

    const immediate = immediateDiseaseLabels().map((label) => ({
      indicator: label,
      cases: label === "Perinatal and neonatal death" ? null : (immediateCounts.get(label) ?? 0),
      deaths: null,
    }));

    const ancFirstVisit =
      ancFirstUnder16 + ancFirstAtLeast16 + ancFirstGaUnknown;
    const ancFourthVisit = Object.values(ancFourthAge).reduce((sum, n) => sum + n, 0);

    return {
      facility: facility?.name ?? "Hiwet Clinic",
      opd,
      ipd,
      opdByAge,
      labPersons: {
        op: {
          M: persons.M.size,
          F: persons.F.size,
          total: persons.M.size + persons.F.size,
        },
        ip: { M: 0, F: 0, total: 0 },
      },
      labTests,
      labOtherBreakdown: [...otherParts.entries()].map(([test, count]) => ({
        test,
        count,
      })),
      diseases,
      weekly,
      immediate,
      malaria: {
        examined: malariaExamined,
        pf: malariaPfLab,
        pv: malariaPvLab,
        unspecified: malariaUnspecified,
      },
      hiv: {
        testedGeneral: hivTestedGeneral,
        positiveGeneral: hivPositiveGeneral,
        testedPregnant: hivTestedPregnant,
        positivePregnant: hivPositivePregnant,
        artNew: null,
      },
      morbidities,
      topMorbidities: morbidities.filter((row) => row.total > 0),
      ageGroups: ["<1yr", "1-4yr", "5-14yr", "15-29yr", "30-64yr", ">=65yr"],
      familyPlanning: {
        newByAge: fpNewAge,
        repeatByAge: fpRepeatAge,
        newByMethod: fpNewMethod,
        repeatByMethod: fpRepeatMethod,
        untypedVisit: fpUntyped,
      },
      anc: {
        firstVisit: ancFirstVisit,
        firstUnder16: ancFirstUnder16,
        firstAtLeast16: ancFirstAtLeast16,
        firstGaUnknown: ancFirstGaUnknown,
        firstByAge: ancFirstAge,
        fourthVisit: ancFourthVisit,
        fourthByAge: ancFourthAge,
        syphilisTested,
        syphilisReactive,
        syphilisTreated: null,
        hepaTested,
        hepaReactive,
        hepaTreated: null,
        pncVisits,
      },
      delivery: {
        skilledBirths,
        caesarean,
        stillbirths,
        liveBirths,
        lowBirthWeight,
        weighed,
      },
      notRecorded: NOT_RECORDED,
      notes: [
        "Outpatient is every non-cancelled visit in the period. Inpatient stays zero because this clinic has no ward.",
        "Persons tested counts each patient once. The test table counts each verified result.",
        "Hemoglobin, ESR, differential count, blood group, and any test not on the list are included under Others. They are not marked positive or negative.",
        "HIV tests are reported under HIV testing, not on the laboratory activity rows.",
        "A dash means the clinic system does not record that figure. A zero means none were found.",
        fpUntyped > 0
          ? `${fpUntyped} family planning visits have no visit type and are counted as repeat.`
          : "Family planning new versus repeat uses the visit type on the family planning record.",
      ].filter(Boolean),
    };
  }
}
