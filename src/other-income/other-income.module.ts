import { Module } from "@nestjs/common";
import { OtherIncomeController } from "./other-income.controller";
import { OtherIncomeService } from "./other-income.service";

@Module({
  controllers: [OtherIncomeController],
  providers: [OtherIncomeService],
})
export class OtherIncomeModule {}
