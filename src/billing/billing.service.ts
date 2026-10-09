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
import { calculateInvoiceTotals } from "../common/domain/finance";
import { CreateInvoiceDto } from "./dto/billing.dto";
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
  async create(encounterId: string, dto: CreateInvoiceDto, actorId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");
    const existing = await this.prisma.invoice.findUnique({
      where: { encounterId },
    });
    if (existing)
      throw new ConflictException("Encounter already has an invoice");
    if (
      dto.additionalItems.some(
        (item) => !["PROCEDURE", "OTHER"].includes(item.type),
      )
    )
      throw new BadRequestException(
        "Only procedure or other manual items may be added",
      );
    const [service, labItems, dispensedItems] = await Promise.all([
      encounter.serviceId
        ? this.prisma.service.findUnique({ where: { id: encounter.serviceId } })
        : Promise.resolve(null),
      this.prisma.labOrderItem.findMany({
        where: { labOrder: { encounterId, status: "VERIFIED" } },
        include: { labTest: true },
      }),
      this.prisma.prescriptionItem.findMany({
        where: {
          prescription: { encounterId },
          dispensedQuantity: { gt: 0 },
        },
        include: { medicine: true },
      }),
    ]);
    const items = [
      ...(service
        ? [
            {
              type: "CONSULTATION" as const,
              description: service.name,
              sourceId: service.id,
              quantity: 1,
              unitPriceCents: service.priceCents,
            },
          ]
        : []),
      ...labItems.map((item) => ({
        type: "LAB" as const,
        description: item.labTest.name,
        sourceId: item.id,
        quantity: 1,
        unitPriceCents: item.priceCents,
      })),
      ...dispensedItems.map((item) => ({
        type: "MEDICINE" as const,
        description: item.medicine.name,
        sourceId: item.id,
        quantity: item.dispensedQuantity,
        unitPriceCents: item.medicine.sellingPriceCents,
      })),
      ...dto.additionalItems,
    ];
    if (items.length === 0)
      throw new BadRequestException(
        "Nothing to bill — pick a clinic service or add line items",
      );
    let totals: { subtotalCents: number; totalCents: number };
    try {
      totals = calculateInvoiceTotals(items, dto.discountCents);
    } catch {
      throw new BadRequestException("Discount cannot exceed subtotal");
    }
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('invoice_number_seq')`;
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          encounterId,
          patientId: encounter.patientId,
          subtotalCents: totals.subtotalCents,
          discountCents: dto.discountCents,
          totalCents: totals.totalCents,
          issuedById: actorId,
          items: {
            create: items.map((item) => ({
              ...item,
              totalCents: item.quantity * item.unitPriceCents,
            })),
          },
        },
        include: { items: true },
      });
      await this.audit.create(
        {
          actorId,
          action: "invoice.created",
          entityType: "Invoice",
          entityId: invoice.id,
        },
        tx,
      );
      return invoice;
    });
  }
  async find(id: string) {
    const item = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: true,
        encounter: true,
        items: true,
        payments: { include: { refunds: true } },
      },
    });
    if (!item) throw new NotFoundException("Invoice not found");
    return item;
  }
  async issue(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: { encounter: true },
      });
      if (!invoice || invoice.status !== "DRAFT")
        throw new ConflictException("Only a draft invoice can be issued");
      await tx.invoice.update({
        where: { id },
        data: { status: "ISSUED", issuedAt: new Date() },
      });
      const encounter = invoice.encounter;
      const openCashier = await tx.queueEntry.findFirst({
        where: {
          encounterId: encounter.id,
          station: "CASHIER",
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
      });
      if (!openCashier) {
        await tx.queueEntry.create({
          data: {
            encounterId: encounter.id,
            station: "CASHIER",
            priority: encounter.priority,
          },
        });
      }
      // Early consultation-fee invoices keep triage/doctor status.
      // Only hold at cashier when care is finished (or already waiting to pay).
      const consultation = await tx.consultation.findUnique({
        where: { encounterId: encounter.id },
        select: { status: true },
      });
      const holdAtCashier =
        consultation?.status === "FINALIZED" ||
        consultation?.status === "CORRECTED" ||
        encounter.status === "WAITING_PAYMENT";

      if (holdAtCashier && encounter.status !== "WAITING_PAYMENT") {
        await tx.encounter.update({
          where: { id: encounter.id },
          data: { status: "WAITING_PAYMENT" },
        });
      }
      await this.notifications.createForRoles(
        DESK_NOTIFY_ROLES,
        {
          type: "SYSTEM",
          title: "Invoice ready for payment",
          message: `${invoice.invoiceNumber} — collect payment at cashier`,
          entityType: "Invoice",
          entityId: id,
        },
        tx,
      );
      await this.audit.create(
        {
          actorId,
          action: "invoice.issued",
          entityType: "Invoice",
          entityId: id,
        },
        tx,
      );
      return tx.invoice.findUniqueOrThrow({
        where: { id },
        include: {
          patient: true,
          encounter: true,
          items: true,
          payments: { include: { refunds: true } },
        },
      });
    });
  }
  async voidInvoice(id: string, actorId: string) {
    const result = await this.prisma.invoice.updateMany({
      where: { id, status: { in: ["DRAFT", "ISSUED"] }, paidCents: 0 },
      data: { status: "VOID" },
    });
    if (!result.count)
      throw new ConflictException("Paid or closed invoice cannot be voided");
    await this.audit.create({
      actorId,
      action: "invoice.voided",
      entityType: "Invoice",
      entityId: id,
    });
    return this.find(id);
  }

  /**
   * Ensure an payable invoice exists with this ad-hoc charge line.
   * Creates invoice, or appends a line and recalculates totals.
   * Issues draft invoices so cashier can collect.
   */
  async addChargeAndEnsurePayable(
    encounterId: string,
    description: string,
    amountCents: number,
    actorId: string,
  ) {
    const trimmed = description.trim();
    if (!trimmed)
      throw new BadRequestException("Service description is required");
    if (!Number.isInteger(amountCents) || amountCents < 1)
      throw new BadRequestException("Amount must be at least 1 cent");

    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, deletedAt: null },
    });
    if (!encounter) throw new NotFoundException("Encounter not found");

    const existing = await this.prisma.invoice.findUnique({
      where: { encounterId },
      include: { items: true },
    });

    if (existing?.status === "VOID")
      throw new ConflictException("Invoice is void — cannot add charges");
    if (existing?.status === "PAID")
      throw new ConflictException(
        "Invoice already paid — start a new visit charge via desk if needed",
      );

    if (!existing) {
      const created = await this.create(
        encounterId,
        {
          additionalItems: [
            {
              type: "OTHER",
              description: trimmed,
              quantity: 1,
              unitPriceCents: amountCents,
            },
          ],
          discountCents: 0,
        },
        actorId,
      );
      return this.issue(created.id, actorId);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.create({
        data: {
          invoiceId: existing.id,
          type: "OTHER",
          description: trimmed,
          quantity: 1,
          unitPriceCents: amountCents,
          totalCents: amountCents,
        },
      });

      const items = await tx.invoiceItem.findMany({
        where: { invoiceId: existing.id },
      });
      let totals: { subtotalCents: number; totalCents: number };
      try {
        totals = calculateInvoiceTotals(items, existing.discountCents);
      } catch {
        throw new BadRequestException("Discount cannot exceed subtotal");
      }

      if (totals.totalCents < existing.paidCents)
        throw new ConflictException(
          "New total would be less than amount already paid",
        );

      const nextStatus =
        existing.status === "DRAFT"
          ? "ISSUED"
          : existing.paidCents > 0
            ? "PARTIALLY_PAID"
            : "ISSUED";

      const invoice = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          subtotalCents: totals.subtotalCents,
          totalCents: totals.totalCents,
          status: nextStatus,
          issuedAt: existing.issuedAt ?? new Date(),
        },
        include: {
          patient: true,
          encounter: true,
          items: true,
          payments: { include: { refunds: true } },
        },
      });

      await this.audit.create(
        {
          actorId,
          action: "invoice.charge_added",
          entityType: "Invoice",
          entityId: existing.id,
          newValues: { description: trimmed, amountCents },
        },
        tx,
      );

      return invoice;
    });
  }
}
