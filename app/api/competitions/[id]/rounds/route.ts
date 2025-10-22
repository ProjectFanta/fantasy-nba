export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/api/competitions/[id]/rounds/route.ts
import { NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { getUserFromToken } from "../../../../../lib/auth";

type RoundInput = {
  name?: string;
  startDate: string; // ISO date string (es. "2025-10-11T00:00:00Z")
  endDate: string; // ISO date string
  lockAt?: string | null; // ISO date string oppure null
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const competitionId = Number(params.id);
    if (Number.isNaN(competitionId)) {
      return NextResponse.json({ error: "competitionId non valido" }, { status: 400 });
    }

    const rounds = await prisma.round.findMany({
      where: { competitionId },
      orderBy: { dayIndex: "asc" },
      select: {
        id: true,
        competitionId: true,
        name: true,
        dayIndex: true,
        startDate: true,
        endDate: true,
        lockAt: true
      } as any
    });

    return NextResponse.json({ ok: true, rounds });
  } catch (err: any) {
    console.error("GET rounds error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = getUserFromToken(req);
    if (!user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const competitionId = Number(params.id);
    if (Number.isNaN(competitionId)) {
      return NextResponse.json({ error: "competitionId non valido" }, { status: 400 });
    }

    const body = await req.json();
    const { rounds } = body as { rounds: RoundInput[] };

    if (!Array.isArray(rounds) || rounds.length === 0) {
      return NextResponse.json({ error: "Array rounds mancante o vuoto" }, { status: 400 });
    }

    // Verifica appartenenza alla lega di quella competizione
    const comp = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { leagueId: true }
    });
    if (!comp) return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });

    const member = await prisma.leagueMember.findFirst({
      where: { leagueId: comp.leagueId, userId: Number(user.userId) }
    });
    if (!member) {
      return NextResponse.json({ error: "Non appartieni alla lega di questa competizione" }, { status: 403 });
    }

    // Cancella eventuali giornate già esistenti (opzionale).
    // In alternativa, si potrebbe impedire duplicati. Qui puliamo e riscriviamo.
    await prisma.round.deleteMany({ where: { competitionId } });

    // Inserimento batch
    const data = rounds.map((r, idx) => {
      const startDate = new Date(r.startDate);
      const endDate = new Date(r.endDate);
      const lockAt = r.lockAt ? new Date(r.lockAt) : null;

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error("Date round non valide");
      }

      if (lockAt && Number.isNaN(lockAt.getTime())) {
        throw new Error("lockAt non valido");
      }

      return {
        competitionId,
        name: r.name?.trim() || `Giornata ${idx + 1}`,
        dayIndex: idx + 1,
        startDate,
        endDate,
        ...(lockAt ? { lockAt } : {})
      };
    });

    const created = await prisma.$transaction(
      data.map((d) => prisma.round.create({ data: d }))
    );

    // aggiorniamo anche totalRounds
    await prisma.competition.update({
      where: { id: competitionId },
      data: { totalRounds: created.length }
    });

    return NextResponse.json({ ok: true, count: created.length });
  } catch (err: any) {
    console.error("POST rounds error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
