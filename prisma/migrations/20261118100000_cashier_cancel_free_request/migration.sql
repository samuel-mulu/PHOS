-- Cashier cancel (patient left without paying) and doctor "send as free" request.

ALTER TYPE "InvoiceAdjustmentType" ADD VALUE IF NOT EXISTS 'CANCEL';

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cancelled_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "free_request_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "free_request_reason" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "free_requested_by_id" UUID;

ALTER TABLE "invoice_adjustments" ADD COLUMN IF NOT EXISTS "requested_by_id" UUID;

DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_free_requested_by_id_fkey"
    FOREIGN KEY ("free_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
