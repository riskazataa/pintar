ALTER TABLE "AssessmentQuestion" ADD COLUMN "tahap" INTEGER NOT NULL DEFAULT 1 CHECK ("tahap" IN (1,2));
ALTER TABLE "AssessmentAnswer" ADD COLUMN "tahap" INTEGER NOT NULL DEFAULT 1 CHECK ("tahap" IN (1,2));
ALTER TABLE "UsulinSignature" ADD COLUMN "tahap" INTEGER NOT NULL DEFAULT 1 CHECK ("tahap" IN (1,2));
ALTER TABLE "Inovasi" ADD COLUMN "status_tahap2" "StatusInovasi" NOT NULL DEFAULT 'PENDING';
CREATE TABLE "_PenugasanInovasiTahap2" (
 "A" INTEGER NOT NULL REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "B" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "_PenugasanInovasiTahap2_AB_pkey" PRIMARY KEY ("A", "B")
);
CREATE INDEX "_PenugasanInovasiTahap2_B_index" ON "_PenugasanInovasiTahap2"("B");
