import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { DispensePrescriptionDto } from "./dto/pharmacy.dto";
@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async dispense(
    prescriptionId: string,
    dto: DispensePrescriptionDto,
    pharmacistId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const prescription = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: { items: true },
      });
      if (!prescription || !["ACTIVE", "PARTIAL"].includes(prescription.status))
        throw new ConflictException(
          "Prescription is not available for dispensing",
        );
      const requested = new Map(
        dto.items.map((item) => [item.prescriptionItemId, item.quantity]),
      );
      const dispensing = await tx.dispensing.create({
        data: { prescriptionId, pharmacistId },
      });
      for (const item of prescription.items) {
        const quantity = requested.get(item.id);
        if (!quantity) continue;
        const remaining = item.quantity - item.dispensedQuantity;
        if (quantity > remaining)
          throw new BadRequestException(
            `Requested quantity exceeds prescription for item ${item.id}`,
          );
        let need = quantity;
        const batches = await tx.inventoryBatch.findMany({
          where: {
            medicineId: item.medicineId,
            quantityRemaining: { gt: 0 },
            expiryDate: { gt: new Date() },
          },
          orderBy: { expiryDate: "asc" },
        });
        if (
          batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0) <
          need
        )
          throw new BadRequestException(
            `Insufficient stock for medicine ${item.medicineId}`,
          );
        for (const batch of batches) {
          if (!need) break;
          const take = Math.min(need, batch.quantityRemaining);
          const updated = await tx.inventoryBatch.updateMany({
            where: { id: batch.id, quantityRemaining: { gte: take } },
            data: { quantityRemaining: { decrement: take } },
          });
          if (!updated.count)
            throw new ConflictException("Stock changed; retry dispensing");
          await tx.dispensingItem.create({
            data: {
              dispensingId: dispensing.id,
              prescriptionItemId: item.id,
              batchId: batch.id,
              quantity: take,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              medicineId: item.medicineId,
              batchId: batch.id,
              type: "DISPENSE",
              quantity: take,
              performedById: pharmacistId,
              referenceType: "Dispensing",
              referenceId: dispensing.id,
            },
          });
          need -= take;
        }
        await tx.prescriptionItem.update({
          where: { id: item.id },
          data: { dispensedQuantity: { increment: quantity } },
        });
      }
      const fresh = await tx.prescriptionItem.findMany({
        where: { prescriptionId },
      });
      const complete = fresh.every(
        (item) => item.dispensedQuantity >= item.quantity,
      );
      const any = fresh.some((item) => item.dispensedQuantity > 0);
      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: complete ? "DISPENSED" : any ? "PARTIAL" : "ACTIVE" },
      });
      if (complete) {
        await tx.queueEntry.updateMany({
          where: {
            encounterId: prescription.encounterId,
            station: "PHARMACY",
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await tx.encounter.update({
          where: { id: prescription.encounterId },
          data: { status: "WAITING_PAYMENT" },
        });
      }
      await this.audit.create(
        {
          actorId: pharmacistId,
          action: "pharmacy.dispensed",
          entityType: "Dispensing",
          entityId: dispensing.id,
        },
        tx,
      );
      return tx.dispensing.findUniqueOrThrow({
        where: { id: dispensing.id },
        include: { items: true },
      });
    });
  }
}
