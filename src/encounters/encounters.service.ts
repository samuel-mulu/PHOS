import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { DESK_NOTIFY_ROLES } from "../common/constants/desk-roles";
import {
  EncounterStatus,
  Prisma,
  QueueStation,
  Role,
} from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEncounterDto } from "./dto/encounter.dto";
import { ENCOUNTER_TRANSITIONS, STATION_STATUS } from "./encounter-state";

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateEncounterDto, actorId: string) {
    const { initialStation, assignedDoctorId, ...encounterFields } = dto;
    const station: "TRIAGE" | "DOCTOR" =
      initialStation === "TRIAGE" ? "TRIAGE" : "DOCTOR";
    const status = STATION_STATUS[station];

    const config = await this.prisma.service.findFirst({
      where: {
        id: dto.serviceId,
        departmentId: dto.departmentId,
        department: {
          facilityId: dto.facilityId,
          active: true,
          deletedAt: null,
        },
        active: true,
        deletedAt: null,
      },
    });
    if (!config)
      throw new BadRequestException(
        "Facility, department and service do not form an active configuration",
      );
    if (assignedDoctorId)
      await this.assertActiveDoctor(assignedDoctorId);
    const active = await this.prisma.encounter.findFirst({
      where: {
        patientId: dto.patientId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        deletedAt: null,
      },
    });
    if (active)
      throw new ConflictException(
        `Patient already has active encounter ${active.encounterNumber}`,
      );
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('encounter_number_seq')`;
      const encounter = await tx.encounter.create({
        data: {
          ...encounterFields,
          assignedDoctorId: assignedDoctorId ?? null,
          encounterNumber: `ENC-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          createdById: actorId,
          status,
        },
        include: {
          assignedDoctor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      await tx.queueEntry.create({
        data: {
          encounterId: encounter.id,
          station,
          priority: encounter.priority,
          assignedToId:
            station === "DOCTOR" ? (assignedDoctorId ?? null) : null,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "encounter.created",
          entityType: "Encounter",
          entityId: encounter.id,
          newValues: { status, station, assignedDoctorId },
        },
        tx,
      );
      return encounter;
    });
  }

  list(status?: EncounterStatus, patientId?: string) {
    return this.prisma.encounter.findMany({
      where: { status, patientId, deletedAt: null },
      include: {
        patient: true,
        service: true,
        department: true,
        assignedDoctor: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.encounter.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: true,
        service: true,
        department: true,
        assignedDoctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        queueEntries: { orderBy: { enteredAt: "asc" } },
        triage: true,
        consultation: {
          include: { diagnoses: { where: { deletedAt: null } } },
        },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
    });
    if (!item) throw new NotFoundException("Encounter not found");
    return item;
  }

  async transition(
    id: string,
    target: EncounterStatus,
    actorId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const current = await tx.encounter.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException("Encounter not found");
    if (current.status === target) return current;
    if (!ENCOUNTER_TRANSITIONS[current.status].includes(target))
      throw new ConflictException(
        `Cannot transition encounter from ${current.status} to ${target}`,
      );
    const result = await tx.encounter.updateMany({
      where: { id, status: current.status },
      data: {
        status: target,
        closedAt: ["COMPLETED", "CANCELLED"].includes(target)
          ? new Date()
          : null,
      },
    });
    if (!result.count)
      throw new ConflictException("Encounter changed by another request");
    const updated = await tx.encounter.findUniqueOrThrow({ where: { id } });
    await this.audit.create(
      {
        actorId,
        action: "encounter.status_changed",
        entityType: "Encounter",
        entityId: id,
        oldValues: { status: current.status },
        newValues: { status: target },
      },
      tx,
    );
    return updated;
  }

  /**
   * Send patient to a station: updates encounter status + queue.
   * Used by doctor/nurse/desk for Lab, Pharmacy, Cashier, Triage, Doctor.
   */
  async route(
    id: string,
    station: QueueStation,
    actorId: string,
    assignedDoctorId?: string,
  ) {
    const targetStatus = STATION_STATUS[station];
    if (!targetStatus)
      throw new BadRequestException(`Unsupported station ${station}`);
    if (assignedDoctorId) await this.assertActiveDoctor(assignedDoctorId);

    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: { id, deletedAt: null },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (["COMPLETED", "CANCELLED"].includes(encounter.status))
        throw new ConflictException("Visit is already closed");

      const nextAssignedDoctorId =
        assignedDoctorId ?? encounter.assignedDoctorId ?? null;

      if (
        encounter.status !== targetStatus ||
        (assignedDoctorId &&
          assignedDoctorId !== encounter.assignedDoctorId)
      ) {
        if (
          encounter.status !== targetStatus &&
          !ENCOUNTER_TRANSITIONS[encounter.status].includes(targetStatus)
        )
          throw new ConflictException(
            `Cannot send patient from ${encounter.status} to ${station}`,
          );
        await tx.encounter.update({
          where: { id },
          data: {
            status: targetStatus,
            closedAt: null,
            ...(assignedDoctorId
              ? { assignedDoctorId: assignedDoctorId }
              : {}),
          },
        });
      }

      await tx.queueEntry.updateMany({
        where: {
          encounterId: id,
          station: { not: station },
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const openDest = await tx.queueEntry.findFirst({
        where: {
          encounterId: id,
          station,
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
      });
      if (!openDest) {
        await tx.queueEntry.create({
          data: {
            encounterId: id,
            station,
            priority: encounter.priority,
            assignedToId:
              station === "DOCTOR" ? nextAssignedDoctorId : null,
          },
        });
      } else if (station === "DOCTOR" && nextAssignedDoctorId) {
        await tx.queueEntry.update({
          where: { id: openDest.id },
          data: { assignedToId: nextAssignedDoctorId },
        });
      }

      await this.audit.create(
        {
          actorId,
          action: "encounter.routed",
          entityType: "Encounter",
          entityId: id,
          oldValues: { status: encounter.status },
          newValues: {
            status: targetStatus,
            station,
            assignedDoctorId: nextAssignedDoctorId,
          },
        },
        tx,
      );

      if (station === "CASHIER") {
        await this.notifications.createForRoles(
          DESK_NOTIFY_ROLES,
          {
            type: "SYSTEM",
            title: "Patient sent to cashier",
            message: `${encounter.encounterNumber} — collect payment`,
            entityType: "Encounter",
            entityId: id,
          },
          tx,
        );
      }

      return tx.encounter.findUniqueOrThrow({
        where: { id },
        include: {
          patient: true,
          assignedDoctor: {
            select: { id: true, firstName: true, lastName: true },
          },
          queueEntries: {
            where: { status: { in: ["WAITING", "CALLED", "IN_SERVICE"] } },
          },
        },
      });
    });
  }

  async assignDoctor(
    id: string,
    assignedDoctorId: string,
    actorId: string,
  ) {
    await this.assertActiveDoctor(assignedDoctorId);
    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: { id, deletedAt: null },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (["COMPLETED", "CANCELLED"].includes(encounter.status))
        throw new ConflictException("Visit is already closed");

      const updated = await tx.encounter.update({
        where: { id },
        data: { assignedDoctorId },
        include: {
          patient: true,
          assignedDoctor: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await tx.queueEntry.updateMany({
        where: {
          encounterId: id,
          station: "DOCTOR",
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
        data: { assignedToId: assignedDoctorId },
      });

      await this.audit.create(
        {
          actorId,
          action: "encounter.doctor_assigned",
          entityType: "Encounter",
          entityId: id,
          oldValues: { assignedDoctorId: encounter.assignedDoctorId },
          newValues: { assignedDoctorId },
        },
        tx,
      );
      return updated;
    });
  }

  private async assertActiveDoctor(doctorId: string) {
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        role: "DOCTOR",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!doctor)
      throw new BadRequestException(
        "Assigned doctor must be an active doctor user",
      );
  }

  async requestBilling(
    encounterId: string,
    actorId: string,
    actorRole?: Role,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
      include: {
        patient: true,
        consultation: true,
        invoice: true,
      },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
    const elevated = actorRole === Role.ADMIN || actorRole === Role.CEO;
    if (
      !elevated &&
      encounter.consultation?.doctorId &&
      encounter.consultation.doctorId !== actorId
    )
      throw new ConflictException(
        "Only the consulting doctor can request billing for this visit",
      );

    // Route to cashier so desk sees them on the payment queue
    await this.route(encounterId, "CASHIER", actorId);

    const label = encounter.patient
      ? `${encounter.patient.firstName} ${encounter.patient.lastName}`
      : encounter.encounterNumber;
    const invoiceHint = encounter.invoice
      ? ` Invoice ${encounter.invoice.invoiceNumber} (${encounter.invoice.status}).`
      : " Create invoice if needed.";
    await this.notifications.createForRoles(DESK_NOTIFY_ROLES, {
      type: "SYSTEM",
      title: "Payment requested",
      message: `Doctor sent ${label} (${encounter.encounterNumber}) to cashier.${invoiceHint}`,
      entityType: "Encounter",
      entityId: encounterId,
    });
    await this.audit.create({
      actorId,
      action: "encounter.billing_requested",
      entityType: "Encounter",
      entityId: encounterId,
    });
    return { success: true, encounterId };
  }
}
