import { Role } from "../../generated/prisma/client";

/** Register patients and start visits. */
export const DESK_REGISTER_ROLES: Role[] = [
  Role.CEO,
  Role.ADMIN,
  Role.RECEPTIONIST,
  Role.FRONT_DESK,
];

/** Create/issue invoices and record payments. */
export const DESK_PAY_ROLES: Role[] = [
  Role.CEO,
  Role.ADMIN,
  Role.CASHIER,
  Role.FRONT_DESK,
  Role.RECEPTIONIST,
];

export const DESK_BILLING_CREATE_ROLES: Role[] = [
  Role.CEO,
  Role.ADMIN,
  Role.CASHIER,
  Role.RECEPTIONIST,
  Role.FRONT_DESK,
];

export const DESK_NOTIFY_ROLES: Role[] = [
  Role.CASHIER,
  Role.RECEPTIONIST,
  Role.FRONT_DESK,
];
