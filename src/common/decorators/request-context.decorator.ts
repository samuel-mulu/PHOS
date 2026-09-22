import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}
export const RequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const req = context.switchToHttp().getRequest<Request>();
    return { ip: req.ip, userAgent: req.get("user-agent") };
  },
);
