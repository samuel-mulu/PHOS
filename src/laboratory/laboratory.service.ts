import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { LabOrderStatus, Role } from "../generated/prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLabOrderDto, EnterLabResultsDto } from "./dto/laboratory.dto";
@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
  async createOrder(
    consultationId: string,
    dto: CreateLabOrderDto,
    doctorId: string,
  ) {
    const unique = [...new Set(dto.labTestIds)];
    const consultation = await this.prisma.consultation.findFirst({
      where: { id: consultationId, doctorId, status: "DRAFT", deletedAt: null },
      include: { encounter: true },
    });
    if (!consultation)
      throw new ConflictException(
        "Lab orders require your active draft consultation",
      );
    const tests = await this.prisma.labTest.findMany({
      where: { id: { in: unique }, active: true, deletedAt: null },
    });
    if (tests.length !== unique.length)
      throw new BadRequestException(
        "One or more lab tests are invalid or inactive",
      );
    return this.prisma.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ nextval: bigint }>
      >`SELECT nextval('lab_order_number_seq')`;
      const order = await tx.labOrder.create({
        data: {
          orderNumber: `LAB-${new Date().getUTCFullYear()}-${seq[0].nextval.toString().padStart(6, "0")}`,
          consultationId,
          encounterId: consultation.encounterId,
          patientId: consultation.encounter.patientId,
          doctorId,
          priority: dto.priority,
          clinicalNotes: dto.clinicalNotes,
          items: {
            create: tests.map((test) => ({
              labTestId: test.id,
              priceCents: test.priceCents,
            })),
          },
        },
        include: { items: { include: { labTest: true } } },
      });
      await tx.encounter.update({
        where: { id: consultation.encounterId },
        data: { status: "WAITING_LAB" },
      });
      await tx.queueEntry.create({
        data: {
          encounterId: consultation.encounterId,
          station: "LAB",
          priority: order.priority,
        },
      });
      await this.notifications.createForRoles(
        [Role.LAB_TECH, Role.LAB_SUPERVISOR],
        {
          type: "LAB_ORDER_CREATED",
          title: "New lab order",
          message: `Order ${order.orderNumber} is waiting`,
          entityType: "LabOrder",
          entityId: order.id,
        },
        tx,
      );
      await this.audit.create(
        {
          actorId: doctorId,
          action: "lab.order_created",
          entityType: "LabOrder",
          entityId: order.id,
        },
        tx,
      );
      return order;
    });
  }
  listTests() {
    return this.prisma.labTest.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }
  listOrders(status?: LabOrderStatus) {
    return this.prisma.labOrder.findMany({
      where: { status },
      include: {
        patient: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { labTest: true, result: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }
  async findOrder(id: string, viewerRole?: Role) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { labTest: true, result: true } },
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");
    if (
      order.status !== "VERIFIED" &&
      viewerRole &&
      !(<Role[]>[
        Role.LAB_TECH,
        Role.LAB_SUPERVISOR,
        Role.ADMIN,
        Role.CEO,
      ]).includes(viewerRole)
    ) {
      return {
        ...order,
        items: order.items.map((item) => ({
          id: item.id,
          labOrderId: item.labOrderId,
          labTestId: item.labTestId,
          priceCents: item.priceCents,
          labTest: item.labTest,
        })),
      };
    }
    return order;
  }
  async receive(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findUnique({ where: { id } });
      if (!order || order.status !== "ORDERED")
        throw new ConflictException("Only ordered tests can be marked received");
      const updated = await tx.labOrder.update({
        where: { id },
        data: { status: "RECEIVED" },
      });
      await this.audit.create(
        {
          actorId,
          action: "lab.order_received",
          entityType: "LabOrder",
          entityId: id,
        },
        tx,
      );
      return updated;
    });
  }
  async enterResults(id: string, dto: EnterLabResultsDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (
        !order ||
        !["RECEIVED", "PROCESSING", "RESULT_ENTERED"].includes(order.status)
      )
        throw new ConflictException(
          "Sample must be received at lab before entering results",
        );
      const allowed = new Set(order.items.map((item) => item.id));
      if (dto.results.some((result) => !allowed.has(result.labOrderItemId)))
        throw new BadRequestException(
          "Result contains item outside this order",
        );
      for (const result of dto.results)
        await tx.labResult.upsert({
          where: { labOrderItemId: result.labOrderItemId },
          create: { ...result, enteredById: actorId },
          update: {
            ...result,
            enteredById: actorId,
            enteredAt: new Date(),
            verifiedById: null,
            verifiedAt: null,
          },
        });
      const count = await tx.labResult.count({
        where: { labOrderItemId: { in: order.items.map((item) => item.id) } },
      });
      await tx.labOrder.update({
        where: { id },
        data: {
          status:
            count === order.items.length ? "RESULT_ENTERED" : "PROCESSING",
        },
      });
      await this.audit.create(
        {
          actorId,
          action: "lab.results_entered",
          entityType: "LabOrder",
          entityId: id,
        },
        tx,
      );
      return tx.labOrder.findUniqueOrThrow({
        where: { id },
        include: { items: { include: { labTest: true, result: true } } },
      });
    });
  }
  async verify(id: string, supervisorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findUnique({
        where: { id },
        include: { items: { include: { result: true } } },
      });
      if (
        !order ||
        order.status !== "RESULT_ENTERED" ||
        order.items.some((item) => !item.result)
      )
        throw new ConflictException(
          "All results must be entered before verification",
        );
      const now = new Date();
      await tx.labResult.updateMany({
        where: { labOrderItemId: { in: order.items.map((item) => item.id) } },
        data: { verifiedById: supervisorId, verifiedAt: now },
      });
      const updated = await tx.labOrder.update({
        where: { id },
        data: { status: "VERIFIED" },
      });
      await tx.encounter.update({
        where: { id: order.encounterId },
        data: { status: "WAITING_REVIEW" },
      });
      await tx.queueEntry.updateMany({
        where: {
          encounterId: order.encounterId,
          station: "LAB",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "COMPLETED", completedAt: now },
      });
      await this.notifications.createForUser(
        {
          recipientId: order.doctorId,
          type: "LAB_RESULT_VERIFIED",
          title: "Lab result verified",
          message: `Order ${order.orderNumber} is ready for review`,
          entityType: "LabOrder",
          entityId: order.id,
        },
        tx,
      );
      await this.audit.create(
        {
          actorId: supervisorId,
          action: "lab.order_verified",
          entityType: "LabOrder",
          entityId: id,
        },
        tx,
      );
      return updated;
    });
  }
}
