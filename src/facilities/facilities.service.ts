import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateDepartmentDto,
  CreateFacilityDto,
  CreateServiceDto,
} from "./dto/facility.dto";
@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}
  facilities() {
    return this.prisma.facility.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
  }
  departments(facilityId?: string) {
    return this.prisma.department.findMany({
      where: { facilityId, deletedAt: null },
      include: { facility: true },
      orderBy: { name: "asc" },
    });
  }
  services(departmentId?: string) {
    return this.prisma.service.findMany({
      where: { departmentId, deletedAt: null },
      include: { department: true },
      orderBy: { name: "asc" },
    });
  }
  async createFacility(dto: CreateFacilityDto) {
    return this.wrap(() =>
      this.prisma.facility.create({
        data: { ...dto, code: dto.code.toUpperCase() },
      }),
    );
  }
  async createDepartment(dto: CreateDepartmentDto) {
    return this.wrap(() =>
      this.prisma.department.create({
        data: { ...dto, code: dto.code.toUpperCase() },
      }),
    );
  }
  async createService(dto: CreateServiceDto) {
    return this.wrap(() =>
      this.prisma.service.create({
        data: { ...dto, code: dto.code.toUpperCase() },
      }),
    );
  }
  async updateDepartmentStatus(id: string, active: boolean) {
    const result = await this.prisma.department.updateMany({
      where: { id, deletedAt: null },
      data: { active },
    });
    if (!result.count) throw new NotFoundException("Department not found");
    return this.prisma.department.findUnique({ where: { id } });
  }
  async updateServiceStatus(id: string, active: boolean) {
    const result = await this.prisma.service.updateMany({
      where: { id, deletedAt: null },
      data: { active },
    });
    if (!result.count) throw new NotFoundException("Service not found");
    return this.prisma.service.findUnique({ where: { id } });
  }
  private async wrap<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (e: any) {
      if (e.code === "P2002")
        throw new ConflictException("Code already exists in this scope");
      throw e;
    }
  }
}
