export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getUserFromToken } from "../../../../lib/auth";

type ResultInput = {
  player?: string;
  points?: number;
};

function formatPlayerName(name: string | undefined | null): string {
  return typeof name === "string" ? name.trim() : "";
}

function normalizeKey(name: string | undefined | null): string {
  return formatPlayerName(name).toLowerCase();
}

export async function POST(req: Request) {
  try {
    const user = getUserFromToken(req);
    const userId = Number(user?.userId);

    if (!user?.userId || Number.isNaN(userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { roundId, items } = body as { roundId?: number; items?: ResultInput[] };

    const roundIdNum = Number(roundId);

    if (Number.isNaN(roundIdNum) || roundIdNum <= 0) {
      return NextResponse.json({ error: "roundId non valido" }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nessun risultato da salvare" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundIdNum },
      select: {
        id: true,
        competition: {
          select: {
            league: {
              select: {
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Giornata non trovata" }, { status: 404 });
    }

    const ownerId = round.competition.league.ownerId;

    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Non sei autorizzato a modificare i risultati" }, { status: 403 });
    }

    const uniqueItems = new Map<string, { player: string; points: number }>();

    for (const item of items) {
      const playerName = formatPlayerName(item.player);
      const key = normalizeKey(playerName);
      const pointsValue = Number(item.points);

      if (!playerName || !key || Number.isNaN(pointsValue)) {
        continue;
      }

      uniqueItems.set(key, { player: playerName, points: pointsValue });
    }

    if (uniqueItems.size === 0) {
      return NextResponse.json({ error: "Nessun risultato valido" }, { status: 400 });
    }

    const existingResults = await prisma.playerResult.findMany({
      where: { roundId: roundIdNum },
      select: { id: true, player: true },
    });

    const existingMap = new Map<string, number>();
    for (const result of existingResults) {
      const key = normalizeKey(result.player);
      if (key) existingMap.set(key, result.id);
    }

    const operations: Parameters<typeof prisma.$transaction>[0] = [];

    for (const [key, value] of uniqueItems.entries()) {
      const existingId = existingMap.get(key);
      if (existingId) {
        operations.push(
          prisma.playerResult.update({
            where: { id: existingId },
            data: {
              player: value.player,
              points: value.points,
            },
          })
        );
      } else {
        operations.push(
          prisma.playerResult.create({
            data: {
              roundId: roundIdNum,
              player: value.player,
              points: value.points,
            },
          })
        );
      }
    }

    const results = await prisma.$transaction(operations);

    return NextResponse.json({ ok: true, count: results.length });
  } catch (err: any) {
    console.error("POST admin/results error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roundIdParam = searchParams.get("roundId");
    const roundId = Number(roundIdParam);

    if (!roundIdParam || Number.isNaN(roundId) || roundId <= 0) {
      return NextResponse.json({ error: "roundId mancante o non valido" }, { status: 400 });
    }

    const results = await prisma.playerResult.findMany({
      where: { roundId },
      select: { player: true, points: true },
      orderBy: { points: "desc" },
    });

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error("GET admin/results error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
