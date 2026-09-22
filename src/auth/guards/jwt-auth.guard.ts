import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { AuthUser } from "../../common/types/auth-user";
import { PrismaService } from "../../prisma/prisma.service";
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user: AuthUser }>();
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedException("Missing access token");
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { sub: string }>(
        token,
        { secret: this.config.getOrThrow("JWT_ACCESS_SECRET") },
      );
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: "ACTIVE", deletedAt: null },
        select: { id: true, email: true, role: true },
      });
      if (!user) throw new UnauthorizedException("Account unavailable");
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
