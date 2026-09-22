import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/auth.dto";
interface Meta {
  ip?: string;
  userAgent?: string;
}
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  async login(dto: LoginDto, meta: Meta) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !(await argon2.verify(user.passwordHash, dto.password))
    )
      throw new UnauthorizedException("Invalid credentials");
    const result = await this.issue(user.id, user.email, user.role, meta);
    await this.audit.create({
      actorId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      ipAddress: meta.ip,
    });
    return result;
  }
  async refresh(token: string, meta: Meta) {
    const hash = this.hash(token);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE" ||
      session.user.deletedAt
    )
      throw new UnauthorizedException("Invalid refresh token");
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return this.issue(
        session.user.id,
        session.user.email,
        session.user.role,
        meta,
        tx,
      );
    });
  }
  async logout(userId: string, token: string) {
    await this.prisma.refreshSession.updateMany({
      where: { userId, tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  private async issue(
    userId: string,
    email: string,
    role: import("../generated/prisma/client").Role,
    meta: Meta,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      {
        secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get("JWT_ACCESS_TTL", "2h"),
      },
    );
    const refreshToken = randomBytes(48).toString("base64url");
    const days = this.config.get<number>("JWT_REFRESH_TTL_DAYS", 7);
    await tx.refreshSession.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + days * 86_400_000),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return { accessToken, refreshToken, user: { id: userId, email, role } };
  }
  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
