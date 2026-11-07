import { Module } from "@nestjs/common";
import { CashierReleaseService } from "./cashier-release.service";
import {
  InvoiceAdjustmentsController,
  PaymentsController,
} from "./payments.controller";
import { PaymentsService } from "./payments.service";
@Module({
  controllers: [PaymentsController, InvoiceAdjustmentsController],
  providers: [PaymentsService, CashierReleaseService],
  exports: [CashierReleaseService],
})
export class PaymentsModule {}
