import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  competitionId: number;
  teamIds?: number[];
};

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

    const body = (await req.json()) as Body;
    const competitionId = Number(body?.competitionId);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        league: true,
        teams: { select: { id: true } },
        rounds: { select: { id: true }, orderBy: { id: "asc" } },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "Competition non trovata" }, { status: 404 });
    }

    if (competition.league.ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const teamIds = (body.teamIds?.length ? body.teamIds : competition.teams.map((team) => team.id)).slice();
    if (teamIds.length < 2) {
      return NextResponse.json({ error: "Servono almeno 2 squadre" }, { status: 400 });
    }

    let teams = teamIds.slice();
    const rounds = competition.rounds.map((round) => round.id);

    let hasBye = false;
    if (teams.length % 2 === 1) {
      teams.push(-1);
      hasBye = true;
    }

    const teamCount = teams.length;
    const half = teamCount / 2;
    const weeks = teamCount - 1;

    if (rounds.length < weeks) {
      return NextResponse.json(
        { error: `Round insufficienti: servono ${weeks}, presenti ${rounds.length}` },
        { status: 400 },
      );
    }

    const schedule: { roundId: number; homeTeamId: number; awayTeamId: number }[] = [];
    let arrangement = teams.slice();
    for (let week = 0; week < weeks; week++) {
      const roundId = rounds[week];
      for (let i = 0; i < half; i++) {
        const teamA = arrangement[i];
        const teamB = arrangement[teamCount - 1 - i];
        if (teamA === -1 || teamB === -1) continue;
        if (week % 2 === 0) {
          schedule.push({ roundId, homeTeamId: teamA, awayTeamId: teamB });
        } else {
          schedule.push({ roundId, homeTeamId: teamB, awayTeamId: teamA });
        }
      }

      const fixed = arrangement[0];
      const rotating = arrangement.slice(1);
      rotating.unshift(rotating.pop() as number);
      arrangement = [fixed, ...rotating];
    }

    await prisma.match.deleteMany({
      where: { competitionId, roundId: { in: rounds.slice(0, weeks) } },
    });

    if (schedule.length > 0) {
      await prisma.$transaction(
        schedule.map((match) =>
          prisma.match.create({
            data: {
              competitionId,
              roundId: match.roundId,
              homeTeamId: match.homeTeamId,
              awayTeamId: match.awayTeamId,
            },
          }),
        ),
      );
    }

    return NextResponse.json({ ok: true, created: schedule.length, roundsUsed: weeks, hasBye });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "errore" }, { status: 500 });
  }
}
