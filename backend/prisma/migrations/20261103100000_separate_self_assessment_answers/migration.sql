CREATE TYPE "AssessmentAnswerSource" AS ENUM ('SATKER', 'PENILAI');

ALTER TABLE "AssessmentAnswer"
ADD COLUMN "source" "AssessmentAnswerSource" NOT NULL DEFAULT 'SATKER';

-- Keep current Tahap 1 values available to both views before separating future edits.
INSERT INTO "AssessmentAnswer" (
    "inovasi_id",
    "question_id",
    "jawaban_boolean",
    "catatan_string",
    "link",
    "custom_values",
    "tahap",
    "source"
)
SELECT
    "inovasi_id",
    "question_id",
    "jawaban_boolean",
    "catatan_string",
    "link",
    "custom_values",
    "tahap",
    'PENILAI'
FROM "AssessmentAnswer"
WHERE "tahap" = 1;

UPDATE "AssessmentAnswer"
SET "source" = 'PENILAI'
WHERE "tahap" = 2;

CREATE INDEX "AssessmentAnswer_inovasi_id_tahap_source_idx"
ON "AssessmentAnswer"("inovasi_id", "tahap", "source");
