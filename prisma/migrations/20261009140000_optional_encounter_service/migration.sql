-- AlterTable: visit fee/service is optional (new / returning / appointment may start with no charge)
ALTER TABLE "encounters" ALTER COLUMN "service_id" DROP NOT NULL;
