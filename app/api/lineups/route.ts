export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const teamIdParam = searchParams.get("teamId");
    const roundIdParam = searchParams.get("roundId");

    if (!teamIdParam || !roundIdParam) {
      return NextResponse.json({ error: "teamId e roundId richiesti" }, { status: 400 });
    }

    const teamId = Number(teamIdParam);
    const roundId = Number(roundIdParam);

    if (Number.isNaN(teamId) || Number.isNaN(roundId)) {
      return NextResponse.json({ error: "Parametri non validi" }, { status: 400 });
    }

    const lineup = await prisma.lineup.findUnique({
      where: {
        teamId_roundId: {
          teamId,
          roundId
        }
      },
      select: {
        id: true,
        teamId: true,
        roundId: true,
        entries: true
      }
    });

    return NextResponse.json({ ok: true, lineup: lineup ?? null });
  } catch (err: any) {
    console.error("GET lineups error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = getUserFromToken(req);
    const userId = Number(user?.userId);

    if (!user?.userId || Number.isNaN(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const override = url.searchParams.get("override") === "1";

    const body = await req.json();
    const { teamId, roundId, entries } = body as {
      teamId?: number;
      roundId?: number;
      entries?: unknown;
    };

    const teamIdNum = Number(teamId);
    const roundIdNum = Number(roundId);

    if (Number.isNaN(teamIdNum) || Number.isNaN(roundIdNum)) {
      return NextResponse.json({ error: "teamId o roundId non validi" }, { status: 400 });
    }

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: "entries deve essere un array" }, { status: 400 });
    }

    const normalizedEntries = entries
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);

    if (normalizedEntries.length === 0) {
      return NextResponse.json({ error: "Inserisci almeno un giocatore" }, { status: 400 });
    }

    if (normalizedEntries.length > 12) {
      return NextResponse.json({ error: "Massimo 12 giocatori" }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamIdNum },
      select: { id: true, userId: true, competitionId: true }
    });

    if (!team) {
      return NextResponse.json({ error: "Squadra non trovata" }, { status: 404 });
    }

    if (team.userId !== userId) {
      return NextResponse.json({ error: "Non sei il proprietario della squadra" }, { status: 403 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundIdNum },
      select: {
        id: true,
        competitionId: true,
        lockAt: true,
        competition: {
          select: {
            league: {
              select: { ownerId: true }
            }
          }
        }
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Giornata non trovata" }, { status: 404 });
    }

    if (round.competitionId !== team.competitionId) {
      return NextResponse.json({ error: "La giornata appartiene a un'altra competizione" }, { status: 400 });
    }

    const ownerId = round.competition?.league?.ownerId ?? null;
    if (override && (!ownerId || ownerId !== userId)) {
      return NextResponse.json({ error: "Override non consentito" }, { status: 403 });
    }

    const lockDate = round.lockAt ? new Date(round.lockAt) : null;
    if (lockDate && !Number.isNaN(lockDate.getTime())) {
      const isLocked = Date.now() >= lockDate.getTime();
      const canOverride = override && ownerId === userId;
      if (isLocked && !canOverride) {
        return NextResponse.json({ error: "Round locked" }, { status: 403 });
      }
    }

    const lineup = await prisma.lineup.upsert({
      where: {
        teamId_roundId: {
          teamId: team.id,
          roundId: round.id
        }
      },
      update: {
        entries: normalizedEntries
      },
      create: {
        teamId: team.id,
        roundId: round.id,
        entries: normalizedEntries
      },
      select: {
        id: true,
        teamId: true,
        roundId: true,
        entries: true
      }
    });

    return NextResponse.json({ ok: true, lineup });
  } catch (err: any) {
    console.error("POST lineups error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
