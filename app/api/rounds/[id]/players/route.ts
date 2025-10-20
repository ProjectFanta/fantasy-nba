import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeName(value: unknown): { key: string; display: string } | null {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return null;
    value = String(value);
  }
  const raw = value.trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  return { key, display: raw || key };
}

function extractEntries(entries: unknown): string[] {
  if (Array.isArray(entries)) {
    return entries.map((item) => (typeof item === "string" ? item : item != null ? String(item) : ""));
  }
  if (entries && typeof entries === "object" && "items" in entries) {
    const items = (entries as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items.map((item) => (typeof item === "string" ? item : item != null ? String(item) : ""));
    }
  }
  return [];
}

export async function GET(_req: Request, context: { params?: { id?: string } }) {
  try {
    const idParam = context?.params?.id;
    const roundId = Number(idParam);

    if (!idParam || Number.isNaN(roundId) || roundId <= 0) {
      return NextResponse.json({ error: "Round id mancante o non valido" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, competitionId: true }
    });

    if (!round) {
      return NextResponse.json({ error: "Round non trovato" }, { status: 404 });
    }

    const lineups = await prisma.lineup.findMany({
      where: { roundId: round.id },
      select: { entries: true }
    });

    const playersMap = new Map<string, string>();

    for (const lineup of lineups) {
      const names = extractEntries(lineup.entries);
      for (const name of names) {
        const normalized = normalizeName(name);
        if (!normalized) continue;
        if (!playersMap.has(normalized.key)) {
          playersMap.set(normalized.key, normalized.display);
        }
      }
    }

    const players = Array.from(playersMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, display]) => (display ? display : key));

    return NextResponse.json({ players });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Errore interno" }, { status: 500 });
  }
}
