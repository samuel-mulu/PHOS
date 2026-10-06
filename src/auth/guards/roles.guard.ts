import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../../generated/prisma/client";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { AuthUser } from "../../common/types/auth-user";
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user: AuthUser }>().user;
    if (!user) throw new ForbiddenException("Insufficient permission");
    // ADMIN and CEO are superusers: always allowed, even on endpoints that
    // only list operational roles (e.g. LAB_SUPERVISOR-only lab verification),
    // so they can always unblock a stuck workflow.
    if (user.role === Role.ADMIN || user.role === Role.CEO) return true;
    if (!roles.includes(user.role))
      throw new ForbiddenException("Insufficient permission");
    return true;
  }
}
