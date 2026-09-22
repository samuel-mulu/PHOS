import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma, Role } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  createForUser(
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
    return tx.notification.create({ data: input });
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
    return tx.notification.createMany({
      data: users.map((user) => ({ ...input, recipientId: user.id })),
    });
  }
  list(recipientId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { recipientId, readAt: unreadOnly ? null : undefined },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  async markRead(id: string, recipientId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException("Notification not found");
    return { success: true };
  }
  async markAllRead(recipientId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
