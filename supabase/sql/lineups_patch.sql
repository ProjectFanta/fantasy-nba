-- Ensure Team has a unique competition/user constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Team_comp_user_uq'
    ) THEN
        ALTER TABLE "public"."Team"
            ADD CONSTRAINT "Team_comp_user_uq" UNIQUE ("competitionId", "userId");
    END IF;
END;
$$;

-- Create Lineup table if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = 'Lineup'
    ) THEN
        CREATE TABLE "public"."Lineup" (
            "id" SERIAL PRIMARY KEY,
            "teamId" integer NOT NULL REFERENCES "public"."Team"("id"),
            "roundId" integer NOT NULL REFERENCES "public"."Round"("id"),
            "entries" jsonb NOT NULL,
            "createdAt" timestamp with time zone DEFAULT now() NOT NULL
        );
    END IF;
END;
$$;

-- Enforce unique lineup per team/round pair
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Lineup_team_round_uq'
    ) THEN
        ALTER TABLE "public"."Lineup"
            ADD CONSTRAINT "Lineup_team_round_uq" UNIQUE ("teamId", "roundId");
    END IF;
END;
$$;
