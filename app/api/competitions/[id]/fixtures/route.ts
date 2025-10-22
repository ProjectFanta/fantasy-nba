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
    const competitionId = Number(params?.id);
    if (!competitionId || Number.isNaN(competitionId)) {
      return NextResponse.json({ error: "competitionId non valido" }, { status: 400 });
    }

    const rounds = await prisma.round.findMany({
      where: { competitionId },
      orderBy: { dayIndex: "asc" },
      select: { id: true, name: true },
    });

    if (rounds.length === 0) {
      return NextResponse.json({ rounds: [] });
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
      WHERE m."competitionId" = ${competitionId}
      ORDER BY m."id" ASC
    `;

    const grouped = new Map<number, FixtureRow[]>();
    for (const match of fixtures) {
      const normalized: FixtureRow = {
        ...match,
        homeScore: match.homeScore === null ? null : Number(match.homeScore),
        awayScore: match.awayScore === null ? null : Number(match.awayScore),
      };
      const list = grouped.get(normalized.roundId);
      if (list) {
        list.push(normalized);
      } else {
        grouped.set(normalized.roundId, [normalized]);
      }
    }

    const payload = rounds.map((round) => ({
      id: round.id,
      name: round.name,
      matches: grouped.get(round.id) ?? [],
    }));

    return NextResponse.json({ rounds: payload });
  } catch (error: any) {
    console.error("GET competition fixtures error", error);
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: 500 });
  }
}
