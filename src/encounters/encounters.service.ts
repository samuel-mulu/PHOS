import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { DESK_NOTIFY_ROLES } from "../common/constants/desk-roles";
import {
  EncounterPriority,
  EncounterStatus,
  Prisma,
  QueueStation,
  Role,
} from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEncounterDto, PaymentRequestDto } from "./dto/encounter.dto";
import { ENCOUNTER_TRANSITIONS, STATION_STATUS } from "./encounter-state";
import { nextVisitNumber } from "./visit-number";

@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly billing: BillingService,
  ) {}

  async create(dto: CreateEncounterDto, actorId: string) {
    const { initialStation, assignedDoctorId, ...encounterFields } = dto;
    const station: "TRIAGE" | "DOCTOR" =
      initialStation === "TRIAGE" ? "TRIAGE" : "DOCTOR";
    const status = STATION_STATUS[station];

    const department = await this.prisma.department.findFirst({
      where: {
        id: dto.departmentId,
        facilityId: dto.facilityId,
        active: true,
        deletedAt: null,
      },
    });
    if (!department)
      throw new BadRequestException(
        "Facility and department do not form an active configuration",
      );

    if (dto.serviceId) {
      const config = await this.prisma.service.findFirst({
        where: {
          id: dto.serviceId,
          departmentId: dto.departmentId,
          active: true,
          deletedAt: null,
        },
      });
      if (!config)
        throw new BadRequestException(
          "Selected clinic service is invalid or inactive",
        );
    }
    if (assignedDoctorId)
      await this.assertActiveDoctor(assignedDoctorId);
    const active = await this.prisma.encounter.findFirst({
      where: {
        patientId: dto.patientId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        deletedAt: null,
      },
      include: {
        assignedDoctor: {
          select: { firstName: true, lastName: true },
        },
        invoice: {
          select: { status: true, totalCents: true, paidCents: true },
        },
        consultation: { select: { id: true, status: true } },
      },
    });
    if (active) {
      const unpaid = active.invoice
        ? Math.max(0, active.invoice.totalCents - active.invoice.paidCents)
        : 0;
      const paidOff =
        !active.invoice ||
        active.invoice.status === "PAID" ||
        unpaid <= 0;

      // Stuck at cashier after fee already collected - close so a new return can start.
      if (active.status === "WAITING_PAYMENT" && paidOff) {
        await this.closePaidVisit(active.id);
      } else {
        if (active.status === "WAITING_PAYMENT" && unpaid > 0) {
          await this.ensureCashierQueue(active.id, active.priority);
        }
        const doctor = active.assignedDoctor
          ? `Dr. ${active.assignedDoctor.firstName} ${active.assignedDoctor.lastName}`
          : "the doctor";
        const visit =
          active.visitNumber != null ? `Visit ${active.visitNumber}` : "visit";
        if (active.status === "WAITING_PAYMENT") {
          throw new ConflictException(
            `${visit} (${active.encounterNumber}) still has unpaid balance. Collect payment at cashier first, then you can start a new return. Currently with ${doctor}.`,
          );
        }
        const status = active.status.replaceAll("_", " ").toLowerCase();
        throw new ConflictException(
          `${doctor} still has an incomplete ${visit} (${active.encounterNumber}, ${status}). Ask them to complete it before starting a new return visit. Multiple visits the same day are allowed after the current one is completed.`,
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('encounter_number_seq')`;
      const visitNumber = await nextVisitNumber(tx, dto.patientId);
      const encounter = await tx.encounter.create({
        data: {
          ...encounterFields,
          assignedDoctorId: assignedDoctorId ?? null,
          encounterNumber: `ENC-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          visitNumber,
          createdById: actorId,
          status,
        },
        include: {
          patient: true,
          service: true,
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

  async list(
    status?: EncounterStatus,
    patientId?: string,
    opts?: {
      assignedDoctorId?: string;
      open?: boolean;
      /** Completed visits closed today (local server day). */
      completedToday?: boolean;
    },
  ) {
    const assignedDoctorId = opts?.assignedDoctorId;
    const completedToday = Boolean(opts?.completedToday);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const rows = await this.prisma.encounter.findMany({
      where: {
        deletedAt: null,
        ...(patientId ? { patientId } : {}),
        ...(completedToday
          ? {
              status: "COMPLETED",
              OR: [
                { closedAt: { gte: dayStart, lte: dayEnd } },
                {
                  closedAt: null,
                  startedAt: { gte: dayStart, lte: dayEnd },
                },
              ],
            }
          : status
            ? { status }
            : opts?.open
              ? { status: { notIn: ["COMPLETED", "CANCELLED"] } }
              : {}),
        ...(assignedDoctorId === "unassigned"
          ? { assignedDoctorId: null }
          : assignedDoctorId
            ? { assignedDoctorId }
            : {}),
      },
      include: {
        patient: true,
        service: true,
        department: true,
        invoice: {
          select: { status: true, totalCents: true, paidCents: true },
        },
        assignedDoctor: {
          select: { id: true, firstName: true, lastName: true },
        },
        ...(completedToday
          ? {
              consultation: {
                select: {
                  chiefComplaint: true,
                  assessment: true,
                  finalizedAt: true,
                  diagnoses: {
                    where: { deletedAt: null },
                    select: {
                      label: true,
                      isPrimary: true,
                    },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: completedToday
        ? [{ closedAt: "desc" }, { startedAt: "desc" }]
        : status === "COMPLETED"
          ? [{ closedAt: "desc" }, { startedAt: "desc" }]
          : { startedAt: "desc" },
      take: opts?.open || completedToday ? 300 : 100,
    });

    if (!opts?.open) return rows;

    const open: typeof rows = [];
    for (const row of rows) {
      const unpaid = row.invoice
        ? Math.max(0, row.invoice.totalCents - row.invoice.paidCents)
        : 0;
      const paidOff =
        !row.invoice || row.invoice.status === "PAID" || unpaid <= 0;
      if (paidOff && row.status === "WAITING_PAYMENT") {
        await this.closePaidVisit(row.id);
        continue;
      }
      if (row.status === "WAITING_PAYMENT" && unpaid > 0) {
        await this.ensureCashierQueue(row.id, row.priority);
      }
      open.push(row);
    }
    return open;
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
      } else {
        await tx.queueEntry.update({
          where: { id: openDest.id },
          data: {
            enteredAt: new Date(),
            status: "WAITING",
            calledAt: null,
            serviceStartedAt: null,
            ...(station === "DOCTOR" && nextAssignedDoctorId
              ? { assignedToId: nextAssignedDoctorId }
              : {}),
          },
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
            message: `${encounter.encounterNumber} - collect payment`,
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

    // Desk/legacy path: route only (no ad-hoc charge). Prefer paymentRequest from clinical UI.
    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { paymentReturnStation: "DOCTOR" },
    });
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
      message: `Doctor sent ${label} (${encounter.encounterNumber}) to cashier.${invoiceHint} Returns to doctor after pay.`,
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

  /**
   * Clinical charge: add invoice line, remember return station, send to cashier.
   */
  async paymentRequest(
    encounterId: string,
    dto: PaymentRequestDto,
    actorId: string,
    actorRole: Role,
  ) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
      include: { patient: true, consultation: true },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
    if (["COMPLETED", "CANCELLED"].includes(encounter.status))
      throw new ConflictException("Visit is already closed");

    const elevated = actorRole === Role.ADMIN || actorRole === Role.CEO;
    const isDoctor = actorRole === Role.DOCTOR;
    const isLab =
      actorRole === Role.LAB_TECH || actorRole === Role.LAB_SUPERVISOR;
    const isPharmacy = actorRole === Role.PHARMACIST;
    const isTriage =
      actorRole === Role.NURSE ||
      actorRole === Role.RECEPTIONIST ||
      actorRole === Role.FRONT_DESK;

    if (!elevated && !isDoctor && !isLab && !isPharmacy && !isTriage)
      throw new ConflictException("Not allowed to request payment");

    if (
      isDoctor &&
      !elevated &&
      encounter.consultation?.doctorId &&
      encounter.consultation.doctorId !== actorId
    )
      throw new ConflictException(
        "Only the consulting doctor can request payment for this visit",
      );

    if (!elevated) {
      if (isDoctor && dto.returnStation !== "DOCTOR")
        throw new BadRequestException(
          "Doctor payment requests return to doctor",
        );
      if (isLab && dto.returnStation !== "LAB")
        throw new BadRequestException("Lab payment requests return to lab");
      if (isPharmacy && dto.returnStation !== "PHARMACY")
        throw new BadRequestException(
          "Pharmacy payment requests return to pharmacy",
        );
      if (
        isTriage &&
        !isDoctor &&
        !isLab &&
        !isPharmacy &&
        dto.returnStation !== "TRIAGE"
      )
        throw new BadRequestException(
          "Triage payment requests return to triage",
        );
    }

    const invoice = await this.billing.addChargeAndEnsurePayable(
      encounterId,
      dto.description,
      dto.amountCents,
      actorId,
    );

    await this.prisma.encounter.update({
      where: { id: encounterId },
      data: { paymentReturnStation: dto.returnStation },
    });

    await this.route(encounterId, "CASHIER", actorId);

    const label = encounter.patient
      ? `${encounter.patient.firstName} ${encounter.patient.lastName}`
      : encounter.encounterNumber;
    const amountEtb = (dto.amountCents / 100).toFixed(2);
    const returnLabels: Record<PaymentRequestDto["returnStation"], string> = {
      DOCTOR: "doctor",
      LAB: "lab",
      PHARMACY: "pharmacy",
      TRIAGE: "triage",
    };
    const returnLabel = returnLabels[dto.returnStation];

    await this.notifications.createForRoles(DESK_NOTIFY_ROLES, {
      type: "SYSTEM",
      title: "Payment request",
      message: `${label} (${encounter.encounterNumber}): ${dto.description.trim()} - ETB ${amountEtb}. Collect, then returns to ${returnLabel}.`,
      entityType: "Encounter",
      entityId: encounterId,
    });
    await this.audit.create({
      actorId,
      action: "encounter.payment_requested",
      entityType: "Encounter",
      entityId: encounterId,
      newValues: {
        description: dto.description.trim(),
        amountCents: dto.amountCents,
        returnStation: dto.returnStation,
        invoiceId: invoice.id,
      },
    });

    return {
      success: true,
      encounterId,
      invoiceId: invoice.id,
      returnStation: dto.returnStation,
    };
  }

  /** Close a visit that still looks open but has nothing left to collect. */
  private async closePaidVisit(encounterId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.findFirst({
        where: { encounterId, deletedAt: null },
      });
      if (consultation?.status === "DRAFT") {
        await tx.consultation.update({
          where: { id: consultation.id },
          data: { status: "FINALIZED", finalizedAt: now },
        });
      }
      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: "COMPLETED",
          closedAt: now,
          paymentReturnStation: null,
        },
      });
      await tx.queueEntry.updateMany({
        where: {
          encounterId,
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
        data: { status: "COMPLETED", completedAt: now },
      });
    });
  }

  private async ensureCashierQueue(
    encounterId: string,
    priority: EncounterPriority,
  ) {
    const open = await this.prisma.queueEntry.findFirst({
      where: {
        encounterId,
        station: "CASHIER",
        status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
      },
    });
    if (open) return;
    await this.prisma.queueEntry.create({
      data: {
        encounterId,
        station: "CASHIER",
        priority,
      },
    });
  }
}
