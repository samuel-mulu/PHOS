import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppointmentStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateAppointmentDto } from "./dto/appointment.dto";

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(params: { from?: Date; to?: Date; status?: AppointmentStatus }) {
    return this.prisma.appointment.findMany({
      where: {
        scheduledAt: {
          gte: params.from,
          lte: params.to,
        },
        status: params.status,
      },
      include: {
        patient: true,
        department: true,
        service: true,
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    });
  }

  create(dto: CreateAppointmentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          scheduledAt: new Date(dto.scheduledAt),
          departmentId: dto.departmentId,
          serviceId: dto.serviceId,
          notes: dto.notes,
          createdById: actorId,
        },
        include: { patient: true, department: true, service: true },
      });
      await this.audit.create(
        {
          actorId,
          action: "appointment.created",
          entityType: "Appointment",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async updateStatus(id: string, status: AppointmentStatus, actorId: string) {
    const item = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: { patient: true },
    });
    await this.audit.create({
      actorId,
      action: "appointment.status_changed",
      entityType: "Appointment",
      entityId: id,
      newValues: { status },
    });
    return item;
  }

  async linkEncounter(id: string, encounterId: string, actorId: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException("Appointment not found");
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, patientId: appt.patientId, deletedAt: null },
    });
    if (!encounter)
      throw new ConflictException("Encounter does not match appointment patient");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { encounterId, status: "CHECKED_IN" },
        include: { patient: true },
      });
      await this.audit.create(
        {
          actorId,
          action: "appointment.checked_in",
          entityType: "Appointment",
          entityId: id,
          newValues: { encounterId },
        },
        tx,
      );
      return updated;
    });
  }
}
