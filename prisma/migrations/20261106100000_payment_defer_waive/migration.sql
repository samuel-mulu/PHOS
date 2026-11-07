-- Partial payment, pay later (debt) and waive (free) at the cashier.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "waived_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "deferred_cents" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "invoices_patient_id_status_idx" ON "invoices"("patient_id", "status");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "is_debt_payment" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "InvoiceAdjustmentType" AS ENUM ('DEFER', 'WAIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "invoice_adjustments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "type" "InvoiceAdjustmentType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_adjustments_idempotency_key_key" ON "invoice_adjustments"("idempotency_key");
CREATE INDEX IF NOT EXISTS "invoice_adjustments_invoice_id_idx" ON "invoice_adjustments"("invoice_id");
CREATE INDEX IF NOT EXISTS "invoice_adjustments_patient_id_idx" ON "invoice_adjustments"("patient_id");
CREATE INDEX IF NOT EXISTS "invoice_adjustments_type_created_at_idx" ON "invoice_adjustments"("type", "created_at");

DO $$ BEGIN
  ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_recorded_by_id_fkey"
    FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
