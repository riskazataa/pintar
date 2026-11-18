CREATE TABLE "InovasiRevisionLog" (
    "id" SERIAL NOT NULL,
    "inovasi_id" INTEGER NOT NULL,
    "requested_by_id" INTEGER,
    "resubmitted_by_id" INTEGER,
    "catatan_perbaikan" TEXT NOT NULL,
    "snapshot" JSONB,
    "changes" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resubmitted_at" TIMESTAMP(3),

    CONSTRAINT "InovasiRevisionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InovasiRevisionLog_inovasi_id_requested_at_idx"
ON "InovasiRevisionLog"("inovasi_id", "requested_at");

ALTER TABLE "InovasiRevisionLog"
ADD CONSTRAINT "InovasiRevisionLog_inovasi_id_fkey"
FOREIGN KEY ("inovasi_id") REFERENCES "Inovasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InovasiRevisionLog"
ADD CONSTRAINT "InovasiRevisionLog_requested_by_id_fkey"
FOREIGN KEY ("requested_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InovasiRevisionLog"
ADD CONSTRAINT "InovasiRevisionLog_resubmitted_by_id_fkey"
FOREIGN KEY ("resubmitted_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
