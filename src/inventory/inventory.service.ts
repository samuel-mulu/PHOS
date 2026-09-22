import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AdjustStockDto,
  CreateMedicineDto,
  CreateSupplierDto,
  ReceiveStockDto,
} from "./dto/inventory.dto";
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  medicines() {
    return this.prisma.medicine.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }
  createMedicine(dto: CreateMedicineDto, actorId: string) {
    return this.prisma
      .$transaction(async (tx) => {
        const item = await tx.medicine.create({
          data: { ...dto, code: dto.code.toUpperCase() },
        });
        await this.audit.create(
          {
            actorId,
            action: "medicine.created",
            entityType: "Medicine",
            entityId: item.id,
          },
          tx,
        );
        return item;
      })
      .catch((e: any) => {
        if (e.code === "P2002")
          throw new ConflictException("Medicine code already exists");
        throw e;
      });
  }
  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }
  receive(dto: ReceiveStockDto, actorId: string) {
    if (dto.expiryDate <= new Date())
      throw new BadRequestException("Cannot receive expired stock");
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.create({
        data: {
          medicineId: dto.medicineId,
          supplierId: dto.supplierId,
          batchNumber: dto.batchNumber,
          expiryDate: dto.expiryDate,
          quantityReceived: dto.quantity,
          quantityRemaining: dto.quantity,
          unitCostCents: dto.unitCostCents,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          medicineId: dto.medicineId,
          batchId: batch.id,
          type: "RECEIVE",
          quantity: dto.quantity,
          performedById: actorId,
          referenceType: "InventoryBatch",
          referenceId: batch.id,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "inventory.received",
          entityType: "InventoryBatch",
          entityId: batch.id,
        },
        tx,
      );
      return batch;
    });
  }
  async adjust(dto: AdjustStockDto, actorId: string) {
    if (dto.quantity === 0)
      throw new BadRequestException("Adjustment quantity cannot be zero");
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: dto.batchId },
      });
      if (!batch || batch.quantityRemaining + dto.quantity < 0)
        throw new BadRequestException(
          "Invalid adjustment or insufficient stock",
        );
      const updated = await tx.inventoryBatch.update({
        where: { id: dto.batchId },
        data: { quantityRemaining: { increment: dto.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          medicineId: batch.medicineId,
          batchId: batch.id,
          type: dto.quantity > 0 ? "ADJUST_IN" : "ADJUST_OUT",
          quantity: Math.abs(dto.quantity),
          reason: dto.reason,
          performedById: actorId,
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "inventory.adjusted",
          entityType: "InventoryBatch",
          entityId: batch.id,
          metadata: { quantity: dto.quantity, reason: dto.reason },
        },
        tx,
      );
      return updated;
    });
  }
  async stock() {
    return this.prisma.medicine.findMany({
      where: { deletedAt: null },
      include: {
        batches: {
          where: { quantityRemaining: { gt: 0 } },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
  }
  async lowStock() {
    const medicines = await this.stock();
    return medicines.filter(
      (item) =>
        item.batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0) <=
        item.reorderLevel,
    );
  }
  expiring(days = 90) {
    const until = new Date(Date.now() + days * 86_400_000);
    return this.prisma.inventoryBatch.findMany({
      where: { quantityRemaining: { gt: 0 }, expiryDate: { lte: until } },
      include: { medicine: true },
      orderBy: { expiryDate: "asc" },
    });
  }
}
