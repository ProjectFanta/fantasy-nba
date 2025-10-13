import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const competitionId = Number(params?.id);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        rounds: { select: { id: true } },
        teams: {
          select: {
            id: true, name: true,
            lineups: {
              select: { roundId: true, entries: true }
            }
          }
        }
      }
    });

    if (!competition) return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });

    const roundIds = competition.rounds.map(r => r.id);
    if (roundIds.length === 0) {
      return NextResponse.json({ standings: [] });
    }

    // Preleva tutti i risultati dei round
    const allResults = await prisma.playerResult.findMany({
      where: { roundId: { in: roundIds } }
    });

    // Map: roundId -> results normalizzati
    const resultsByRound = new Map<number, { player: string; points: number }[]>();
    for (const r of allResults) {
      const list = resultsByRound.get(r.roundId) ?? [];
      list.push({ player: r.player.toLowerCase().trim(), points: Number(r.points) });
      resultsByRound.set(r.roundId, list);
    }

    // Calcolo punteggi per round per ogni team
    type TScore = { teamId: number; teamName: string; roundScore: number };
    const roundScores: Map<number, TScore[]> = new Map();

    for (const roundId of roundIds) {
      const arr: TScore[] = [];

      for (const team of competition.teams) {
        const lineupForRound = team.lineups.find(l => l.roundId === roundId);
        let score = 0;
        if (lineupForRound) {
          const entries: string[] = Array.isArray(lineupForRound.entries)
            ? (lineupForRound.entries as any[])
            : Array.isArray((lineupForRound.entries as any)?.items)
              ? (lineupForRound.entries as any).items
              : [];
          const names = new Set(entries.map((x: any) => (x ?? "").toString().toLowerCase().trim()).filter(Boolean));
          const res = resultsByRound.get(roundId) ?? [];
          for (const pr of res) {
            if (names.has(pr.player)) {
              score += Number(pr.points || 0);
            }
          }
        }
        arr.push({ teamId: team.id, teamName: team.name, roundScore: score });
      }

      roundScores.set(roundId, arr);
    }

    // Assegna punti F1 per round e somma
    const agg = new Map<number, { teamId: number; teamName: string; f1Points: number; roundsPlayed: number; totalRoundScore: number }>();

    for (const roundId of roundIds) {
      const arr = roundScores.get(roundId) ?? [];
      // ordina desc per punteggio round
      arr.sort((a, b) => b.roundScore - a.roundScore);
      arr.forEach((row, idx) => {
        const f1 = idx < F1_POINTS.length ? F1_POINTS[idx] : 0;
        const prev = agg.get(row.teamId) ?? { teamId: row.teamId, teamName: row.teamName, f1Points: 0, roundsPlayed: 0, totalRoundScore: 0 };
        agg.set(row.teamId, {
          teamId: row.teamId,
          teamName: row.teamName,
          f1Points: prev.f1Points + f1,
          roundsPlayed: prev.roundsPlayed + 1,
          totalRoundScore: prev.totalRoundScore + row.roundScore
        });
      });
    }

    const standings = Array.from(agg.values()).sort((a, b) => b.f1Points - a.f1Points || b.totalRoundScore - a.totalRoundScore);

    return NextResponse.json({ standings });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "errore" }, { status: 500 });
  }
}
