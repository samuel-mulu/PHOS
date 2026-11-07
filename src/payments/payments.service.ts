import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { DESK_NOTIFY_ROLES } from "../common/constants/desk-roles";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  clampDeferred,
  invoiceBalance,
  invoiceDueNow,
  invoiceStatusFor,
} from "../common/domain/finance";
import { CashierReleaseService } from "./cashier-release.service";
import {
  CreatePaymentDto,
  CreateRefundDto,
  DeferInvoiceDto,
  WaiveInvoiceDto,
} from "./dto/payment.dto";
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly release: CashierReleaseService,
  ) {}
  async create(dto: CreatePaymentDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (replay) {
        if (
          replay.invoiceId !== dto.invoiceId ||
          replay.amountCents !== dto.amountCents ||
          replay.method !== dto.method
        )
          throw new ConflictException(
            "Idempotency key was already used for another payment",
          );
        return replay;
      }
      const invoice = await tx.invoice.findUnique({
        where: { id: dto.invoiceId },
        include: { encounter: { select: { status: true } } },
      });
      if (!invoice || !["ISSUED", "PARTIALLY_PAID"].includes(invoice.status))
        throw new ConflictException("Invoice is not payable");
      const balance = invoiceBalance(invoice);
      if (dto.amountCents > balance)
        throw new BadRequestException("Payment exceeds invoice balance");
      if (dto.cashSessionId) {
        const session = await tx.cashSession.findFirst({
          where: { id: dto.cashSessionId, cashierId: actorId, status: "OPEN" },
        });
        if (!session)
          throw new ConflictException(
            "Cash session is not open for this cashier",
          );
      }

      const atCashier = invoice.encounter.status === "WAITING_PAYMENT";
      const dueBefore = invoiceDueNow(invoice);
      // Money paid beyond what is due now settles earlier pay-later debt.
      const isDebtPayment =
        invoice.deferredCents > 0 && dto.amountCents > dueBefore;
      const after = {
        ...invoice,
        paidCents: invoice.paidCents + dto.amountCents,
      };
      let deferredCents = clampDeferred(after);
      const dueAfter = invoiceDueNow({ ...after, deferredCents });
      const releaseWithBalance =
        atCashier && dueAfter > 0 && dto.afterPayment === "RELEASE";
      const deferReason = dto.deferReason?.trim() ?? "";
      if (releaseWithBalance && !deferReason)
        throw new BadRequestException(
          "Give a reason for letting the patient pay the rest later",
        );

      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('payment_number_seq')`;
      const payment = await tx.payment.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          invoiceId: dto.invoiceId,
          amountCents: dto.amountCents,
          method: dto.method,
          referenceNumber: dto.referenceNumber,
          cashSessionId: dto.cashSessionId,
          isDebtPayment,
          patientId: invoice.patientId,
          paymentNumber: `PAY-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          recordedById: actorId,
        },
      });

      if (releaseWithBalance) {
        deferredCents += dueAfter;
        await tx.invoiceAdjustment.create({
          data: {
            invoiceId: invoice.id,
            patientId: invoice.patientId,
            type: "DEFER",
            amountCents: dueAfter,
            reason: deferReason,
            idempotencyKey: `${dto.idempotencyKey}:defer`,
            recordedById: actorId,
          },
        });
        await this.audit.create(
          {
            actorId,
            action: "invoice.deferred",
            entityType: "Invoice",
            entityId: invoice.id,
            metadata: {
              amountCents: dueAfter,
              reason: deferReason,
              withPayment: payment.paymentNumber,
            },
          },
          tx,
        );
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidCents: after.paidCents,
          deferredCents,
          status: invoiceStatusFor(after),
        },
      });

      let released = false;
      if (atCashier && (dueAfter === 0 || releaseWithBalance)) {
        const result = await this.release.release(tx, invoice.id, actorId, {
          reference: payment.paymentNumber,
          paidNowCents: dto.amountCents,
          owedCents: invoiceBalance(after),
          waivedNowCents: 0,
        });
        released = result.released;
      }

      await this.notifications.createForUser(
        {
          recipientId: actorId,
          type: "PAYMENT_COMPLETED",
          title: "Payment completed",
          message: `${payment.paymentNumber} recorded`,
          entityType: "Payment",
          entityId: payment.id,
        },
        tx,
      );
      if (!released) {
        await this.notifications.createForRoles(
          DESK_NOTIFY_ROLES,
          {
            type: "PAYMENT_COMPLETED",
            title: isDebtPayment ? "Debt payment recorded" : "Payment recorded",
            message: `${payment.paymentNumber} for encounter billing`,
            entityType: "Payment",
            entityId: payment.id,
          },
          tx,
        );
      }
      await this.audit.create(
        {
          actorId,
          action: "payment.completed",
          entityType: "Payment",
          entityId: payment.id,
          metadata: {
            amountCents: dto.amountCents,
            balanceAfterCents: invoiceBalance(after),
            isDebtPayment,
            released,
          },
        },
        tx,
      );
      return payment;
    });
  }

  /** Pay later: patient leaves the cashier without paying; amount becomes debt. */
  async defer(invoiceId: string, dto: DeferInvoiceDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.invoiceAdjustment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (replay) {
        if (replay.invoiceId !== invoiceId || replay.type !== "DEFER")
          throw new ConflictException("Idempotency key was already used");
        return replay;
      }
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { encounter: { select: { status: true } } },
      });
      if (!invoice || !["ISSUED", "PARTIALLY_PAID"].includes(invoice.status))
        throw new ConflictException("Invoice is not payable");
      if (invoice.encounter.status !== "WAITING_PAYMENT")
        throw new ConflictException(
          "Pay later is only for a patient who is waiting at the cashier",
        );
      const due = invoiceDueNow(invoice);
      if (due <= 0)
        throw new ConflictException("Nothing is due now on this invoice");
      const reason = dto.reason.trim();

      const adjustment = await tx.invoiceAdjustment.create({
        data: {
          invoiceId,
          patientId: invoice.patientId,
          type: "DEFER",
          amountCents: due,
          reason,
          idempotencyKey: dto.idempotencyKey,
          recordedById: actorId,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { deferredCents: invoice.deferredCents + due },
      });
      await this.audit.create(
        {
          actorId,
          action: "invoice.deferred",
          entityType: "Invoice",
          entityId: invoiceId,
          metadata: { amountCents: due, reason },
        },
        tx,
      );
      await this.release.release(tx, invoiceId, actorId, {
        reference: invoice.invoiceNumber,
        paidNowCents: 0,
        owedCents: invoiceBalance(invoice),
        waivedNowCents: 0,
      });
      return adjustment;
    });
  }

  /** Waive (free): forgive part or all of the balance. Works on old debt too. */
  async waive(invoiceId: string, dto: WaiveInvoiceDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.invoiceAdjustment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (replay) {
        if (
          replay.invoiceId !== invoiceId ||
          replay.type !== "WAIVE" ||
          replay.amountCents !== dto.amountCents
        )
          throw new ConflictException("Idempotency key was already used");
        return replay;
      }
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { encounter: { select: { status: true } } },
      });
      if (!invoice || !["ISSUED", "PARTIALLY_PAID"].includes(invoice.status))
        throw new ConflictException("Invoice has nothing left to waive");
      const balance = invoiceBalance(invoice);
      if (dto.amountCents > balance)
        throw new BadRequestException("Waive amount exceeds invoice balance");
      const reason = dto.reason.trim();

      const adjustment = await tx.invoiceAdjustment.create({
        data: {
          invoiceId,
          patientId: invoice.patientId,
          type: "WAIVE",
          amountCents: dto.amountCents,
          reason,
          idempotencyKey: dto.idempotencyKey,
          recordedById: actorId,
        },
      });
      const after = {
        ...invoice,
        waivedCents: invoice.waivedCents + dto.amountCents,
      };
      const deferredCents = clampDeferred(after);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          waivedCents: after.waivedCents,
          deferredCents,
          status: invoiceStatusFor(after),
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "invoice.waived",
          entityType: "Invoice",
          entityId: invoiceId,
          metadata: {
            amountCents: dto.amountCents,
            reason,
            balanceAfterCents: invoiceBalance(after),
          },
        },
        tx,
      );
      if (
        invoice.encounter.status === "WAITING_PAYMENT" &&
        invoiceDueNow({ ...after, deferredCents }) === 0
      ) {
        await this.release.release(tx, invoiceId, actorId, {
          reference: invoice.invoiceNumber,
          paidNowCents: 0,
          owedCents: invoiceBalance(after),
          waivedNowCents: dto.amountCents,
        });
      }
      return adjustment;
    });
  }

  async find(id: string) {
    const item = await this.prisma.payment.findUnique({
      where: { id },
      include: { invoice: true, refunds: true },
    });
    if (!item) throw new NotFoundException("Payment not found");
    return item;
  }
  async refund(paymentId: string, dto: CreateRefundDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.refund.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (replay) {
        if (
          replay.paymentId !== paymentId ||
          replay.amountCents !== dto.amountCents
        )
          throw new ConflictException(
            "Idempotency key was already used for another refund",
          );
        return replay;
      }
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      });
      if (
        !payment ||
        !["COMPLETED", "PARTIALLY_REFUNDED"].includes(payment.status)
      )
        throw new ConflictException("Payment is not refundable");
      const refundable = payment.amountCents - payment.refundedCents;
      if (dto.amountCents > refundable)
        throw new BadRequestException("Refund exceeds refundable balance");
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('refund_number_seq')`;
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amountCents: dto.amountCents,
          reason: dto.reason,
          idempotencyKey: dto.idempotencyKey,
          issuedById: actorId,
          refundNumber: `REF-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
        },
      });
      const refundedCents = payment.refundedCents + dto.amountCents;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedCents,
          status:
            refundedCents === payment.amountCents
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED",
        },
      });
      const afterRefund = {
        ...payment.invoice,
        paidCents: payment.invoice.paidCents - dto.amountCents,
      };
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidCents: afterRefund.paidCents,
          status: invoiceStatusFor(afterRefund),
        },
      });
      await this.notifications.createForUser(
        {
          recipientId: payment.recordedById,
          type: "REFUND_COMPLETED",
          title: "Refund completed",
          message: `${refund.refundNumber} issued`,
          entityType: "Refund",
          entityId: refund.id,
        },
        tx,
      );
      await this.audit.create(
        {
          actorId,
          action: "payment.refunded",
          entityType: "Refund",
          entityId: refund.id,
          metadata: { reason: dto.reason, amountCents: dto.amountCents },
        },
        tx,
      );
      return refund;
    });
  }

  async report(from: Date, to: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      include: {
        patient: {
          select: {
            id: true,
            patientNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        invoice: { select: { id: true, invoiceNumber: true } },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5_000,
    });

    const byMethod: Record<string, { count: number; amountCents: number }> =
      {};
    let amountCents = 0;
    let refundedCents = 0;
    let debtCollectedCents = 0;

    const rows = payments.map((p) => {
      amountCents += p.amountCents;
      refundedCents += p.refundedCents;
      if (p.isDebtPayment) debtCollectedCents += p.amountCents - p.refundedCents;
      const bucket = byMethod[p.method] ?? { count: 0, amountCents: 0 };
      bucket.count += 1;
      bucket.amountCents += p.amountCents;
      byMethod[p.method] = bucket;

      return {
        id: p.id,
        paymentNumber: p.paymentNumber,
        createdAt: p.createdAt.toISOString(),
        method: p.method,
        status: p.status,
        amountCents: p.amountCents,
        refundedCents: p.refundedCents,
        netCents: p.amountCents - p.refundedCents,
        referenceNumber: p.referenceNumber,
        isDebtPayment: p.isDebtPayment,
        invoice: p.invoice,
        patient: p.patient,
        recordedBy: p.recordedBy,
      };
    });

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        count: rows.length,
        amountCents,
        refundedCents,
        netCents: amountCents - refundedCents,
        debtCollectedCents,
        byMethod,
      },
      rows,
    };
  }
}
