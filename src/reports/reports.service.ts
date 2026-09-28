import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const today = startOfToday();
    const activeStatuses = [
      "REGISTERED",
      "WAITING_TRIAGE",
      "IN_TRIAGE",
      "WAITING_DOCTOR",
      "IN_CONSULTATION",
      "WAITING_LAB",
      "WAITING_REVIEW",
      "WAITING_PHARMACY",
      "WAITING_PAYMENT",
    ] as const;

    const [
      patientsRegisteredToday,
      activeEncounters,
      withDoctor,
      waitingDoctor,
      inTriage,
      waitingPayment,
      activeLabOrders,
      pendingInvoices,
      appointmentsToday,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: { createdAt: { gte: today }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: { in: [...activeStatuses] }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: "IN_CONSULTATION", deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { status: "WAITING_DOCTOR", deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: {
          status: { in: ["WAITING_TRIAGE", "IN_TRIAGE"] },
          deletedAt: null,
        },
      }),
      this.prisma.encounter.count({
        where: { status: "WAITING_PAYMENT", deletedAt: null },
      }),
      this.prisma.labOrder.count({
        where: {
          status: { notIn: ["VERIFIED", "CANCELLED"] },
        },
      }),
      this.prisma.invoice.count({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: today } },
      }),
    ]);

    return {
      asOf: new Date().toISOString(),
      patientsRegisteredToday,
      activeEncounters,
      withDoctor,
      waitingDoctor,
      inTriage,
      waitingPayment,
      activeLabOrders,
      pendingInvoices,
      appointmentsToday,
    };
  }

  async hmis(from: Date, to: Date) {
    const [
      newPatients,
      encounters,
      encountersByStatus,
      labVerified,
      prescriptions,
      paymentsAgg,
      appointmentsScheduled,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      }),
      this.prisma.encounter.count({
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
      }),
      this.prisma.encounter.groupBy({
        by: ["status"],
        where: { startedAt: { gte: from, lte: to }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.labOrder.count({
        where: {
          status: "VERIFIED",
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.prescription.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: from, lte: to } },
      }),
    ]);

    return {
      facility: "PHOS Clinic",
      period: { from: from.toISOString(), to: to.toISOString() },
      newPatients,
      encounters,
      encountersByStatus: Object.fromEntries(
        encountersByStatus.map((row) => [row.status, row._count._all]),
      ),
      labOrdersVerified: labVerified,
      prescriptions,
      appointmentsScheduled,
      paymentsCount: paymentsAgg._count._all,
      paymentsTotalCents: paymentsAgg._sum.amountCents ?? 0,
    };
  }
}
