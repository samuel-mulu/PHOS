import { Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Next visit index for a patient (excludes cancelled). */
export async function nextVisitNumber(
  tx: Tx,
  patientId: string,
): Promise<number> {
  const prior = await tx.encounter.count({
    where: {
      patientId,
      deletedAt: null,
      status: { not: "CANCELLED" },
    },
  });
  return prior + 1;
}
