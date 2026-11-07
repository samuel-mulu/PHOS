-- AlterTable
ALTER TABLE "lab_orders" ADD COLUMN "doctor_review_notes" TEXT;
ALTER TABLE "lab_orders" ADD COLUMN "doctor_reviewed_at" TIMESTAMP(3);
