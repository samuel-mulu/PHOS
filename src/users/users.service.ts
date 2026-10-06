import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";
import { UserStatus } from "../generated/prisma/client";
const safeSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async create(dto: CreateUserDto) {
    const { password, ...profile } = dto;
    try {
      return await this.prisma.user.create({
        data: {
          ...profile,
          email: dto.email.toLowerCase(),
          passwordHash: await argon2.hash(password),
        },
        select: safeSelect,
      });
    } catch (e: any) {
      if (e.code === "P2002")
        throw new ConflictException("Email or phone already exists");
      throw e;
    }
  }
  list(search?: string) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: search
          ? [
              { email: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      select: safeSelect,
      orderBy: { createdAt: "desc" },
    });
  }
  /** Active doctors for front-desk / nurse assignment pickers. */
  listDoctors() {
    return this.prisma.user.findMany({
      where: {
        role: "DOCTOR",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        departmentId: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }
  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: safeSelect,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }
  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: safeSelect,
    });
  }
  async updateStatus(id: string, status: UserStatus, actorId: string) {
    if (id === actorId && status !== "ACTIVE")
      throw new BadRequestException("You cannot deactivate your own account");
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { status },
        select: safeSelect,
      });
      if (status !== "ACTIVE")
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return user;
    });
  }
}
