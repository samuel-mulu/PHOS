import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/types/auth-user";
import { NotificationType } from "../generated/prisma/client";
import type { AlertPriority } from "./notification-priority";

export type NotificationSocketPayload = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
  priority: AlertPriority;
};

@WebSocketGateway({
  namespace: "/notifications",
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<AuthUser & { sub: string }>(
        token,
        { secret: this.config.getOrThrow("JWT_ACCESS_SECRET") },
      );
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: "ACTIVE", deletedAt: null },
        select: { id: true, role: true },
      });
      if (!user) {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      client.data.role = user.role;
      await client.join(this.userRoom(user.id));
      this.logger.debug(`Notification socket connected user=${user.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.logger.debug(`Notification socket disconnected user=${userId}`);
    }
  }

  pushNew(userId: string, notification: NotificationSocketPayload) {
    this.server.to(this.userRoom(userId)).emit("notification:new", notification);
  }

  pushCount(userId: string, total: number) {
    this.server
      .to(this.userRoom(userId))
      .emit("notification:count", { total });
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7);
    }
    return undefined;
  }
}
