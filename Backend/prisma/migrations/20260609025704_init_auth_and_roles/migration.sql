-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'TIM_PENILAI_MARVEL', 'TIM_PENILAI_ITJEN', 'SATKER');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Satker" (
    "id" SERIAL NOT NULL,
    "nama_satker" TEXT NOT NULL,

    CONSTRAINT "Satker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status_registrasi" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "satker_id" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_satker_id_fkey" FOREIGN KEY ("satker_id") REFERENCES "Satker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
