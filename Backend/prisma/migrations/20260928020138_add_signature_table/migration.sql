/*
  Warnings:

  - You are about to drop the `UsulanSignature` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UsulanSignature" DROP CONSTRAINT "UsulanSignature_user_id_fkey";

-- DropForeignKey
ALTER TABLE "UsulanSignature" DROP CONSTRAINT "UsulanSignature_usulan_id_fkey";

-- DropTable
DROP TABLE "UsulanSignature";

-- CreateTable
CREATE TABLE "UsulinSignature" (
    "id" SERIAL NOT NULL,
    "usulan_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "jabatan" TEXT NOT NULL,
    "ttd_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsulinSignature_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UsulinSignature" ADD CONSTRAINT "UsulinSignature_usulan_id_fkey" FOREIGN KEY ("usulan_id") REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsulinSignature" ADD CONSTRAINT "UsulinSignature_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
