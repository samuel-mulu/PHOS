import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  VoidExpenseDto,
} from "./dto/expense.dto";

function parseExpenseDate(value: string): Date {
  const d = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException("Invalid expense date");
  return d;
}

function dateRangeInclusive(from: Date, to: Date) {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCategories(activeOnly = true) {
    return this.prisma.expenseCategory.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { code },
    });
    if (existing) throw new BadRequestException("Category code already exists");
    return this.prisma.expenseCategory.create({
      data: {
        code,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    await this.ensureCategory(id);
    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        sortOrder: dto.sortOrder,
        active: dto.active,
      },
    });
  }

  async create(dto: CreateExpenseDto, actorId: string) {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id: dto.categoryId, active: true },
    });
    if (!category) throw new NotFoundException("Expense category not found");

    const expenseDate = parseExpenseDate(dto.expenseDate);

    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('expense_number_seq')`;
      const expense = await tx.expense.create({
        data: {
          expenseNumber: `EXP-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          categoryId: dto.categoryId,
          amountCents: dto.amountCents,
          expenseDate,
          paymentMethod: dto.method,
          vendor: dto.vendor?.trim() || null,
          description: dto.description?.trim() || null,
          receiptReference: dto.receiptReference?.trim() || null,
          recordedById: actorId,
        },
        include: {
          category: true,
          recordedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "EXPENSE_RECORDED",
          entityType: "Expense",
          entityId: expense.id,
          newValues: {
            expenseNumber: expense.expenseNumber,
            amountCents: expense.amountCents,
            categoryId: expense.categoryId,
          },
        },
        tx,
      );
      return expense;
    });
  }

  async list(from: Date, to: Date, status?: "RECORDED" | "VOIDED" | "ALL") {
    const { start, end } = dateRangeInclusive(from, to);
    const whereStatus =
      status === "ALL" || !status
        ? undefined
        : { status: status as "RECORDED" | "VOIDED" };

    return this.prisma.expense.findMany({
      where: {
        expenseDate: { gte: start, lte: end },
        ...whereStatus,
      },
      include: {
        category: true,
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        voidedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 2_000,
    });
  }

  async void(id: string, dto: VoidExpenseDto, actorId: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.status === "VOIDED")
      throw new BadRequestException("Expense is already voided");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: dto.reason.trim(),
        },
        include: {
          category: true,
          recordedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          voidedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "EXPENSE_VOIDED",
          entityType: "Expense",
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
    const expenses = await this.prisma.expense.findMany({
      where: { expenseDate: { gte: start, lte: end } },
      include: {
        category: true,
        recordedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        voidedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 5_000,
    });

    const byCategory: Record<
      string,
      { categoryId: string; code: string; name: string; count: number; amountCents: number }
    > = {};
    let recordedCount = 0;
    let recordedCents = 0;
    let voidedCount = 0;
    let voidedCents = 0;

    const rows = expenses.map((e) => {
      if (e.status === "RECORDED") {
        recordedCount += 1;
        recordedCents += e.amountCents;
        const bucket =
          byCategory[e.categoryId] ?? {
            categoryId: e.categoryId,
            code: e.category.code,
            name: e.category.name,
            count: 0,
            amountCents: 0,
          };
        bucket.count += 1;
        bucket.amountCents += e.amountCents;
        byCategory[e.categoryId] = bucket;
      } else {
        voidedCount += 1;
        voidedCents += e.amountCents;
      }

      return {
        id: e.id,
        expenseNumber: e.expenseNumber,
        expenseDate: e.expenseDate.toISOString().slice(0, 10),
        createdAt: e.createdAt.toISOString(),
        status: e.status,
        amountCents: e.amountCents,
        method: e.paymentMethod,
        vendor: e.vendor,
        description: e.description,
        receiptReference: e.receiptReference,
        voidReason: e.voidReason,
        category: {
          id: e.category.id,
          code: e.category.code,
          name: e.category.name,
        },
        recordedBy: e.recordedBy,
        voidedBy: e.voidedBy,
      };
    });

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      totals: {
        count: recordedCount,
        amountCents: recordedCents,
        voidedCount,
        voidedCents,
        byCategory: Object.values(byCategory).sort(
          (a, b) => b.amountCents - a.amountCents,
        ),
      },
      rows,
    };
  }

  private async ensureCategory(id: string) {
    const cat = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException("Expense category not found");
    return cat;
  }
}
