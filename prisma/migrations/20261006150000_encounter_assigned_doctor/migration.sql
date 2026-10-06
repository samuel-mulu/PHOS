-- Assign a specific doctor to an encounter (front desk / admin).
ALTER TABLE "encounters"
  ADD COLUMN IF NOT EXISTS "assigned_doctor_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounters_assigned_doctor_id_fkey'
  ) THEN
    ALTER TABLE "encounters"
      ADD CONSTRAINT "encounters_assigned_doctor_id_fkey"
      FOREIGN KEY ("assigned_doctor_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "encounters_assigned_doctor_id_status_idx"
  ON "encounters"("assigned_doctor_id", "status");
