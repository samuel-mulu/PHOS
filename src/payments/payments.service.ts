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
import { Role } from "../generated/prisma/client";
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
          encounter: {
            include: {
              consultation: { select: { doctorId: true, status: true } },
              queueEntries: {
                where: { status: { in: ["WAITING", "CALLED", "IN_SERVICE"] } },
              },
            },
          },
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
      const originReturnStation = invoice.encounter.paymentReturnStation;
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
      const fullyPaid = paidCents === invoice.totalCents;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidCents,
          status: fullyPaid ? "PAID" : "PARTIALLY_PAID",
        },
      });

      if (fullyPaid) {
        const now = new Date();
        await tx.queueEntry.updateMany({
          where: {
            encounterId: invoice.encounterId,
            station: "CASHIER",
            status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
          },
          data: { status: "COMPLETED", completedAt: now },
        });

        const consultStatus = invoice.encounter.consultation?.status;
        const careFinished =
          consultStatus === "FINALIZED" || consultStatus === "CORRECTED";

        if (careFinished) {
          await tx.encounter.update({
            where: { id: invoice.encounterId },
            data: {
              status: "COMPLETED",
              closedAt: now,
              paymentReturnStation: null,
            },
          });
        } else {
          const statusByStation: Record<
            string,
            "WAITING_TRIAGE" | "WAITING_DOCTOR" | "WAITING_LAB" | "WAITING_PHARMACY"
          > = {
            TRIAGE: "WAITING_TRIAGE",
            DOCTOR: "WAITING_DOCTOR",
            LAB: "WAITING_LAB",
            PHARMACY: "WAITING_PHARMACY",
          };

          // Prefer explicit origin from clinical payment request
          if (
            originReturnStation &&
            ["TRIAGE", "DOCTOR", "LAB", "PHARMACY"].includes(originReturnStation)
          ) {
            const status =
              statusByStation[originReturnStation] ?? "WAITING_DOCTOR";
            await tx.encounter.update({
              where: { id: invoice.encounterId },
              data: {
                status,
                closedAt: null,
                paymentReturnStation: null,
              },
            });
            const openReturn = await tx.queueEntry.findFirst({
              where: {
                encounterId: invoice.encounterId,
                station: originReturnStation,
                status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
              },
            });
            if (!openReturn) {
              await tx.queueEntry.create({
                data: {
                  encounterId: invoice.encounterId,
                  station: originReturnStation,
                  priority: invoice.encounter.priority,
                  assignedToId:
                    originReturnStation === "DOCTOR"
                      ? (invoice.encounter.consultation?.doctorId ??
                        invoice.encounter.assignedDoctorId ??
                        null)
                      : null,
                },
              });
            }
          } else {
            // Legacy heuristic when no return station was stored
            const openClinical = invoice.encounter.queueEntries.find((q) =>
              ["TRIAGE", "DOCTOR", "LAB", "PHARMACY"].includes(q.station),
            );

            if (openClinical) {
              if (invoice.encounter.status === "WAITING_PAYMENT") {
                await tx.encounter.update({
                  where: { id: invoice.encounterId },
                  data: {
                    status:
                      statusByStation[openClinical.station] ?? "WAITING_DOCTOR",
                    closedAt: null,
                    paymentReturnStation: null,
                  },
                });
              }
            } else {
              const hadTriage = await tx.triage.findFirst({
                where: { encounterId: invoice.encounterId, deletedAt: null },
              });
              const pastTriage = await tx.queueEntry.findFirst({
                where: { encounterId: invoice.encounterId, station: "TRIAGE" },
                orderBy: { enteredAt: "desc" },
              });
              const pastDoctor = await tx.queueEntry.findFirst({
                where: { encounterId: invoice.encounterId, station: "DOCTOR" },
                orderBy: { enteredAt: "desc" },
              });

              let station: "TRIAGE" | "DOCTOR" = "DOCTOR";
              if (hadTriage || pastDoctor) {
                station = "DOCTOR";
              } else if (pastTriage) {
                station = "TRIAGE";
              }

              const status =
                station === "TRIAGE" ? "WAITING_TRIAGE" : "WAITING_DOCTOR";
              await tx.encounter.update({
                where: { id: invoice.encounterId },
                data: { status, closedAt: null, paymentReturnStation: null },
              });
              await tx.queueEntry.create({
                data: {
                  encounterId: invoice.encounterId,
                  station,
                  priority: invoice.encounter.priority,
                },
              });
            }
          }
        }
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
      const doctorId =
        invoice.encounter.consultation?.doctorId ??
        invoice.encounter.assignedDoctorId;
      if (fullyPaid && doctorId) {
        await this.notifications.createForUser(
          {
            recipientId: doctorId,
            type: "PAYMENT_COMPLETED",
            title: "Payment received",
            message:
              originReturnStation === "DOCTOR" || !originReturnStation
                ? `${payment.paymentNumber} recorded — patient is returning to your queue`
                : `${payment.paymentNumber} recorded for this visit`,
            entityType: "Encounter",
            entityId: invoice.encounterId,
          },
          tx,
        );
      }
      if (fullyPaid && originReturnStation === "LAB") {
        await this.notifications.createForRoles(
          [Role.LAB_TECH, Role.LAB_SUPERVISOR],
          {
            type: "PAYMENT_COMPLETED",
            title: "Payment received — return to lab",
            message: `${payment.paymentNumber} recorded — patient is returning to lab`,
            entityType: "Encounter",
            entityId: invoice.encounterId,
          },
          tx,
        );
      }
      if (fullyPaid && originReturnStation === "PHARMACY") {
        await this.notifications.createForRoles(
          [Role.PHARMACIST],
          {
            type: "PAYMENT_COMPLETED",
            title: "Payment received — return to pharmacy",
            message: `${payment.paymentNumber} recorded — patient is returning to pharmacy`,
            entityType: "Encounter",
            entityId: invoice.encounterId,
          },
          tx,
        );
      }
      if (fullyPaid && originReturnStation === "TRIAGE") {
        await this.notifications.createForRoles(
          [Role.NURSE, Role.RECEPTIONIST, Role.FRONT_DESK],
          {
            type: "PAYMENT_COMPLETED",
            title: "Payment received — return to triage",
            message: `${payment.paymentNumber} recorded — patient is returning to triage`,
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
            title: "Payment recorded",
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

    const rows = payments.map((p) => {
      amountCents += p.amountCents;
      refundedCents += p.refundedCents;
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
        byMethod,
      },
      rows,
    };
  }
}
