// app/api/competitions/route.ts
import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getUserFromToken } from "../../../lib/auth";

// Evita che Next provi a pre-renderizzare
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueIdParam = searchParams.get("leagueId");
    if (!leagueIdParam) {
      return NextResponse.json({ error: "leagueId mancante" }, { status: 400 });
    }
    const leagueId = Number(leagueIdParam);
    if (Number.isNaN(leagueId)) {
      return NextResponse.json({ error: "leagueId non valido" }, { status: 400 });
    }

    const comps = await prisma.competition.findMany({
      where: { leagueId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, type: true, totalRounds: true, createdAt: true }
    });

    return NextResponse.json({ ok: true, competitions: comps });
  } catch (err: any) {
    console.error("GET competitions error:", err);
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
    const { leagueId, name, type, totalRounds } = body as {
      leagueId: number; name: string; type: "H2H" | "F1"; totalRounds?: number;
    };

    if (!leagueId || !name || !type) {
      return NextResponse.json({ error: "Dati mancanti (leagueId, name, type)" }, { status: 400 });
    }

    // Controlla appartenenza alla lega
    const member = await prisma.leagueMember.findFirst({
      where: { leagueId: Number(leagueId), userId: Number(user.userId) }
    });
    if (!member) {
      return NextResponse.json({ error: "Non appartieni alla lega" }, { status: 403 });
    }

    const competition = await prisma.competition.create({
      data: {
        leagueId: Number(leagueId),
        name: name.trim(),
        type,
        totalRounds: totalRounds ?? null
      },
      select: { id: true, leagueId: true, name: true, type: true, totalRounds: true, createdAt: true }
    });

    return NextResponse.json({ ok: true, competition }, { status: 201 });
  } catch (err: any) {
    console.error("POST competitions error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
