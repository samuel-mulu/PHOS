import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const rows = await prisma.encounter.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      patientId: true,
      visitNumber: true,
      status: true,
      startedAt: true,
      createdAt: true,
    },
    orderBy: [{ patientId: "asc" }, { startedAt: "asc" }, { createdAt: "asc" }],
  });

  const byPatient = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byPatient.get(row.patientId) ?? [];
    list.push(row);
    byPatient.set(row.patientId, list);
  }

  let updated = 0;
  for (const list of byPatient.values()) {
    const active = list.filter((r) => r.status !== "CANCELLED");
    for (let i = 0; i < active.length; i++) {
      const want = i + 1;
      if (active[i].visitNumber !== want) {
        await prisma.encounter.update({
          where: { id: active[i].id },
          data: { visitNumber: want },
        });
        updated += 1;
      }
    }
  }
  console.log(`Backfilled visit numbers. Updated ${updated} of ${rows.length}.`);
}

void main().finally(() => prisma.$disconnect());
