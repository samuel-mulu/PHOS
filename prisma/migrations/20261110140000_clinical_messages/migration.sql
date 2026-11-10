-- CreateEnum
CREATE TYPE "ClinicalMessageKind" AS ENUM ('NOTE', 'LAB_ORDER', 'LAB_RESULT');

-- CreateEnum
CREATE TYPE "ClinicalMessageAuthorSide" AS ENUM ('DOCTOR', 'LAB');

-- CreateTable
CREATE TABLE "clinical_messages" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_side" "ClinicalMessageAuthorSide" NOT NULL,
    "kind" "ClinicalMessageKind" NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "lab_order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_messages_encounter_id_created_at_idx" ON "clinical_messages"("encounter_id", "created_at");

-- CreateIndex
CREATE INDEX "clinical_messages_patient_id_created_at_idx" ON "clinical_messages"("patient_id", "created_at");

-- AddForeignKey
ALTER TABLE "clinical_messages" ADD CONSTRAINT "clinical_messages_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_messages" ADD CONSTRAINT "clinical_messages_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_messages" ADD CONSTRAINT "clinical_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_messages" ADD CONSTRAINT "clinical_messages_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
