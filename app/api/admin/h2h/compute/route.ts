import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function authUserId(auth?: string | null): number | null {
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as { userId?: number };
    return typeof payload?.userId === "number" ? payload.userId : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const userId = authUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const roundId = Number(url.searchParams.get("roundId"));
    if (!roundId) {
      return NextResponse.json({ error: "roundId mancante" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        competition: {
          include: {
            league: true,
            teams: {
              select: {
                id: true,
                lineups: {
                  select: { roundId: true, entries: true },
                },
              },
            },
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round non trovato" }, { status: 404 });
    }

    if (round.competition.league.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const playerResults = await prisma.playerResult.findMany({ where: { roundId } });
    const resultMap = new Map<string, number>();
    for (const result of playerResults) {
      const key = (result.player ?? "").toLowerCase().trim();
      resultMap.set(key, Number(result.points ?? 0));
    }

    const scoreForTeam = (teamId: number): number => {
      const team = round.competition.teams.find((t) => t.id === teamId);
      if (!team) return 0;
      const lineup = team.lineups.find((l) => l.roundId === roundId);
      if (!lineup) return 0;

      const entries = Array.isArray(lineup.entries)
        ? (lineup.entries as unknown[])
        : Array.isArray((lineup.entries as any)?.items)
        ? ((lineup.entries as any).items as unknown[])
        : [];

      const normalizedEntries = entries as (string | null | undefined)[];

      return normalizedEntries.reduce((total, name) => {
        const key = `${name ?? ""}`.toLowerCase().trim();
        const points = resultMap.get(key) ?? 0;
        return total + points;
      }, 0);
    };

    const matches = await prisma.match.findMany({
      where: { competitionId: round.competitionId, roundId },
    });

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    await prisma.$transaction(
      matches.map((match) => {
        const homeScore = scoreForTeam(match.homeTeamId);
        const awayScore = scoreForTeam(match.awayTeamId);
        let result: "H" | "A" | "D";
        if (homeScore > awayScore) result = "H";
        else if (homeScore < awayScore) result = "A";
        else result = "D";

        return prisma.match.update({
          where: { id: match.id },
          data: { homeScore, awayScore, result },
        });
      }),
    );

    return NextResponse.json({ ok: true, updated: matches.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "errore" }, { status: 500 });
  }
}
