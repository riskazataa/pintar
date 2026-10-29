-- CreateEnum
CREATE TYPE "StatusInovasi" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Inovasi" (
    "id" SERIAL NOT NULL,
    "judul" TEXT NOT NULL,
    "jenis_inovasi" TEXT NOT NULL,
    "kriteria_inovasi" TEXT NOT NULL,
    "status" "StatusInovasi" NOT NULL DEFAULT 'PENDING',
    "satker_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inovasi_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Inovasi" ADD CONSTRAINT "Inovasi_satker_id_fkey" FOREIGN KEY ("satker_id") REFERENCES "Satker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inovasi" ADD CONSTRAINT "Inovasi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
