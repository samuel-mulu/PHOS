import { Injectable } from "@nestjs/common";
import { DESK_NOTIFY_ROLES } from "../common/constants/desk-roles";
import { Prisma, Role } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

type Tx = Prisma.TransactionClient;
type ClinicalStation = "TRIAGE" | "DOCTOR" | "LAB" | "PHARMACY";

const STATUS_BY_STATION: Record<
  ClinicalStation,
  "WAITING_TRIAGE" | "WAITING_DOCTOR" | "WAITING_LAB" | "WAITING_PHARMACY"
> = {
  TRIAGE: "WAITING_TRIAGE",
  DOCTOR: "WAITING_DOCTOR",
  LAB: "WAITING_LAB",
  PHARMACY: "WAITING_PHARMACY",
};

const STATION_LABEL: Record<ClinicalStation, string> = {
  TRIAGE: "triage",
  DOCTOR: "doctor",
  LAB: "lab",
  PHARMACY: "pharmacy",
};

function isClinical(station: string | null | undefined): station is ClinicalStation {
  return station != null && station in STATUS_BY_STATION;
}

function etb(cents: number) {
  return `${(cents / 100).toFixed(2)} ETB`;
}

export type ReleaseOutcome = {
  /** Reference shown in notifications (payment number, invoice number...). */
  reference: string;
  /** Collected in this cashier action. */
  paidNowCents: number;
  /** Left as approved pay-later debt on this invoice. */
  owedCents: number;
  /** Waived in this cashier action. */
  waivedNowCents: number;
};

/**
 * Sends a patient from the cashier back to the station that requested payment
 * (or closes the visit when care is already finished). Used for full payment,
 * partial payment + "send back", pay later, and waive.
 *
 * Only acts while the encounter is WAITING_PAYMENT, so collecting an old debt on
 * a closed visit never reopens it or changes its closedAt.
 */
@Injectable()
export class CashierReleaseService {
  constructor(private readonly notifications: NotificationsService) {}

  async release(
    tx: Tx,
    invoiceId: string,
    actorId: string,
    outcome: ReleaseOutcome,
  ): Promise<{ released: boolean; returnStation: ClinicalStation | null }> {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
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
    const encounter = invoice.encounter;
    if (encounter.status !== "WAITING_PAYMENT") {
      return { released: false, returnStation: null };
    }

    const now = new Date();
    await tx.queueEntry.updateMany({
      where: {
        encounterId: encounter.id,
        station: "CASHIER",
        status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
      },
      data: { status: "COMPLETED", completedAt: now },
    });

    const consultStatus = encounter.consultation?.status;
    const careFinished =
      consultStatus === "FINALIZED" || consultStatus === "CORRECTED";
    const origin = encounter.paymentReturnStation;
    let returnStation: ClinicalStation | null = null;

    if (careFinished) {
      await tx.encounter.update({
        where: { id: encounter.id },
        data: { status: "COMPLETED", closedAt: now, paymentReturnStation: null },
      });
    } else if (isClinical(origin)) {
      // Explicit origin from a clinical payment request.
      returnStation = origin;
      await tx.encounter.update({
        where: { id: encounter.id },
        data: {
          status: STATUS_BY_STATION[origin],
          closedAt: null,
          paymentReturnStation: null,
        },
      });
      const openReturn = encounter.queueEntries.find((q) => q.station === origin);
      if (!openReturn) {
        await tx.queueEntry.create({
          data: {
            encounterId: encounter.id,
            station: origin,
            priority: encounter.priority,
            assignedToId:
              origin === "DOCTOR"
                ? (encounter.consultation?.doctorId ??
                  encounter.assignedDoctorId ??
                  null)
                : null,
          },
        });
      }
    } else {
      // Legacy heuristic when no return station was stored.
      const openClinical = encounter.queueEntries.find((q) =>
        isClinical(q.station),
      );
      if (openClinical && isClinical(openClinical.station)) {
        returnStation = openClinical.station;
        await tx.encounter.update({
          where: { id: encounter.id },
          data: {
            status: STATUS_BY_STATION[openClinical.station],
            closedAt: null,
            paymentReturnStation: null,
          },
        });
      } else {
        const hadTriage = await tx.triage.findFirst({
          where: { encounterId: encounter.id, deletedAt: null },
        });
        const pastTriage = await tx.queueEntry.findFirst({
          where: { encounterId: encounter.id, station: "TRIAGE" },
          orderBy: { enteredAt: "desc" },
        });
        const pastDoctor = await tx.queueEntry.findFirst({
          where: { encounterId: encounter.id, station: "DOCTOR" },
          orderBy: { enteredAt: "desc" },
        });
        const station: "TRIAGE" | "DOCTOR" =
          hadTriage || pastDoctor ? "DOCTOR" : pastTriage ? "TRIAGE" : "DOCTOR";
        returnStation = station;
        await tx.encounter.update({
          where: { id: encounter.id },
          data: {
            status: STATUS_BY_STATION[station],
            closedAt: null,
            paymentReturnStation: null,
          },
        });
        await tx.queueEntry.create({
          data: {
            encounterId: encounter.id,
            station,
            priority: encounter.priority,
          },
        });
      }
    }

    await this.notifyStations(tx, {
      encounterId: encounter.id,
      doctorId:
        encounter.consultation?.doctorId ?? encounter.assignedDoctorId ?? null,
      origin: isClinical(origin) ? origin : null,
      returnStation,
      outcome,
    });

    return { released: true, returnStation };
  }

