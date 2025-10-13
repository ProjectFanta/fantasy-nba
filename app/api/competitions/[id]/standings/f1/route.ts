export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "../../../../../../lib/prisma";

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type StandingsEntry = {
  teamId: number;
  teamName: string;
  f1Points: number;
  roundsPlayed: number;
  totalRoundScore: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const competitionId = Number(params.id);

    if (Number.isNaN(competitionId) || competitionId <= 0) {
      return NextResponse.json({ error: "competitionId non valido" }, { status: 400 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        teams: {
          select: {
            id: true,
            name: true,
          },
        },
        rounds: {
          orderBy: { dayIndex: "asc" },
          select: {
            id: true,
            results: {
              select: {
                player: true,
                points: true,
              },
            },
            lineups: {
              select: {
                teamId: true,
                entries: true,
              },
            },
          },
        },
      },
    });

    if (!competition) {
      return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });
    }

    const standingsMap = new Map<number, StandingsEntry>();

    for (const team of competition.teams) {
      standingsMap.set(team.id, {
        teamId: team.id,
        teamName: team.name,
        f1Points: 0,
        roundsPlayed: 0,
        totalRoundScore: 0,
      });
    }

    for (const round of competition.rounds) {
      if (!round.results || round.results.length === 0) {
        continue;
      }

      const resultsMap = new Map<string, number>();
      for (const result of round.results) {
        const normalized = normalizeName(result.player);
        if (!normalized) continue;
        resultsMap.set(normalized, Number(result.points) || 0);
      }

      const roundScores: { teamId: number; score: number }[] = [];

      for (const team of competition.teams) {
        const lineup = round.lineups.find((l) => l.teamId === team.id);
        const rawEntries = (lineup?.entries ?? []) as unknown;
        const entries = Array.isArray(rawEntries) ? rawEntries : [];

        const normalizedEntries = entries
          .map((entry) => (typeof entry === "string" ? normalizeName(entry) : ""))
          .filter((entry) => entry.length > 0);

        let teamScore = 0;
        for (const playerName of normalizedEntries) {
          teamScore += resultsMap.get(playerName) ?? 0;
        }

        const standingsEntry = standingsMap.get(team.id);
        if (standingsEntry) {
          standingsEntry.roundsPlayed += 1;
          standingsEntry.totalRoundScore += teamScore;
        }

        roundScores.push({ teamId: team.id, score: teamScore });
      }

      roundScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const teamA = standingsMap.get(a.teamId)?.teamName ?? "";
        const teamB = standingsMap.get(b.teamId)?.teamName ?? "";
        return teamA.localeCompare(teamB);
      });

      for (let index = 0; index < roundScores.length && index < F1_POINTS.length; index += 1) {
        const entry = roundScores[index];
        const standingsEntry = standingsMap.get(entry.teamId);
        if (!standingsEntry) continue;
        standingsEntry.f1Points += F1_POINTS[index];
      }
    }

    const standings = Array.from(standingsMap.values()).sort((a, b) => {
      if (b.f1Points !== a.f1Points) return b.f1Points - a.f1Points;
      if (b.totalRoundScore !== a.totalRoundScore) return b.totalRoundScore - a.totalRoundScore;
      return a.teamName.localeCompare(b.teamName);
    });

    return NextResponse.json({ ok: true, standings });
  } catch (err: any) {
    console.error("GET competition F1 standings error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
