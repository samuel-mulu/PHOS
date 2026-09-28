import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnvironment } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { FacilitiesModule } from "./facilities/facilities.module";
import { PatientsModule } from "./patients/patients.module";
import { EncountersModule } from "./encounters/encounters.module";
import { QueuesModule } from "./queues/queues.module";
import { TriageModule } from "./triage/triage.module";
import { ConsultationsModule } from "./consultations/consultations.module";
import { LaboratoryModule } from "./laboratory/laboratory.module";
import { PrescriptionsModule } from "./prescriptions/prescriptions.module";
import { InventoryModule } from "./inventory/inventory.module";
import { PharmacyModule } from "./pharmacy/pharmacy.module";
import { BillingModule } from "./billing/billing.module";
import { PaymentsModule } from "./payments/payments.module";
import { CashSessionsModule } from "./cash-sessions/cash-sessions.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { ReportsModule } from "./reports/reports.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    FacilitiesModule,
    PatientsModule,
    EncountersModule,
    QueuesModule,
    TriageModule,
    ConsultationsModule,
    NotificationsModule,
    LaboratoryModule,
    PrescriptionsModule,
    InventoryModule,
    PharmacyModule,
    BillingModule,
    PaymentsModule,
    CashSessionsModule,
    AppointmentsModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
