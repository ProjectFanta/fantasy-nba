export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/api/leagues/route.ts
import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { getUserFromToken } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const user = getUserFromToken(req);
    if (!user || !user.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description } = body;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // crea la lega
    const league = await prisma.league.create({
      data: {
        name,
        description: null,
        ownerId: Number(user.userId),
      },
    });

    // aggiunge il creatore come membro
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: Number(user.userId),
      },
    });

    return NextResponse.json({ ok: true, league }, { status: 201 });
  } catch (err: any) {
    console.error("Create league error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const user = getUserFromToken(req);
    if (!user || !user.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const leagues = await prisma.league.findMany({
      where: {
        members: {
          some: { userId: Number(user.userId) },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, leagues });
  } catch (err: any) {
    console.error("Get leagues error:", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
