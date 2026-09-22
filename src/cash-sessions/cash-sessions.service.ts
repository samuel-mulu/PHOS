import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { calculateExpectedCash } from "../common/domain/finance";
import {
  CloseCashSessionDto,
  OpenCashSessionDto,
} from "./dto/cash-session.dto";
@Injectable()
export class CashSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async open(dto: OpenCashSessionDto, cashierId: string) {
    const exists = await this.prisma.cashSession.findFirst({
      where: { cashierId, status: "OPEN" },
    });
    if (exists)
      throw new ConflictException("Cashier already has an open session");
    const session = await this.prisma.cashSession.create({
      data: { cashierId, openingFloatCents: dto.openingFloatCents },
    });
    await this.audit.create({
      actorId: cashierId,
      action: "cash_session.opened",
      entityType: "CashSession",
      entityId: session.id,
    });
    return session;
  }
  async current(cashierId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { cashierId, status: "OPEN" },
      include: { payments: { where: { method: "CASH" } } },
    });
    if (!session) throw new NotFoundException("No open cash session");
    return session;
  }
  async close(id: string, dto: CloseCashSessionDto, cashierId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id, cashierId, status: "OPEN" },
      });
      if (!session)
        throw new ConflictException(
          "Cash session is not open for this cashier",
        );
      const aggregate = await tx.payment.aggregate({
        where: { cashSessionId: id, method: "CASH", status: { not: "VOID" } },
        _sum: { amountCents: true, refundedCents: true },
      });
      const expected = calculateExpectedCash(
        session.openingFloatCents,
        aggregate._sum.amountCents ?? 0,
        aggregate._sum.refundedCents ?? 0,
      );
      const updated = await tx.cashSession.update({
        where: { id },
        data: {
          status: "CLOSED",
          expectedCashCents: expected,
          actualCashCents: dto.actualCashCents,
          differenceCents: dto.actualCashCents - expected,
          notes: dto.notes,
          closedAt: new Date(),
        },
      });
      await this.audit.create(
        {
          actorId: cashierId,
          action: "cash_session.closed",
          entityType: "CashSession",
          entityId: id,
        },
        tx,
      );
      return updated;
    });
  }
}
