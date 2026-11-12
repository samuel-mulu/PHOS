-- CreateEnum
CREATE TYPE "LmpStatus" AS ENUM ('KNOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DatingSource" AS ENUM ('LMP', 'ULTRASOUND', 'CLINICAL', 'NONE');

-- AlterTable
ALTER TABLE "obstetric_histories"
ADD COLUMN "lmp_status" "LmpStatus",
ADD COLUMN "dating_source" "DatingSource",
ADD COLUMN "dating_established" BOOLEAN;

-- Existing rows with an LMP were dated by Naegele's rule.
UPDATE "obstetric_histories"
SET
  "lmp_status" = 'KNOWN',
  "dating_source" = 'LMP',
  "dating_established" = TRUE
WHERE "lmp" IS NOT NULL;
