-- CreateEnum
CREATE TYPE "OtherIncomeStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS "other_income_number_seq" START 1;

-- CreateTable
CREATE TABLE "other_income_sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_incomes" (
    "id" UUID NOT NULL,
    "income_number" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "income_date" DATE NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payer" TEXT,
    "notes" TEXT,
    "receipt_reference" TEXT,
    "status" "OtherIncomeStatus" NOT NULL DEFAULT 'RECORDED',
    "recorded_by_id" UUID NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "other_income_sources_code_key" ON "other_income_sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "other_incomes_income_number_key" ON "other_incomes"("income_number");

-- CreateIndex
CREATE INDEX "other_incomes_income_date_status_idx" ON "other_incomes"("income_date", "status");

-- CreateIndex
CREATE INDEX "other_incomes_source_id_idx" ON "other_incomes"("source_id");

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "other_income_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_incomes" ADD CONSTRAINT "other_incomes_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default income sources (so the dropdown works without re-seeding)
INSERT INTO "other_income_sources" ("id", "code", "name", "sort_order", "active", "updated_at") VALUES
    (gen_random_uuid(), 'DONATION', 'Donation', 10, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'GRANT', 'Grant / NGO support', 20, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'RENT', 'Rent / lease', 30, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'TRAINING', 'Training / student fees', 40, true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'OTHER', 'Other', 99, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
