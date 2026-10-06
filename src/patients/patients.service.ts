import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreatePatientDto,
  PatientQueryDto,
  UpdatePatientDto,
} from "./dto/patient.dto";
import {
  sanitizeCreatePatientDto,
  sanitizeUpdatePatientDto,
} from "./patient-payload.util";
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async create(dto: CreatePatientDto, actorId: string) {
    dto = sanitizeCreatePatientDto(dto);
    const duplicate = await this.detectDuplicate(dto);
    if (duplicate.length)
      throw new ConflictException({
        message: "Possible duplicate patient",
        matches: duplicate,
      });
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('patient_number_seq')`;
      const patientNumber = `PHOS-${seq[0].nextval.toString().padStart(6, "0")}`;
      const patient = await tx.patient.create({
        data: { ...dto, patientNumber, createdById: actorId },
      });
      await this.audit.create(
        {
          actorId,
          action: "patient.created",
          entityType: "Patient",
          entityId: patient.id,
        },
        tx,
      );
      return patient;
    });
  }
  async list(query: PatientQueryDto) {
    const where = {
      deletedAt: null,
      OR: query.search
        ? [
            {
              patientNumber: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              firstName: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            {
              lastName: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
            { phone: { contains: query.search } },
            {
              governmentId: {
                contains: query.search,
                mode: "insensitive" as const,
              },
            },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.patient.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async findByPatientNumber(patientNumber: string) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        patientNumber: { equals: patientNumber, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }
  async getChart(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const [encounters, labOrders, prescriptions, invoices, appointments] =
      await Promise.all([
        this.prisma.encounter.findMany({
          where: { patientId: id, deletedAt: null },
          orderBy: { startedAt: "desc" },
          take: 30,
          include: {
            triage: true,
            assignedDoctor: {
              select: { id: true, firstName: true, lastName: true },
            },
            consultation: {
              include: {
                doctor: {
                  select: { id: true, firstName: true, lastName: true },
                },
                diagnoses: { where: { deletedAt: null } },
              },
            },
            service: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true } },
          },
        }),
        this.prisma.labOrder.findMany({
          where: { patientId: id },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: {
            items: { include: { labTest: true, result: true } },
            doctor: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        }),
        this.prisma.prescription.findMany({
          where: { patientId: id },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: {
            doctor: {
              select: { id: true, firstName: true, lastName: true },
            },
            items: {
              include: {
                medicine: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    strength: true,
                    form: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.invoice.findMany({
          where: { patientId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { items: true, payments: true },
        }),
        this.prisma.appointment.findMany({
          where: { patientId: id },
          orderBy: { scheduledAt: "desc" },
          take: 15,
        }),
      ]);
    return {
      patient,
      encounters,
      labOrders,
      prescriptions,
      invoices,
      appointments,
    };
  }
  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      include: {
        encounters: {
          where: { deletedAt: null },
          orderBy: { startedAt: "desc" },
          take: 20,
        },
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }
  async update(id: string, dto: UpdatePatientDto, actorId: string) {
    dto = sanitizeUpdatePatientDto(dto);
    const old = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.update({ where: { id }, data: dto });
      await this.audit.create(
        {
          actorId,
          action: "patient.updated",
          entityType: "Patient",
          entityId: id,
          oldValues: old,
          newValues: patient,
        },
        tx,
      );
      return patient;
    });
  }
  private detectDuplicate(dto: CreatePatientDto) {
    const candidates: Prisma.PatientWhereInput[] = [];
    if (dto.governmentId) candidates.push({ governmentId: dto.governmentId });
    if (dto.phone)
      candidates.push({
        phone: dto.phone,
        firstName: { equals: dto.firstName, mode: "insensitive" },
      });
    if (dto.dateOfBirth)
      candidates.push({
        firstName: { equals: dto.firstName, mode: "insensitive" },
        lastName: { equals: dto.lastName, mode: "insensitive" },
        dateOfBirth: dto.dateOfBirth,
      });
    if (!candidates.length) return Promise.resolve([]);
    return this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: candidates,
      },
      select: {
        id: true,
        patientNumber: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
      },
      take: 5,
    });
  }
}
