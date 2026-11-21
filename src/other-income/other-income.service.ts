import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { codeFromName, uniqueCode } from "../common/utils/named-lookup";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateOtherIncomeDto,
  CreateOtherIncomeSourceDto,
  UpdateOtherIncomeSourceDto,
  VoidOtherIncomeDto,
} from "./dto/other-income.dto";

function parseIncomeDate(value: string): Date {
  const d = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException("Invalid income date");
  return d;
}

function dateRangeInclusive(from: Date, to: Date) {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

const USER_SELECT = { id: true, firstName: true, lastName: true } as const;

const INCOME_INCLUDE = {
  source: true,
  recordedBy: { select: USER_SELECT },
  voidedBy: { select: USER_SELECT },
} as const;

@Injectable()
export class OtherIncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listSources(activeOnly = true) {
    return this.prisma.otherIncomeSource.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createSource(dto: CreateOtherIncomeSourceDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.otherIncomeSource.findUnique({
      where: { code },
    });
    if (existing) throw new BadRequestException("Source code already exists");
    return this.prisma.otherIncomeSource.create({
      data: { code, name: dto.name.trim(), sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateSource(id: string, dto: UpdateOtherIncomeSourceDto) {
    const src = await this.prisma.otherIncomeSource.findUnique({
      where: { id },
    });
    if (!src) throw new NotFoundException("Income source not found");
    return this.prisma.otherIncomeSource.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        sortOrder: dto.sortOrder,
        active: dto.active,
      },
    });
  }

  async create(dto: CreateOtherIncomeDto, actorId: string) {
    const newName = dto.newSourceName?.trim();
    if (!newName && !dto.sourceId)
      throw new BadRequestException("Choose a source or type the other income source");

    if (!newName) {
      const source = await this.prisma.otherIncomeSource.findFirst({
        where: { id: dto.sourceId, active: true },
      });
      if (!source) throw new NotFoundException("Income source not found");
    }

    const incomeDate = parseIncomeDate(dto.incomeDate);

    return this.prisma.$transaction(async (tx) => {
      const sourceId = newName
        ? await this.resolveOrCreateSource(tx, newName, actorId)
        : dto.sourceId!;
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('other_income_number_seq')`;
      const income = await tx.otherIncome.create({
        data: {
          incomeNumber: `INC-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          sourceId,
          amountCents: dto.amountCents,
          incomeDate,
          paymentMethod: dto.method,
          payer: dto.payer?.trim() || null,
          notes: dto.notes?.trim() || null,
          receiptReference: dto.receiptReference?.trim() || null,
          recordedById: actorId,
        },
        include: INCOME_INCLUDE,
      });
      await this.audit.create(
        {
          actorId,
          action: "OTHER_INCOME_RECORDED",
          entityType: "OtherIncome",
          entityId: income.id,
          newValues: {
            incomeNumber: income.incomeNumber,
            amountCents: income.amountCents,
            sourceId: income.sourceId,
          },
        },
        tx,
      );
      return income;
    });
  }

  async list(from: Date, to: Date, status?: "RECORDED" | "VOIDED" | "ALL") {
    const { start, end } = dateRangeInclusive(from, to);
    const whereStatus =
      status === "ALL" || !status
        ? undefined
        : { status: status as "RECORDED" | "VOIDED" };

    return this.prisma.otherIncome.findMany({
      where: { incomeDate: { gte: start, lte: end }, ...whereStatus },
      include: INCOME_INCLUDE,
      orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
      take: 2_000,
    });
  }

  async void(id: string, dto: VoidOtherIncomeDto, actorId: string) {
    const income = await this.prisma.otherIncome.findUnique({ where: { id } });
    if (!income) throw new NotFoundException("Income record not found");
    if (income.status === "VOIDED")
      throw new BadRequestException("Income record is already voided");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.otherIncome.update({
        where: { id },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: dto.reason.trim(),
        },
        include: INCOME_INCLUDE,
      });
      await this.audit.create(
        {
          actorId,
          action: "OTHER_INCOME_VOIDED",
          entityType: "OtherIncome",
          entityId: id,
          metadata: { reason: dto.reason.trim() },
        },
        tx,
      );
      return updated;
    });
  }

  async report(from: Date, to: Date) {
    const { start, end } = dateRangeInclusive(from, to);
    const incomes = await this.prisma.otherIncome.findMany({
      where: { incomeDate: { gte: start, lte: end } },
      include: INCOME_INCLUDE,
      orderBy: [{ incomeDate: "desc" }, { createdAt: "desc" }],
      take: 5_000,
    });

    const bySource: Record<
      string,
      { sourceId: string; code: string; name: string; count: number; amountCents: number }
    > = {};
    let recordedCount = 0;
    let recordedCents = 0;
    let voidedCount = 0;
    let voidedCents = 0;

    const rows = incomes.map((i) => {
      if (i.status === "RECORDED") {
        recordedCount += 1;
        recordedCents += i.amountCents;
        const bucket =
          bySource[i.sourceId] ?? {
            sourceId: i.sourceId,
            code: i.source.code,
            name: i.source.name,
            count: 0,
            amountCents: 0,
          };
        bucket.count += 1;
        bucket.amountCents += i.amountCents;
        bySource[i.sourceId] = bucket;
      } else {
        voidedCount += 1;
        voidedCents += i.amountCents;
      }

      return {
        id: i.id,
        incomeNumber: i.incomeNumber,
        incomeDate: i.incomeDate.toISOString().slice(0, 10),
        createdAt: i.createdAt.toISOString(),
        status: i.status,
        amountCents: i.amountCents,
        method: i.paymentMethod,
        payer: i.payer,
        notes: i.notes,
        receiptReference: i.receiptReference,
        voidReason: i.voidReason,
        source: { id: i.source.id, code: i.source.code, name: i.source.name },
        recordedBy: i.recordedBy,
        voidedBy: i.voidedBy,
      };
    });

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      totals: {
        count: recordedCount,
        amountCents: recordedCents,
        voidedCount,
        voidedCents,
        bySource: Object.values(bySource).sort(
          (a, b) => b.amountCents - a.amountCents,
        ),
      },
      rows,
    };
  }

  /** "Other" typed by staff: reuse a source with the same name or create one. */
  private async resolveOrCreateSource(
    tx: Prisma.TransactionClient,
    name: string,
    actorId: string,
  ): Promise<string> {
    const existing = await tx.otherIncomeSource.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      if (!existing.active)
        await tx.otherIncomeSource.update({
          where: { id: existing.id },
          data: { active: true },
        });
      return existing.id;
    }

    const code = await uniqueCode(codeFromName(name), async (c) =>
      Boolean(await tx.otherIncomeSource.findUnique({ where: { code: c } })),
    );
    const created = await tx.otherIncomeSource.create({
      data: { code, name, sortOrder: 90 },
    });
    await this.audit.create(
      {
        actorId,
        action: "OTHER_INCOME_SOURCE_CREATED",
        entityType: "OtherIncomeSource",
        entityId: created.id,
        newValues: { code, name },
      },
      tx,
    );
    return created.id;
  }
}
