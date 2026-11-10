ALTER TABLE "Inovasi" ADD COLUMN "submitted_at" TIMESTAMP(3);

UPDATE "Inovasi"
SET "submitted_at" = "created_at"
WHERE "status" <> 'DRAFT';
