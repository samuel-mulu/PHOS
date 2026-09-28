import { NotificationType } from "../generated/prisma/client";

export type AlertPriority = "CRITICAL" | "HIGH" | "NORMAL";

export function alertPriorityForNotification(
  type: NotificationType,
  title?: string,
): AlertPriority {
  switch (type) {
    case "LOW_STOCK":
    case "EXPIRING_STOCK":
      return "CRITICAL";
    case "LAB_ORDER_CREATED":
    case "LAB_RESULT_VERIFIED":
      return "HIGH";
    case "SYSTEM":
      if (title?.toLowerCase().includes("payment requested")) return "HIGH";
      return "NORMAL";
    case "PAYMENT_COMPLETED":
    case "REFUND_COMPLETED":
    case "PRESCRIPTION_CREATED":
      return "NORMAL";
    default:
      return "NORMAL";
  }
}
