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
  async list(
    station: QueueStation,
    assignedToId?: string,
    forDoctorId?: string,
  ) {
    const rows = await this.prisma.queueEntry.findMany({
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
            invoice: {
              select: {
                id: true,
                status: true,
                totalCents: true,
                paidCents: true,
              },
            },
            assignedDoctor: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy:
        station === "CASHIER"
          ? [{ enteredAt: "desc" }]
          : [{ priority: "desc" }, { enteredAt: "desc" }],
    });

    if (station !== "CASHIER") return rows;

    // Drop stale cashier rows: visit already closed or invoice already paid.
    const staleIds: string[] = [];
    const paidEncounterIds = new Set<string>();
    const active = rows.filter((row) => {
      const enc = row.encounter;
      const inv = enc.invoice;
      const unpaid =
        inv != null ? Math.max(0, inv.totalCents - inv.paidCents) : 0;
      const paidOff =
        inv != null && (inv.status === "PAID" || unpaid <= 0);
      const done =
        enc.status === "COMPLETED" ||
        enc.status === "CANCELLED" ||
        paidOff;
      if (done) staleIds.push(row.id);
      if (paidOff && enc.status === "WAITING_PAYMENT") {
        paidEncounterIds.add(enc.id);
      }
      return !done;
    });
    if (staleIds.length > 0) {
      await this.prisma.queueEntry.updateMany({
        where: { id: { in: staleIds } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
    if (paidEncounterIds.size > 0) {
      await this.prisma.encounter.updateMany({
        where: {
          id: { in: [...paidEncounterIds] },
          status: "WAITING_PAYMENT",
        },
        data: {
          status: "COMPLETED",
          closedAt: new Date(),
          paymentReturnStation: null,
        },
      });
    }
    return active;
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
    // Call may go WAITING → IN_SERVICE in one step (Start button removed).
    const allowed = {
      WAITING: ["CALLED", "IN_SERVICE", "CANCELLED"],
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
        calledAt:
          dto.status === "CALLED" ||
          (dto.status === "IN_SERVICE" && !current.calledAt)
            ? now
            : current.calledAt,
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
