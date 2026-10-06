import { EncounterStatus } from "../generated/prisma/client";

/** Clinical routing destinations staff can send a visit to. */
export const STATION_STATUS: Record<
  "TRIAGE" | "DOCTOR" | "LAB" | "PHARMACY" | "CASHIER",
  EncounterStatus
> = {
  TRIAGE: "WAITING_TRIAGE",
  DOCTOR: "WAITING_DOCTOR",
  LAB: "WAITING_LAB",
  PHARMACY: "WAITING_PHARMACY",
  CASHIER: "WAITING_PAYMENT",
};

export const ENCOUNTER_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> =
  {
    REGISTERED: ["WAITING_TRIAGE", "WAITING_DOCTOR", "CANCELLED"],
    WAITING_TRIAGE: ["IN_TRIAGE", "WAITING_DOCTOR", "WAITING_PAYMENT", "CANCELLED"],
    IN_TRIAGE: ["WAITING_DOCTOR", "WAITING_PAYMENT", "CANCELLED"],
    WAITING_DOCTOR: [
      "IN_CONSULTATION",
      "WAITING_TRIAGE",
      "WAITING_LAB",
      "WAITING_PHARMACY",
      "WAITING_PAYMENT",
      "CANCELLED",
    ],
    IN_CONSULTATION: [
      "WAITING_LAB",
      "WAITING_PHARMACY",
      "WAITING_PAYMENT",
      "WAITING_DOCTOR",
      "WAITING_TRIAGE",
      "COMPLETED",
      "CANCELLED",
    ],
    WAITING_LAB: ["WAITING_REVIEW", "WAITING_DOCTOR", "WAITING_PAYMENT", "CANCELLED"],
    WAITING_REVIEW: [
      "IN_CONSULTATION",
      "WAITING_DOCTOR",
      "WAITING_PHARMACY",
      "WAITING_PAYMENT",
      "COMPLETED",
      "CANCELLED",
    ],
    WAITING_PHARMACY: [
      "WAITING_PAYMENT",
      "WAITING_DOCTOR",
      "COMPLETED",
      "CANCELLED",
    ],
    WAITING_PAYMENT: [
      "WAITING_TRIAGE",
      "WAITING_DOCTOR",
      "WAITING_LAB",
      "WAITING_PHARMACY",
      "COMPLETED",
      "CANCELLED",
    ],
    COMPLETED: [],
    CANCELLED: [],
  };
