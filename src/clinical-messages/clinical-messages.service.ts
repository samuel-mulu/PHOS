import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import {
  ClinicalMessageAuthorSide,
  ClinicalMessageKind,
  Role,
  type Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClinicalMessageDto } from "./dto/clinical-message.dto";

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

const messageInclude = {
  author: { select: authorSelect },
  labOrder: { select: { id: true, orderNumber: true, status: true } },
} as const;

function authorSideForRole(role: Role): ClinicalMessageAuthorSide {
  if (role === Role.LAB_TECH || role === Role.LAB_SUPERVISOR) {
    return ClinicalMessageAuthorSide.LAB;
  }
  if (
    role === Role.DOCTOR ||
    role === Role.ADMIN ||
    role === Role.CEO ||
    role === Role.NURSE
  ) {
    return ClinicalMessageAuthorSide.DOCTOR;
  }
  throw new ForbiddenException(
    "Only doctor or lab staff can post clinical messages",
  );
}

@Injectable()
export class ClinicalMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ensureEncounter(encounterId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
      select: { id: true, patientId: true },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
    return encounter;
  }

  listByEncounter(encounterId: string) {
    return this.prisma.clinicalMessage.findMany({
      where: { encounterId },
      orderBy: { createdAt: "asc" },
      include: messageInclude,
    });
  }

  async listByPatient(patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    return this.prisma.clinicalMessage.findMany({
      where: { patientId },
      orderBy: { createdAt: "asc" },
      include: {
        ...messageInclude,
        encounter: {
          select: {
            id: true,
            encounterNumber: true,
            visitNumber: true,
            startedAt: true,
          },
        },
      },
    });
  }

  async create(
    encounterId: string,
    dto: CreateClinicalMessageDto,
    actorId: string,
    actorRole: Role,
  ) {
    const encounter = await this.ensureEncounter(encounterId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("Message body is required");

    const kind = dto.kind ?? ClinicalMessageKind.NOTE;
    if (dto.labOrderId) {
      const order = await this.prisma.labOrder.findFirst({
        where: { id: dto.labOrderId, encounterId },
        select: { id: true },
      });
      if (!order) {
        throw new BadRequestException(
          "Lab order not found for this encounter",
        );
      }
    }

    const authorSide = authorSideForRole(actorRole);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.clinicalMessage.create({
        data: {
          encounterId,
          patientId: encounter.patientId,
          authorId: actorId,
          authorSide,
          kind,
          body,
          labOrderId: dto.labOrderId,
        },
        include: messageInclude,
      });
      await this.audit.create(
        {
          actorId,
          action: "clinical_message.created",
          entityType: "ClinicalMessage",
          entityId: item.id,
          metadata: { encounterId, kind, authorSide },
        },
        tx,
      );
      return item;
    });
  }

  /** Used by lab order flows to append a linked note inside an existing transaction. */
  async createLinked(
    tx: Prisma.TransactionClient,
    input: {
      encounterId: string;
      patientId: string;
      authorId: string;
      authorSide: ClinicalMessageAuthorSide;
      kind: ClinicalMessageKind;
      body: string;
      labOrderId?: string;
    },
  ) {
    const body = input.body.trim();
    if (!body) return null;
    return tx.clinicalMessage.create({
      data: {
        encounterId: input.encounterId,
        patientId: input.patientId,
        authorId: input.authorId,
        authorSide: input.authorSide,
        kind: input.kind,
        body,
        labOrderId: input.labOrderId,
      },
    });
  }
}
