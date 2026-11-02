-- AlterTable
ALTER TABLE "AssessmentQuestion" ADD COLUMN "parent_id" INTEGER;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "AssessmentQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
