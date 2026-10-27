-- Template versions built over their chain of bases, kept per fleet by hash, each with when it was built and
-- last used; the index finds those unused for the kept time at a rescan.
CREATE TABLE "built_templates" (
    "fleet_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "chain" JSONB NOT NULL,
    "template" JSONB NOT NULL,
    "built_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "built_templates_pkey" PRIMARY KEY ("fleet_id","hash")
);

CREATE INDEX "built_templates_fleet_id_last_used_at_idx" ON "built_templates"("fleet_id", "last_used_at");
