import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma/client";
import { invoiceBalance, invoiceDueNow } from "../common/domain/finance";
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
import {
  formatAutoPatientNumber,
  normalizePatientNumber,
  parsePatientNumberNumeric,
} from "./patient-number.util";
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async create(dto: CreatePatientDto, actorId: string) {
    dto = sanitizeCreatePatientDto(dto);
    const { patientNumber: rawNumber, ...patientFields } = dto;

    let patientNumber: string | undefined;
    if (rawNumber) {
      const normalized = normalizePatientNumber(rawNumber);
      if (!normalized) {
        throw new BadRequestException(
          "Invalid clinic patient number (expected HC followed by digits)",
        );
      }
      const existing = await this.prisma.patient.findFirst({
        where: {
          patientNumber: { equals: normalized, mode: "insensitive" },
          deletedAt: null,
        },
        select: {
          id: true,
          patientNumber: true,
          firstName: true,
          lastName: true,
          phone: true,
          dateOfBirth: true,
        },
      });
      if (existing) {
        throw new ConflictException({
          message: "Patient number already registered",
          matches: [existing],
        });
      }
      patientNumber = normalized;
    }

    const duplicate = await this.detectDuplicate(dto);
    if (duplicate.length)
      throw new ConflictException({
        message: "Possible duplicate patient",
        matches: duplicate,
      });
    return this.prisma.$transaction(async (tx) => {
      if (!patientNumber) {
        const seq = await tx.$queryRaw<
          Array<{ nextval: bigint }>
        >`SELECT nextval('patient_number_seq')`;
        patientNumber = formatAutoPatientNumber(seq[0]!.nextval);
      } else {
        const numeric = parsePatientNumberNumeric(patientNumber);
        if (numeric != null) {
          await tx.$executeRawUnsafe(
            `SELECT setval('patient_number_seq', GREATEST((SELECT last_value FROM patient_number_seq), ${numeric}), true)`,
          );
        }
      }
      const patient = await tx.patient.create({
        data: {
          ...patientFields,
          patientNumber,
          createdById: actorId,
        },
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
    const normalized =
      normalizePatientNumber(patientNumber) ?? patientNumber.trim();
    const patient = await this.prisma.patient.findFirst({
      where: {
        patientNumber: { equals: normalized, mode: "insensitive" },
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
    const [
      encounters,
      labOrders,
      prescriptions,
      invoices,
      appointments,
      obstetricHistory,
      ancVisits,
      familyPlanningRecords,
      clinicalMessages,
    ] = await Promise.all([
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
          laborAdmission: {
            include: {
              monitoringEntries: { orderBy: { recordedAt: "asc" } },
            },
          },
          deliverySummary: {
            include: { newborns: { orderBy: { birthOrder: "asc" } } },
          },
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
        include: { items: true, payments: true, adjustments: true },
      }),
      this.prisma.appointment.findMany({
        where: { patientId: id },
        orderBy: { scheduledAt: "desc" },
        take: 15,
      }),
      this.prisma.obstetricHistory.findFirst({
        where: { patientId: id, deletedAt: null },
      }),
      this.prisma.ancVisit.findMany({
        where: { patientId: id, deletedAt: null },
        orderBy: { visitNumber: "asc" },
        take: 20,
      }),
      this.prisma.familyPlanningRecord.findMany({
        where: { patientId: id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.clinicalMessage.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          labOrder: {
            select: { id: true, orderNumber: true, status: true },
          },
          encounter: {
            select: {
              id: true,
              encounterNumber: true,
              visitNumber: true,
              startedAt: true,
            },
          },
        },
      }),
    ]);
    const invoicesWithBalance = invoices.map((inv) => ({
      ...inv,
      balanceCents: inv.status === "VOID" ? 0 : invoiceBalance(inv),
    }));
    return {
      patient,
      encounters,
      labOrders,
      prescriptions,
      invoices: invoicesWithBalance,
      appointments,
      maternal: { obstetricHistory, ancVisits, familyPlanningRecords },
      clinicalMessages,
    };
  }

  /** Everything the patient still owes across all visits (pay later, partial). */
  async balance(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const invoices = await this.prisma.invoice.findMany({
      where: { patientId: id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      orderBy: { createdAt: "asc" },
      include: {
        encounter: {
          select: {
            id: true,
            encounterNumber: true,
            visitNumber: true,
            status: true,
            startedAt: true,
          },
        },
      },
    });
    const rows = invoices
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        createdAt: inv.createdAt,
        encounter: inv.encounter,
        totalCents: inv.totalCents,
        paidCents: inv.paidCents,
        waivedCents: inv.waivedCents,
        deferredCents: inv.deferredCents,
        balanceCents: invoiceBalance(inv),
        dueNowCents: invoiceDueNow(inv),
      }))
      .filter((r) => r.balanceCents > 0);
    return {
      patientId: id,
      outstandingCents: rows.reduce((sum, r) => sum + r.balanceCents, 0),
      /** Debt from visits that already left the cashier (pay later). */
      payLaterCents: rows.reduce(
        (sum, r) =>
          sum +
          (r.encounter.status === "WAITING_PAYMENT"
            ? Math.min(r.deferredCents, r.balanceCents)
            : r.balanceCents),
        0,
      ),
      invoices: rows,
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

  /** Soft-delete: hide from search/lists; keep visits, labs, invoices. */
  async softDelete(id: string, actorId: string) {
    const patient = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.audit.create(
        {
          actorId,
          action: "patient.deleted",
          entityType: "Patient",
          entityId: id,
          oldValues: {
            id: patient.id,
            patientNumber: patient.patientNumber,
            firstName: patient.firstName,
            lastName: patient.lastName,
            deletedAt: patient.deletedAt,
          },
          newValues: {
            id: updated.id,
            patientNumber: updated.patientNumber,
            deletedAt: updated.deletedAt,
          },
        },
        tx,
      );
      return updated;
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
