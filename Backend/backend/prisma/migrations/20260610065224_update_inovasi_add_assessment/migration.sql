/*
  Warnings:

  - The `kriteria_inovasi` column on the `Inovasi` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `link_data_dukung` to the `Inovasi` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pic_nama` to the `Inovasi` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pic_telp` to the `Inovasi` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tahun` to the `Inovasi` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "StatusInovasi" ADD VALUE 'PERBAIKAN';

-- AlterTable
ALTER TABLE "Inovasi" ADD COLUMN     "jenis_inovasi_lainnya" TEXT,
ADD COLUMN     "link_data_dukung" TEXT NOT NULL,
ADD COLUMN     "pic_nama" TEXT NOT NULL,
ADD COLUMN     "pic_telp" TEXT NOT NULL,
ADD COLUMN     "tahun" INTEGER NOT NULL,
DROP COLUMN "kriteria_inovasi",
ADD COLUMN     "kriteria_inovasi" TEXT[];

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" SERIAL NOT NULL,
    "kategori" TEXT NOT NULL,
    "pertanyaan" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" SERIAL NOT NULL,
    "inovasi_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "jawaban_boolean" BOOLEAN NOT NULL,
    "catatan_string" TEXT,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_inovasi_id_fkey" FOREIGN KEY ("inovasi_id") REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
