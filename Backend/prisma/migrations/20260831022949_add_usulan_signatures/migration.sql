-- CreateTable
CREATE TABLE "UsulanSignature" (
    "id" SERIAL NOT NULL,
    "usulan_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "ttd_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsulanSignature_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UsulanSignature" ADD CONSTRAINT "UsulanSignature_usulan_id_fkey" FOREIGN KEY ("usulan_id") REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsulanSignature" ADD CONSTRAINT "UsulanSignature_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
