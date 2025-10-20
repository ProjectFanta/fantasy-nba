import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerAccumulator = {
  teams: Set<string>;
  original?: string | null;
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

export async function GET(req: Request) {
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
                name: true,
                lineups: {
                  where: { roundId },
                  select: {
                    entries: true,
                  },
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

    const players = new Map<string, PlayerAccumulator>();

    for (const team of round.competition.teams) {
      for (const lineup of team.lineups) {
        const rawEntries = lineup.entries as unknown;
        const entries = Array.isArray(rawEntries)
          ? rawEntries
          : Array.isArray((rawEntries as any)?.items)
          ? (rawEntries as any).items
          : [];

        for (const entry of entries as (string | null | undefined)[]) {
          const original = `${entry ?? ""}`.trim();
          const normalized = original.toLowerCase();
          if (!normalized) continue;
          const acc = players.get(normalized) ?? { teams: new Set<string>(), original: null };
          if (!acc.original && original) {
            acc.original = original;
          }
          acc.teams.add(team.name);
          players.set(normalized, acc);
        }
      }
    }

    const existingResults = await prisma.playerResult.findMany({ where: { roundId } });
    const pointsByPlayer = new Map<string, number | null>();
    for (const result of existingResults) {
      const key = `${result.player ?? ""}`.toLowerCase().trim();
      if (!key) continue;
      let points: number | null = null;
      if (result.points != null) {
        const numeric = Number(result.points);
        points = Number.isNaN(numeric) ? null : numeric;
      }
      pointsByPlayer.set(key, points);
    }

    const list = Array.from(players.entries())
      .map(([player, info]) => ({
        player,
        original: info.original ?? null,
        teams: Array.from(info.teams).sort((a, b) => a.localeCompare(b)),
        points: pointsByPlayer.has(player) ? pointsByPlayer.get(player) ?? null : null,
      }))
      .sort((a, b) => a.player.localeCompare(b.player));

    return NextResponse.json({ ok: true, roundId, players: list });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? "errore" }, { status: 500 });
  }
}
