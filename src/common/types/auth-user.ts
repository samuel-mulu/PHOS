import { Role } from "../../generated/prisma/client";
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
