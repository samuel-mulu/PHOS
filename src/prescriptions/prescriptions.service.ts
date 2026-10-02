import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrescriptionStatus, Role } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePrescriptionDto } from "./dto/prescription.dto";
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
  async create(
    consultationId: string,
    dto: CreatePrescriptionDto,
    actorId: string,
    actorRole: Role = Role.DOCTOR,
  ) {
    const isElevated = actorRole === Role.ADMIN || actorRole === Role.CEO;
    const consultation = await this.prisma.consultation.findFirst({
      where: {
        id: consultationId,
        status: "DRAFT",
        deletedAt: null,
        ...(isElevated ? {} : { doctorId: actorId }),
      },
      include: { encounter: true },
    });
    if (!consultation)
      throw new ConflictException(
        "Prescription requires an active draft consultation you own",
      );
    const doctorId = consultation.doctorId;
    const medicineIds = [...new Set(dto.items.map((item) => item.medicineId))];
    const count = await this.prisma.medicine.count({
      where: { id: { in: medicineIds }, active: true, deletedAt: null },
    });
    if (count !== medicineIds.length)
      throw new BadRequestException(
        "One or more medicines are invalid or inactive",
      );
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('prescription_number_seq')`;
      const prescription = await tx.prescription.create({
        data: {
          prescriptionNumber: `RX-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          consultationId,
          encounterId: consultation.encounterId,
          patientId: consultation.encounter.patientId,
          doctorId,
          notes: dto.notes,
          items: { create: dto.items },
        },
        include: { items: { include: { medicine: true } } },
      });
      await tx.encounter.update({
        where: { id: consultation.encounterId },
        data: { status: "WAITING_PHARMACY" },
      });
      const existingQueue = await tx.queueEntry.findFirst({
        where: {
          encounterId: consultation.encounterId,
          station: "PHARMACY",
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
      });
      if (!existingQueue)
        await tx.queueEntry.create({
          data: {
            encounterId: consultation.encounterId,
            station: "PHARMACY",
            priority: consultation.encounter.priority,
          },
        });
      await this.notifications.createForRoles(
        [Role.PHARMACIST],
        {
          type: "PRESCRIPTION_CREATED",
          title: "New prescription",
          message: `${prescription.prescriptionNumber} is waiting to dispense`,
          entityType: "Prescription",
          entityId: prescription.id,
        },
        tx,
      );
      await this.audit.create(
        {
          actorId,
          action: "prescription.created",
          entityType: "Prescription",
          entityId: prescription.id,
        },
        tx,
      );
      return prescription;
    });
  }
  list(status?: PrescriptionStatus) {
    return this.prisma.prescription.findMany({
      where: { status },
      include: {
        patient: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { medicine: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }
  async find(id: string) {
    const item = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: true,
        items: { include: { medicine: true } },
        dispensings: { include: { items: true } },
      },
    });
    if (!item) throw new NotFoundException("Prescription not found");
    return item;
  }
  async cancel(id: string, actorId: string) {
    const item = await this.prisma.prescription.findUnique({ where: { id } });
    if (!item || !["ACTIVE", "PARTIAL"].includes(item.status))
      throw new ConflictException("Prescription cannot be cancelled");
    if (item.doctorId !== actorId)
      throw new ConflictException("Only the prescribing doctor can cancel it");
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await this.audit.create({
      actorId,
      action: "prescription.cancelled",
      entityType: "Prescription",
      entityId: id,
    });
    return updated;
  }
}
