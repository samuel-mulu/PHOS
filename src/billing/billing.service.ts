import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { calculateInvoiceTotals } from "../common/domain/finance";
import { CreateInvoiceDto } from "./dto/billing.dto";
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      this.prisma.service.findUniqueOrThrow({
        where: { id: encounter.serviceId },
      }),
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
      {
        type: "CONSULTATION" as const,
        description: service.name,
        sourceId: service.id,
        quantity: 1,
        unitPriceCents: service.priceCents,
      },
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
    const result = await this.prisma.invoice.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
    if (!result.count)
      throw new ConflictException("Only a draft invoice can be issued");
    await this.audit.create({
      actorId,
      action: "invoice.issued",
      entityType: "Invoice",
      entityId: id,
    });
    return this.find(id);
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
}
