export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type FixtureRow = {
  roundId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  result: string | null;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const roundId = Number(params?.id);
    if (!roundId || Number.isNaN(roundId)) {
      return NextResponse.json({ error: "roundId non valido" }, { status: 400 });
    }

    const fixtures = await prisma.$queryRaw<FixtureRow[]>`
      SELECT
        m."roundId" AS "roundId",
        ht."name" AS "homeTeamName",
        at."name" AS "awayTeamName",
        m."homeScore" AS "homeScore",
        m."awayScore" AS "awayScore",
        m."result" AS "result"
      FROM "Match" m
      INNER JOIN "Team" ht ON ht."id" = m."homeTeamId"
      INNER JOIN "Team" at ON at."id" = m."awayTeamId"
      WHERE m."roundId" = ${roundId}
      ORDER BY m."id" ASC
    `;

    const normalized = fixtures.map((match) => ({
      ...match,
      homeScore: match.homeScore === null ? null : Number(match.homeScore),
      awayScore: match.awayScore === null ? null : Number(match.awayScore),
    }));

    return NextResponse.json({ matches: normalized });
  } catch (error: any) {
    console.error("GET round fixtures error", error);
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: 500 });
  }
}
