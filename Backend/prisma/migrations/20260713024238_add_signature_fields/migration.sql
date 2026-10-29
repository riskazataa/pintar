-- AlterEnum
ALTER TYPE "StatusInovasi" ADD VALUE 'SELESAI_EVALUASI';

-- AlterTable
ALTER TABLE "Inovasi" ADD COLUMN     "ski_nama" TEXT,
ADD COLUMN     "ski_nip" TEXT,
ADD COLUMN     "ski_signed_at" TIMESTAMP(3),
ADD COLUMN     "ski_ttd_image" TEXT,
ADD COLUMN     "timker_nama" TEXT,
ADD COLUMN     "timker_nip" TEXT,
ADD COLUMN     "timker_signed_at" TIMESTAMP(3),
ADD COLUMN     "timker_ttd_image" TEXT;
