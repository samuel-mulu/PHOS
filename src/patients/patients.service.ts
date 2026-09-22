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
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async create(dto: CreatePatientDto, actorId: string) {
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
