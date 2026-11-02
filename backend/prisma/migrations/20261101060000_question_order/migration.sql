ALTER TABLE "AssessmentQuestion" ADD COLUMN "urutan" INTEGER NOT NULL DEFAULT 0;
UPDATE "AssessmentQuestion" SET "urutan" = "id";
