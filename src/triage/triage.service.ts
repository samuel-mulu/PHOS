import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RecordTriageDto } from "./dto/triage.dto";

@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async find(encounterId: string) {
    const item = await this.prisma.triage.findFirst({
      where: { encounterId, deletedAt: null },
    });
    if (!item) throw new NotFoundException("Triage not found");
    return item;
  }

  async record(encounterId: string, dto: RecordTriageDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const encounter = await tx.encounter.findFirst({
        where: {
          id: encounterId,
          status: { in: ["WAITING_TRIAGE", "IN_TRIAGE"] },
          deletedAt: null,
        },
      });
      if (!encounter)
        throw new ConflictException("Encounter is not ready for triage");

      const triage = await tx.triage.upsert({
        where: { encounterId },
        create: { ...dto, encounterId, recordedById: actorId },
        update: { ...dto, recordedById: actorId, recordedAt: new Date() },
      });

      const wasReferral = encounter.nurseReferralActive;

      await tx.encounter.update({
        where: { id: encounterId },
        data: {
          status: "WAITING_DOCTOR",
          nurseReferralActive: false,
          closedAt: null,
        },
      });

      await tx.queueEntry.updateMany({
        where: {
          encounterId,
          station: "TRIAGE",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const doctorEntry = await tx.queueEntry.findFirst({
        where: {
          encounterId,
          station: "DOCTOR",
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
      });
      if (!doctorEntry) {
        await tx.queueEntry.create({
          data: {
            encounterId,
            station: "DOCTOR",
            priority: encounter.priority,
            assignedToId: encounter.assignedDoctorId,
          },
        });
      } else {
        await tx.queueEntry.update({
          where: { id: doctorEntry.id },
          data: {
            enteredAt: new Date(),
            status: "WAITING",
            calledAt: null,
            serviceStartedAt: null,
            assignedToId:
              encounter.assignedDoctorId ?? doctorEntry.assignedToId,
          },
        });
      }

      if (wasReferral && encounter.assignedDoctorId) {
        await this.notifications.createForUser(
          {
            recipientId: encounter.assignedDoctorId,
            type: "SYSTEM",
            title: "Nurse returned patient",
            message: `${encounter.encounterNumber} — triage done, back on your queue`,
            entityType: "Encounter",
            entityId: encounterId,
          },
          tx,
        );
      }

      await this.audit.create(
        {
          actorId,
          action: wasReferral ? "triage.referral_completed" : "triage.recorded",
          entityType: "Triage",
          entityId: triage.id,
          metadata: { nurseReferral: wasReferral },
        },
        tx,
      );
      return triage;
    });
  }
}
