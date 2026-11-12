import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { DatingSource, LmpStatus } from "../generated/prisma/client";
import {
  CreateAncVisitDto,
  CreateLaborMonitoringDto,
  UpdateAncVisitDto,
  UpsertDeliverySummaryDto,
  UpsertLaborAdmissionDto,
  UpsertObstetricHistoryDto,
} from "./dto/maternal.dto";

function parseDate(value?: string | null): Date | undefined {
  if (value == null || value === "") return undefined;
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function dateOrNull(value?: string | null): Date | null {
  return parseDate(value) ?? null;
}

const NAEGELE_DAYS = 280;

function resolvePregnancyDating(dto: UpsertObstetricHistoryDto) {
  const lmp = dateOrNull(dto.lmp);
  const enteredEdd = dateOrNull(dto.edd);

  if (dto.lmpStatus == null && dto.datingSource == null) {
    const keptLmp = parseDate(dto.lmp);
    const edd =
      keptLmp && !dto.edd ? addDays(keptLmp, NAEGELE_DAYS) : parseDate(dto.edd);
    return {
      ...(dto.lmp !== undefined ? { lmp: keptLmp ?? null } : {}),
      ...(dto.edd !== undefined || (keptLmp && !dto.edd) ? { edd: edd ?? null } : {}),
    };
  }

  if (dto.lmpStatus === LmpStatus.KNOWN) {
    return {
      lmp,
      edd: lmp ? addDays(lmp, NAEGELE_DAYS) : null,
      lmpStatus: LmpStatus.KNOWN,
      datingSource: DatingSource.LMP,
      datingEstablished: Boolean(lmp),
    };
  }

  if (dto.datingSource === DatingSource.ULTRASOUND) {
    return {
      lmp: null,
      edd: enteredEdd,
      lmpStatus: LmpStatus.UNKNOWN,
      datingSource: DatingSource.ULTRASOUND,
      datingEstablished: Boolean(enteredEdd),
    };
  }

  if (dto.datingSource === DatingSource.CLINICAL) {
    return {
      lmp: null,
      edd: enteredEdd,
      lmpStatus: LmpStatus.UNKNOWN,
      datingSource: DatingSource.CLINICAL,
      datingEstablished: dto.datingEstablished === true && Boolean(enteredEdd),
    };
  }

  return {
    lmp: null,
    edd: null,
    lmpStatus: LmpStatus.UNKNOWN,
    datingSource: DatingSource.NONE,
    datingEstablished: false,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

@Injectable()
export class MaternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ensurePatient(patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");
  }

  private async ensureEncounter(encounterId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
  }

  async getPatientMaternal(patientId: string) {
    await this.ensurePatient(patientId);
    const [obstetricHistory, ancVisits] = await Promise.all([
      this.prisma.obstetricHistory.findFirst({
        where: { patientId, deletedAt: null },
      }),
      this.prisma.ancVisit.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { visitNumber: "asc" },
      }),
    ]);
    return { obstetricHistory, ancVisits };
  }

  async upsertObstetricHistory(
    patientId: string,
    dto: UpsertObstetricHistoryDto,
    actorId: string,
  ) {
    await this.ensurePatient(patientId);
    const {
      lmp: _l,
      edd: _e,
      lmpStatus: _s,
      datingSource: _d,
      datingEstablished: _b,
      ...rest
    } = dto;
    const dating = resolvePregnancyDating(dto);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.obstetricHistory.upsert({
        where: { patientId },
        create: {
          ...rest,
          ...dating,
          patientId,
          recordedById: actorId,
        },
        update: {
          ...rest,
          ...dating,
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "obstetric_history.upserted",
          entityType: "ObstetricHistory",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async listAncVisits(patientId: string) {
    await this.ensurePatient(patientId);
    return this.prisma.ancVisit.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { visitNumber: "asc" },
    });
  }

  async createAncVisit(
    patientId: string,
    dto: CreateAncVisitDto,
    actorId: string,
  ) {
    await this.ensurePatient(patientId);
    const agg = await this.prisma.ancVisit.aggregate({
      where: { patientId, deletedAt: null },
      _max: { visitNumber: true },
    });
    const visitNumber = (agg._max.visitNumber ?? 0) + 1;
    const visitDate = parseDate(dto.visitDate) ?? new Date();
    const { visitDate: _vd, nextAppointment, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.ancVisit.create({
        data: {
          ...rest,
          patientId,
          visitNumber,
          visitDate,
          nextAppointment: parseDate(nextAppointment),
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "anc_visit.created",
          entityType: "AncVisit",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async updateAncVisit(id: string, dto: UpdateAncVisitDto, actorId: string) {
    const existing = await this.prisma.ancVisit.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("ANC visit not found");
    const { visitDate, nextAppointment, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.ancVisit.update({
        where: { id },
        data: {
          ...rest,
          ...(visitDate !== undefined ? { visitDate: parseDate(visitDate) } : {}),
          ...(nextAppointment !== undefined
            ? { nextAppointment: parseDate(nextAppointment) }
            : {}),
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "anc_visit.updated",
          entityType: "AncVisit",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async getLabor(encounterId: string) {
    await this.ensureEncounter(encounterId);
    return this.prisma.laborAdmission.findFirst({
      where: { encounterId, deletedAt: null },
      include: {
        monitoringEntries: { orderBy: { recordedAt: "asc" } },
      },
    });
  }

  async upsertLaborAdmission(
    encounterId: string,
    dto: UpsertLaborAdmissionDto,
    actorId: string,
  ) {
    await this.ensureEncounter(encounterId);
    const { admittedAt, ...rest } = dto;
    const admittedAtDate = admittedAt ? new Date(admittedAt) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.laborAdmission.upsert({
        where: { encounterId },
        create: {
          ...rest,
          encounterId,
          admittedAt: admittedAtDate ?? new Date(),
          recordedById: actorId,
        },
        update: {
          ...rest,
          ...(admittedAt !== undefined ? { admittedAt: admittedAtDate } : {}),
          recordedById: actorId,
        },
        include: {
          monitoringEntries: { orderBy: { recordedAt: "asc" } },
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "labor_admission.upserted",
          entityType: "LaborAdmission",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async addLaborMonitoring(
    encounterId: string,
    dto: CreateLaborMonitoringDto,
    actorId: string,
  ) {
    const admission = await this.prisma.laborAdmission.findFirst({
      where: { encounterId, deletedAt: null },
    });
    if (!admission) throw new NotFoundException("Labor admission not found");
    const { recordedAt, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.laborMonitoringEntry.create({
        data: {
          ...rest,
          laborAdmissionId: admission.id,
          recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "labor_monitoring.created",
          entityType: "LaborMonitoringEntry",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async getDelivery(encounterId: string) {
    await this.ensureEncounter(encounterId);
    return this.prisma.deliverySummary.findFirst({
      where: { encounterId, deletedAt: null },
      include: { newborns: { orderBy: { birthOrder: "asc" } } },
    });
  }

  async upsertDeliverySummary(
    encounterId: string,
    dto: UpsertDeliverySummaryDto,
    actorId: string,
  ) {
    await this.ensureEncounter(encounterId);
    const { newborns, deliveredAt, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const summary = await tx.deliverySummary.upsert({
        where: { encounterId },
        create: {
          ...rest,
          encounterId,
          deliveredAt: deliveredAt ? new Date(deliveredAt) : undefined,
          recordedById: actorId,
        },
        update: {
          ...rest,
          ...(deliveredAt !== undefined
            ? { deliveredAt: deliveredAt ? new Date(deliveredAt) : null }
            : {}),
          recordedById: actorId,
        },
      });
      if (newborns !== undefined) {
        await tx.newbornRecord.deleteMany({
          where: { deliverySummaryId: summary.id },
        });
        if (newborns.length) {
          await tx.newbornRecord.createMany({
            data: newborns.map((n, i) => ({
              deliverySummaryId: summary.id,
              birthOrder: n.birthOrder ?? i + 1,
              sex: n.sex,
              birthWeightGrams: n.birthWeightGrams,
              apgar1: n.apgar1,
              apgar5: n.apgar5,
              gaWeeks: n.gaWeeks,
              status: n.status,
              resuscitation: n.resuscitation,
              nicuAdmission: n.nicuAdmission,
            })),
          });
        }
      }
      await this.audit.create(
        {
          actorId,
          action: "delivery_summary.upserted",
          entityType: "DeliverySummary",
          entityId: summary.id,
        },
        tx,
      );
      return tx.deliverySummary.findUniqueOrThrow({
        where: { id: summary.id },
        include: { newborns: { orderBy: { birthOrder: "asc" } } },
      });
    });
  }
}
