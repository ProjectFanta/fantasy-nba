export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getUserFromToken } from "../../../lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const competitionIdParam = searchParams.get("competitionId");
    if (!competitionIdParam) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }
    const competitionId = Number(competitionIdParam);
    if (Number.isNaN(competitionId)) {
      return NextResponse.json({ error: "competitionId non valido" }, { status: 400 });
    }

    const teams = await prisma.team.findMany({
      where: { competitionId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, userId: true }
    });

    return NextResponse.json({ ok: true, teams });
  } catch (err: any) {
    console.error("GET teams error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = getUserFromToken(req);
    if (!user?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { competitionId, name } = body as { competitionId?: number; name?: string };

    const competitionIdNum = Number(competitionId);
    const trimmedName = name?.trim();

    if (
      competitionId === undefined ||
      competitionId === null ||
      Number.isNaN(competitionIdNum) ||
      !trimmedName
    ) {
      return NextResponse.json({ error: "Dati mancanti (competitionId, name)" }, { status: 400 });
    }

    const competition = await prisma.competition.findUnique({
      where: { id: competitionIdNum },
      select: { id: true, leagueId: true }
    });
    if (!competition) {
      return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });
    }

    const member = await prisma.leagueMember.findFirst({
      where: { leagueId: competition.leagueId, userId: Number(user.userId) }
    });
    if (!member) {
      return NextResponse.json({ error: "Non appartieni alla lega" }, { status: 403 });
    }

    const existing = await prisma.team.findFirst({
      where: { competitionId: competition.id, userId: Number(user.userId) }
    });
    if (existing) {
      return NextResponse.json({ error: "Hai già una squadra per questa competizione" }, { status: 409 });
    }

    const team = await prisma.team.create({
      data: {
        competitionId: competition.id,
        userId: Number(user.userId),
        name: trimmedName
      },
      select: { id: true, name: true, userId: true }
    });

    return NextResponse.json({ ok: true, team }, { status: 201 });
  } catch (err: any) {
    console.error("POST teams error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
