CREATE TABLE "SystemSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "submissions_locked" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SystemSetting" ("id", "submissions_locked", "updated_at")
VALUES (1, false, CURRENT_TIMESTAMP);
