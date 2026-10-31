-- The stretches in which a fleet's company key could not be had; until is null while one goes on, and a fleet
-- has at most one going on.
CREATE TABLE "key_outages" (
    "fleet_id" TEXT NOT NULL,
    "since" TIMESTAMPTZ(3) NOT NULL,
    "until" TIMESTAMPTZ(3),

    CONSTRAINT "key_outages_pkey" PRIMARY KEY ("fleet_id","since")
);

CREATE UNIQUE INDEX "key_outages_one_going_on_idx" ON "key_outages"("fleet_id") WHERE "until" IS NULL;
