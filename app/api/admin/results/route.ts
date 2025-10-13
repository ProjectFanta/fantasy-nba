import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PostBody = {
  roundId: number;
  items: { player: string; points: number }[];
};

function getUserIdFromAuthHeader(auth?: string | null): number | null {
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as any;
    if (payload && typeof payload.userId === "number") {
      return payload.userId;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const roundId = Number(url.searchParams.get("roundId"));
    if (!roundId) {
      return NextResponse.json({ error: "roundId mancante" }, { status: 400 });
    }

    const results = await prisma.playerResult.findMany({
      where: { roundId },
      orderBy: { points: "desc" },
      select: { player: true, points: true }
    });

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "errore" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromAuthHeader(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PostBody;
    const roundId = Number(body?.roundId);
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!roundId || items.length === 0) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { competition: { include: { league: true } } }
    });

    if (!round) return NextResponse.json({ error: "Round non trovato" }, { status: 404 });

    const ownerId = round.competition.league.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden: solo l'admin può inserire" }, { status: 403 });
    }

    let count = 0;
    for (const it of items) {
      const player = (it.player ?? "").toString().trim().toLowerCase();
      const points = Number(it.points);
      if (!player || Number.isNaN(points)) continue;

      await prisma.playerResult.upsert({
        where: { roundId_player: { roundId, player } },
        create: { roundId, player, points },
        update: { points }
      });
      count++;
    }

    return NextResponse.json({ ok: true, count });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "errore" }, { status: 500 });
  }
}
