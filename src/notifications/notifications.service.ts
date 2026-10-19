import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  alertPriorityForNotification,
  type AlertPriority,
} from "./notification-priority";
import {
  NotificationsGateway,
  type NotificationSocketPayload,
} from "./notifications.gateway";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createForUser(
    input: {
      recipientId: string;
      type: NotificationType;
      title: string;
      message: string;
      entityType?: string;
      entityId?: string;
    },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const row = await tx.notification.create({ data: input });
    const enriched = this.enrich(row);
    this.scheduleRealtime(row.recipientId, enriched);
    return enriched;
  }

  async createForRoles(
    roles: Role[],
    input: Omit<
      Parameters<NotificationsService["createForUser"]>[0],
      "recipientId"
    >,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const users = await tx.user.findMany({
      where: { role: { in: roles }, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!users.length) return { count: 0 };

    const rows = await Promise.all(
      users.map((user) =>
        tx.notification.create({
          data: { ...input, recipientId: user.id },
        }),
      ),
    );

    for (const row of rows) {
      this.scheduleRealtime(row.recipientId, this.enrich(row));
    }
    return { count: rows.length };
  }

  private enrich<
    T extends {
      id: string;
      type: NotificationType;
      title: string;
      message: string;
      entityType: string | null;
      entityId: string | null;
      readAt: Date | null;
      createdAt: Date;
    },
  >(row: T) {
    return {
      ...row,
      priority: alertPriorityForNotification(row.type, row.title),
    };
  }

  private toSocketPayload(
    row: ReturnType<NotificationsService["enrich"]>,
  ): NotificationSocketPayload {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      entityType: row.entityType,
      entityId: row.entityId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      priority: row.priority,
    };
  }

  /** Defer until after the surrounding Prisma transaction is likely committed. */
  private scheduleRealtime(
    recipientId: string,
    row: ReturnType<NotificationsService["enrich"]>,
  ) {
    const payload = this.toSocketPayload(row);
    setTimeout(() => {
      void this.emitRealtime(recipientId, payload);
    }, 150);
  }

  private async emitRealtime(
    recipientId: string,
    payload: NotificationSocketPayload,
  ) {
    try {
      this.gateway.pushNew(recipientId, payload);
      const summary = await this.unreadSummary(recipientId);
      this.gateway.pushCount(recipientId, summary.total);
    } catch {
      // Socket may be down; REST polling remains the fallback.
    }
  }

  async list(
    recipientId: string,
    unreadOnly = false,
    priority?: AlertPriority,
  ) {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId, readAt: unreadOnly ? null : undefined },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const enriched = rows.map((row) => this.enrich(row));
    if (!priority) return enriched;
    return enriched.filter((row) => row.priority === priority);
  }

  async unreadSummary(recipientId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId, readAt: null },
      select: { type: true, title: true },
    });
    const summary: Record<AlertPriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      NORMAL: 0,
    };
    for (const row of rows) {
      summary[alertPriorityForNotification(row.type, row.title)] += 1;
    }
    return { total: rows.length, byPriority: summary };
  }

  async markRead(id: string, recipientId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException("Notification not found");
    const summary = await this.unreadSummary(recipientId);
    this.gateway.pushCount(recipientId, summary.total);
    return { success: true };
  }

  async markAllRead(recipientId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    this.gateway.pushCount(recipientId, 0);
    return result;
  }
}
