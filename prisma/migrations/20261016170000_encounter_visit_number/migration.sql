-- AlterTable
ALTER TABLE "encounters" ADD COLUMN "visit_number" INTEGER NOT NULL DEFAULT 1;

-- Backfill visit numbers per patient (non-cancelled, by started_at)
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY patient_id
      ORDER BY started_at ASC, created_at ASC
    ) AS rn
  FROM "encounters"
  WHERE deleted_at IS NULL
    AND status <> 'CANCELLED'
)
UPDATE "encounters" e
SET visit_number = numbered.rn
FROM numbered
WHERE e.id = numbered.id;
