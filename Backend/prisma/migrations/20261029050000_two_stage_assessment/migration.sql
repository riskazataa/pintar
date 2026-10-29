CREATE TABLE "AssessmentTemplatePackage" (
  "id" SERIAL NOT NULL,
  "nama" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "published_at" TIMESTAMP(3),
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentTemplatePackage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Inovasi" ADD COLUMN "template_package_id" INTEGER, ADD COLUMN "workflow" JSONB;
ALTER TABLE "Inovasi" ADD CONSTRAINT "Inovasi_template_package_id_fkey" FOREIGN KEY ("template_package_id") REFERENCES "AssessmentTemplatePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentAnswer" ADD COLUMN "link" TEXT;
