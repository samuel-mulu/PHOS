import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { EncounterStatus, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEncounterDto } from "./dto/encounter.dto";
import { ENCOUNTER_TRANSITIONS } from "./encounter-state";
@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async create(dto: CreateEncounterDto, actorId: string) {
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
          ...dto,
          encounterNumber: `ENC-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          createdById: actorId,
          status: "WAITING_TRIAGE",
        },
      });
      await tx.queueEntry.create({
        data: {
          encounterId: encounter.id,
          station: "TRIAGE",
          priority: encounter.priority,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "encounter.created",
          entityType: "Encounter",
          entityId: encounter.id,
        },
        tx,
      );
      return encounter;
    });
  }
  list(status?: EncounterStatus, patientId?: string) {
    return this.prisma.encounter.findMany({
      where: { status, patientId, deletedAt: null },
      include: { patient: true, service: true, department: true },
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
        queueEntries: { orderBy: { enteredAt: "asc" } },
        triage: true,
        consultation: {
          include: { diagnoses: { where: { deletedAt: null } } },
        },
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
}
