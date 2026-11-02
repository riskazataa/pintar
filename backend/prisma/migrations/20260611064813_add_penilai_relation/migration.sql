-- CreateTable
CREATE TABLE "_PenugasanInovasi" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PenugasanInovasi_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_PenugasanInovasi_B_index" ON "_PenugasanInovasi"("B");

-- AddForeignKey
ALTER TABLE "_PenugasanInovasi" ADD CONSTRAINT "_PenugasanInovasi_A_fkey" FOREIGN KEY ("A") REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PenugasanInovasi" ADD CONSTRAINT "_PenugasanInovasi_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
