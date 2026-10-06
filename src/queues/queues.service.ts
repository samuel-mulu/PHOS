import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { QueueStation } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQueueEntryDto, UpdateQueueEntryDto } from "./dto/queue.dto";
@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  list(station: QueueStation, assignedToId?: string, forDoctorId?: string) {
    return this.prisma.queueEntry.findMany({
      where: {
        station,
        status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        ...(assignedToId ? { assignedToId } : {}),
        // Doctor users: own assigned patients + unassigned (so desk can still share)
        ...(forDoctorId && !assignedToId
          ? {
              OR: [{ assignedToId: forDoctorId }, { assignedToId: null }],
            }
          : {}),
      },
      include: {
        encounter: {
          include: {
            patient: true,
            service: true,
            assignedDoctor: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ priority: "desc" }, { enteredAt: "asc" }],
    });
  }
  async create(dto: CreateQueueEntryDto, actorId: string) {
    const exists = await this.prisma.queueEntry.findFirst({
      where: {
        encounterId: dto.encounterId,
        station: dto.station,
        status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
      },
    });
    if (exists) return exists;
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: dto.encounterId, deletedAt: null },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
    const item = await this.prisma.queueEntry.create({
      data: { ...dto, priority: encounter.priority },
    });
    await this.audit.create({
      actorId,
      action: "queue.entry_created",
      entityType: "QueueEntry",
      entityId: item.id,
    });
    return item;
  }
  async update(id: string, dto: UpdateQueueEntryDto, actorId: string) {
    const current = await this.prisma.queueEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Queue entry not found");
    const allowed = {
      WAITING: ["CALLED", "CANCELLED"],
      CALLED: ["IN_SERVICE", "WAITING", "CANCELLED"],
      IN_SERVICE: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    } as const;
    if (
      current.status !== dto.status &&
      !(allowed[current.status] as readonly string[]).includes(dto.status)
    )
      throw new ConflictException(
        `Cannot change queue from ${current.status} to ${dto.status}`,
      );
    const now = new Date();
    const item = await this.prisma.queueEntry.update({
      where: { id },
      data: {
        ...dto,
        calledAt: dto.status === "CALLED" ? now : current.calledAt,
        serviceStartedAt:
          dto.status === "IN_SERVICE" ? now : current.serviceStartedAt,
        completedAt: dto.status === "COMPLETED" ? now : current.completedAt,
      },
    });
    await this.audit.create({
      actorId,
      action: "queue.entry_updated",
      entityType: "QueueEntry",
      entityId: id,
      oldValues: { status: current.status },
      newValues: { status: dto.status },
    });
    return item;
  }
}
