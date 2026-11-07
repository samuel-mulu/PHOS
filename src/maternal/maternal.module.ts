import { Module } from "@nestjs/common";
import { MaternalController } from "./maternal.controller";
import { MaternalService } from "./maternal.service";

@Module({ controllers: [MaternalController], providers: [MaternalService] })
export class MaternalModule {}
