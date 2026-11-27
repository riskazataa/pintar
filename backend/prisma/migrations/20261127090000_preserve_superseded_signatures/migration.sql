ALTER TABLE "UsulinSignature"
ADD COLUMN "invalidated_at" TIMESTAMP(3);

CREATE INDEX "UsulinSignature_usulan_id_tahap_invalidated_at_idx"
ON "UsulinSignature"("usulan_id", "tahap", "invalidated_at");
