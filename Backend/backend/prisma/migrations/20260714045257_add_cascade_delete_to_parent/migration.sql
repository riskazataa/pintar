-- DropForeignKey
ALTER TABLE "AssessmentQuestion" DROP CONSTRAINT "AssessmentQuestion_parent_id_fkey";

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
