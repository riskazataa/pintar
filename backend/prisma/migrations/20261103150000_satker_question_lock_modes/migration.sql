ALTER TABLE "AssessmentQuestion"
ADD COLUMN "satker_lock_mode" TEXT NOT NULL DEFAULT 'NONE';

UPDATE "AssessmentQuestion"
SET "satker_lock_mode" = 'RINCIAN'
WHERE "satker_locked" = TRUE;

UPDATE "AssessmentQuestion"
SET "satker_lock_mode" = 'ROW'
WHERE "tahap" = 1
  AND "pertanyaan" IN (
    'Hasil Seleksi Awal',
    'Tidak dapat dilanjutkan',
    'Dapat dilanjutkan ke penilaian inovasi'
  );

ALTER TABLE "AssessmentQuestion"
DROP COLUMN "satker_locked";
