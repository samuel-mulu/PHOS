import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
export interface AuditInput {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  create(input: AuditInput, tx: Prisma.TransactionClient = this.prisma) {
    return tx.auditLog.create({ data: input });
  }
}
