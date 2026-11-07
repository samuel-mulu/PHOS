import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateFamilyPlanningDto,
  UpdateFamilyPlanningDto,
} from "./dto/family-planning.dto";

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

@Injectable()
export class FamilyPlanningService {
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

  async listByPatient(patientId: string) {
    await this.ensurePatient(patientId);
    return this.prisma.familyPlanningRecord.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string) {
    const item = await this.prisma.familyPlanningRecord.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) throw new NotFoundException("Family planning record not found");
    return item;
  }

  async create(
    patientId: string,
    dto: CreateFamilyPlanningDto,
    actorId: string,
  ) {
    await this.ensurePatient(patientId);
    const { procedureDate, nextAppointment, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.familyPlanningRecord.create({
        data: {
          ...rest,
          patientId,
          procedureDate: parseDate(procedureDate),
          nextAppointment: parseDate(nextAppointment),
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "family_planning.created",
          entityType: "FamilyPlanningRecord",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }

  async update(id: string, dto: UpdateFamilyPlanningDto, actorId: string) {
    await this.getById(id);
    const { procedureDate, nextAppointment, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.familyPlanningRecord.update({
        where: { id },
        data: {
          ...rest,
          ...(procedureDate !== undefined
            ? { procedureDate: parseDate(procedureDate) }
            : {}),
          ...(nextAppointment !== undefined
            ? { nextAppointment: parseDate(nextAppointment) }
            : {}),
          recordedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "family_planning.updated",
          entityType: "FamilyPlanningRecord",
          entityId: item.id,
        },
        tx,
      );
      return item;
    });
  }
}
