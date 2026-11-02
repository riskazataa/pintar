ALTER TABLE "Inovasi" ADD COLUMN "jenis_inovasi_pilihan" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Inovasi"
SET "jenis_inovasi_pilihan" = ARRAY["jenis_inovasi"]
WHERE "jenis_inovasi" IS NOT NULL AND "jenis_inovasi" <> '';
