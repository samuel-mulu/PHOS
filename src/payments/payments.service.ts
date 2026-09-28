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
import { CreatePaymentDto, CreateRefundDto } from "./dto/payment.dto";
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
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
        include: {
          encounter: { include: { consultation: { select: { doctorId: true } } } },
        },
      });
      if (!invoice || !["ISSUED", "PARTIALLY_PAID"].includes(invoice.status))
        throw new ConflictException("Invoice is not payable");
      const balance = invoice.totalCents - invoice.paidCents;
      if (dto.amountCents > balance)
        throw new BadRequestException("Payment exceeds invoice balance");
      if (dto.method === "CASH") {
        if (!dto.cashSessionId)
          throw new BadRequestException(
            "Cash payment requires an open cash session",
          );
        const session = await tx.cashSession.findFirst({
          where: { id: dto.cashSessionId, cashierId: actorId, status: "OPEN" },
        });
        if (!session)
          throw new ConflictException(
            "Cash session is not open for this cashier",
          );
      }
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('payment_number_seq')`;
      const payment = await tx.payment.create({
        data: {
          ...dto,
          patientId: invoice.patientId,
          paymentNumber: `PAY-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          recordedById: actorId,
        },
      });
      const paidCents = invoice.paidCents + dto.amountCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidCents,
          status: paidCents === invoice.totalCents ? "PAID" : "PARTIALLY_PAID",
        },
      });
      if (paidCents === invoice.totalCents)
        await tx.encounter.update({
          where: { id: invoice.encounterId },
          data: { status: "COMPLETED", closedAt: new Date() },
        });
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
      const doctorId = invoice.encounter.consultation?.doctorId;
      const fullyPaid = paidCents === invoice.totalCents;
      if (fullyPaid && doctorId) {
        await this.notifications.createForUser(
          {
            recipientId: doctorId,
            type: "PAYMENT_COMPLETED",
            title: "Payment received",
            message: `${payment.paymentNumber} — visit can be closed for billing`,
            entityType: "Encounter",
            entityId: invoice.encounterId,
          },
          tx,
        );
      }
      if (fullyPaid) {
        await this.notifications.createForRoles(
          DESK_NOTIFY_ROLES,
          {
            type: "PAYMENT_COMPLETED",
            title: "Visit paid in full",
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
        },
        tx,
      );
      return payment;
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
      const newPaid = payment.invoice.paidCents - dto.amountCents;
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidCents: newPaid,
          status: newPaid === 0 ? "ISSUED" : "PARTIALLY_PAID",
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
}
