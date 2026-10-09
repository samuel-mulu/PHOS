-- AlterTable
ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "lab_tests" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lab_tests_active_sort_order_name_idx" ON "lab_tests"("active", "sort_order", "name");
CREATE INDEX IF NOT EXISTS "lab_tests_category_idx" ON "lab_tests"("category");
