import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AddDiagnosisDto,
  CorrectConsultationDto,
  SaveConsultationDto,
} from "./dto/consultation.dto";
@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async findByEncounter(encounterId: string) {
    const item = await this.prisma.consultation.findFirst({
      where: { encounterId, deletedAt: null },
      include: {
        diagnoses: { where: { deletedAt: null } },
        encounter: { include: { patient: true, triage: true } },
      },
    });
    if (!item) throw new NotFoundException("Consultation not found");
    return item;
  }
  async save(encounterId: string, dto: SaveConsultationDto, doctorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: {
          id: encounterId,
          status: { in: ["WAITING_DOCTOR", "IN_CONSULTATION"] },
          deletedAt: null,
        },
      });
      if (!encounter)
        throw new ConflictException("Encounter is not ready for consultation");
      const existing = await tx.consultation.findUnique({
        where: { encounterId },
      });
      if (existing?.status === "FINALIZED")
        throw new ConflictException(
          "Finalized consultation requires correction endpoint",
        );
      const item = await tx.consultation.upsert({
        where: { encounterId },
        create: { ...dto, encounterId, doctorId },
        update: dto,
      });
      if (encounter.status === "WAITING_DOCTOR")
        await tx.encounter.update({
          where: { id: encounterId },
          data: { status: "IN_CONSULTATION" },
        });
      await tx.queueEntry.updateMany({
        where: {
          encounterId,
          station: "DOCTOR",
          status: { in: ["WAITING", "CALLED"] },
        },
        data: {
          status: "IN_SERVICE",
          serviceStartedAt: new Date(),
          assignedToId: doctorId,
        },
      });
      await this.audit.create(
        {
          actorId: doctorId,
          action: existing ? "consultation.updated" : "consultation.created",
          entityType: "Consultation",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }
  async addDiagnosis(
    consultationId: string,
    dto: AddDiagnosisDto,
    actorId: string,
  ) {
    const consultation = await this.prisma.consultation.findFirst({
      where: { id: consultationId, status: "DRAFT", deletedAt: null },
    });
    if (!consultation)
      throw new ConflictException(
        "Diagnosis can only be added to a draft consultation",
      );
    if (dto.isPrimary)
      await this.prisma.diagnosis.updateMany({
        where: { consultationId, isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      });
    const item = await this.prisma.diagnosis.create({
      data: { ...dto, consultationId, createdById: actorId },
    });
    await this.audit.create({
      actorId,
      action: "diagnosis.created",
      entityType: "Diagnosis",
      entityId: item.id,
    });
    return item;
  }
  async finalize(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.consultation.findFirst({
        where: { id, status: "DRAFT", deletedAt: null },
        include: { diagnoses: { where: { deletedAt: null } } },
      });
      if (!item)
        throw new ConflictException(
          "Only a draft consultation can be finalized",
        );
      if (!item.assessment && !item.notes && !item.diagnoses.length)
        throw new BadRequestException(
          "Assessment, notes, or at least one diagnosis is required",
        );
      const updated = await tx.consultation.update({
        where: { id },
        data: { status: "FINALIZED", finalizedAt: new Date() },
      });
      const [pendingLab, activePrescription] = await Promise.all([
        tx.labOrder.count({
          where: {
            consultationId: id,
            status: { notIn: ["VERIFIED", "CANCELLED"] },
          },
        }),
        tx.prescription.count({
          where: {
            consultationId: id,
            status: { in: ["ACTIVE", "PARTIAL"] },
          },
        }),
      ]);
      const nextStatus = pendingLab
        ? "WAITING_LAB"
        : activePrescription
          ? "WAITING_PHARMACY"
          : "WAITING_PAYMENT";
      await tx.encounter.update({
        where: { id: item.encounterId },
        data: { status: nextStatus },
      });
      await tx.queueEntry.updateMany({
        where: {
          encounterId: item.encounterId,
          station: "DOCTOR",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (nextStatus === "WAITING_PAYMENT") {
        const openCashier = await tx.queueEntry.findFirst({
          where: {
            encounterId: item.encounterId,
            station: "CASHIER",
            status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
          },
        });
        if (!openCashier) {
          const enc = await tx.encounter.findUniqueOrThrow({
            where: { id: item.encounterId },
          });
          await tx.queueEntry.create({
            data: {
              encounterId: item.encounterId,
              station: "CASHIER",
              priority: enc.priority,
            },
          });
        }
      }
      await this.audit.create(
        {
          actorId,
          action: "consultation.finalized",
          entityType: "Consultation",
          entityId: id,
        },
        tx,
      );
      return updated;
    });
  }
  async correct(id: string, dto: CorrectConsultationDto, actorId: string) {
    const old = await this.prisma.consultation.findFirst({
      where: {
        id,
        status: { in: ["FINALIZED", "CORRECTED"] },
        deletedAt: null,
      },
    });
    if (!old)
      throw new ConflictException(
        "Only a finalized consultation can be corrected",
      );
    const { correctionReason, ...changes } = dto;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.consultation.update({
        where: { id },
        data: { ...changes, correctionReason, status: "CORRECTED" },
      });
      await this.audit.create(
        {
          actorId,
          action: "consultation.corrected",
          entityType: "Consultation",
          entityId: id,
          oldValues: old,
          newValues: updated,
          metadata: { reason: correctionReason },
        },
        tx,
      );
      return updated;
    });
  }
}