  private summary(outcome: ReleaseOutcome) {
    const parts: string[] = [];
    if (outcome.paidNowCents > 0) parts.push(`paid ${etb(outcome.paidNowCents)}`);
    if (outcome.waivedNowCents > 0)
      parts.push(`waived ${etb(outcome.waivedNowCents)}`);
    if (outcome.owedCents > 0)
      parts.push(`owes ${etb(outcome.owedCents)} (pay later)`);
    return parts.length ? parts.join(", ") : "cleared";
  }

  private async notifyStations(
    tx: Tx,
    args: {
      encounterId: string;
      doctorId: string | null;
      origin: ClinicalStation | null;
      returnStation: ClinicalStation | null;
      outcome: ReleaseOutcome;
    },
  ) {
    const { encounterId, doctorId, origin, returnStation, outcome } = args;
    const summary = this.summary(outcome);
    const fullyPaid =
      outcome.owedCents === 0 && outcome.waivedNowCents === 0;
    const base = {
      type: "PAYMENT_COMPLETED" as const,
      entityType: "Encounter",
      entityId: encounterId,
    };
    const returning = (station: ClinicalStation) =>
      `${outcome.reference}: ${summary} - patient is returning to ${STATION_LABEL[station]}`;

    if (doctorId) {
      await this.notifications.createForUser(
        {
          ...base,
          recipientId: doctorId,
          title: fullyPaid ? "Payment received" : "Returned from cashier",
          message:
            origin === "DOCTOR" || !origin
              ? returnStation === "DOCTOR"
                ? returning("DOCTOR")
                : `${outcome.reference}: ${summary}`
              : `${outcome.reference}: ${summary} for this visit`,
        },
        tx,
      );
    }
    if (origin === "LAB") {
      await this.notifications.createForRoles(
        [Role.LAB_TECH, Role.LAB_SUPERVISOR],
        { ...base, title: "Cashier done - return to lab", message: returning("LAB") },
        tx,
      );
    }
    if (origin === "PHARMACY") {
      await this.notifications.createForRoles(
        [Role.PHARMACIST],
        {
          ...base,
          title: "Cashier done - return to pharmacy",
          message: returning("PHARMACY"),
        },
        tx,
      );
    }
    if (origin === "TRIAGE") {
      await this.notifications.createForRoles(
        [Role.NURSE, Role.RECEPTIONIST, Role.FRONT_DESK],
        {
          ...base,
          title: "Cashier done - return to triage",
          message: returning("TRIAGE"),
        },
        tx,
      );
    }
    await this.notifications.createForRoles(
      DESK_NOTIFY_ROLES,
      {
        ...base,
        title: fullyPaid ? "Payment recorded" : "Cashier released patient",
        message: `${outcome.reference}: ${summary}`,
      },
      tx,
    );
  }
}
