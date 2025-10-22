import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

import prisma from "@/lib/prisma";
import {
  extractEntries,
  loadCompetitionWithLineups,
  normalizeName,
  recomputeCompetition,
} from "@/lib/admin/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ImportRowInput = {
  roundId: number;
  teamName: string;
  playerName: string;
  points: number;
};

type PreviewRow = {
  index: number;
  roundId: number | null;
  roundName: string | null;
  teamName: string;
  teamId: number | null;
  playerName: string;
  normalizedPlayer: string | null;
  points: number | null;
  valid: boolean;
  issues: string[];
};

type PreviewResponse = {
  ok: boolean;
  dryRun: boolean;
  validCount: number;
  invalidCount: number;
  previewRows: PreviewRow[];
  errors?: string[];
  overwrite?: boolean;
};

type ApplyResponse = PreviewResponse & {
  dryRun: false;
  applied: boolean;
  inserted: number;
  deleted: number;
  recompute?: {
    f1?: { roundsProcessed?: number; teamsEvaluated?: number } | null;
    h2h?: { matchesEvaluated?: number; matchesUpdated?: number } | null;
  };
};

type ImportBody = {
  competitionId?: number;
  rows?: ImportRowInput[];
  overwrite?: boolean;
};

function getUserId(auth?: string | null): number | null {
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

function parseNumericPoints(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  const value = `${raw ?? ""}`.trim();
  if (!value) return null;
  let normalized = value;
  if (normalized.includes(",") && !normalized.includes(".")) {
    normalized = normalized.replace(/,/g, ".");
  }
  const numeric = Number(normalized);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1" ||
      url.searchParams.get("dryRun")?.toLowerCase() === "true";

    const userId = getUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as ImportBody;
    const competitionId = Number(body?.competitionId);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const rawRows = Array.isArray(body?.rows) ? body.rows : [];
    if (rawRows.length === 0) {
      const response: PreviewResponse = {
        ok: true,
        dryRun: Boolean(dryRun),
        validCount: 0,
        invalidCount: 0,
        previewRows: [],
        errors: ["Nessuna riga fornita"],
        overwrite: Boolean(body?.overwrite),
      };
      return NextResponse.json(response);
    }

    const competition = await loadCompetitionWithLineups(competitionId);
    if (!competition) {
      return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });
    }

    const ownerId = competition.league?.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const overwrite = Boolean(body?.overwrite);

    const roundById = new Map<number, { id: number; name?: string | null; dayIndex?: number | null }>();
    for (const round of competition.rounds ?? []) {
      roundById.set(round.id, round);
    }

    const teamByName = new Map<string, { id: number; name: string; players: Set<string> }>();
    for (const team of competition.teams ?? []) {
      const normalizedTeam = normalizeName(team.name ?? "");
      const playerSet = new Set<string>();
      for (const lineup of team.lineups ?? []) {
        for (const entry of extractEntries(lineup.entries)) {
          const normalized = normalizeName(entry);
          if (normalized) {
            playerSet.add(normalized);
          }
        }
      }
      if (normalizedTeam) {
        teamByName.set(normalizedTeam, { id: team.id, name: team.name, players: playerSet });
      }
    }

    const roundIds = Array.from(
      new Set(
        rawRows
          .map((row) => Number((row as any)?.roundId))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    );

    const existingResults = roundIds.length
      ? await prisma.playerResult.findMany({
          where: { roundId: { in: roundIds } },
        })
      : [];

    const existingByRound = new Map<number, Set<string>>();
    for (const result of existingResults) {
      const key = normalizeName(`${result.player ?? ""}`);
      if (!key) continue;
      const roundSet = existingByRound.get(result.roundId) ?? new Set<string>();
      roundSet.add(key);
      existingByRound.set(result.roundId, roundSet);
    }

    const seenCombination = new Set<string>();
    const previewRows: PreviewRow[] = [];
    const validRows: {
      index: number;
      roundId: number;
      teamId: number;
      teamName: string;
      normalizedPlayer: string;
      points: number;
    }[] = [];

    rawRows.forEach((row, index) => {
      const roundId = Number((row as any)?.roundId);
      const rawTeamName = `${(row as any)?.teamName ?? ""}`.trim();
      const rawPlayerName = `${(row as any)?.playerName ?? ""}`.trim();
      const points = parseNumericPoints((row as any)?.points);

      const normalizedTeamName = normalizeName(rawTeamName);
      const normalizedPlayer = normalizeName(rawPlayerName);

      const issues: string[] = [];
      const roundInfo = Number.isFinite(roundId) ? roundById.get(roundId) ?? null : null;
      if (!roundId || !roundInfo) {
        issues.push("Round non valido per la competizione");
      }

      const teamInfo = normalizedTeamName ? teamByName.get(normalizedTeamName) ?? null : null;
      if (!normalizedTeamName || !teamInfo) {
        issues.push("Squadra non trovata nella competizione");
      }

      if (!normalizedPlayer) {
        issues.push("Nome giocatore mancante");
      } else if (teamInfo && teamInfo.players.size > 0 && !teamInfo.players.has(normalizedPlayer)) {
        issues.push("Giocatore non presente nei roster della squadra");
      }

      if (points == null) {
        issues.push("Punteggio non numerico");
      }

      if (normalizedPlayer && roundId && !overwrite) {
        const existingSet = existingByRound.get(roundId);
        if (existingSet && existingSet.has(normalizedPlayer)) {
          issues.push("Risultato già presente: abilita sovrascrittura per aggiornare");
        }
      }

      if (roundId && normalizedTeamName && normalizedPlayer) {
        const duplicateKey = `${roundId}::${normalizedTeamName}::${normalizedPlayer}`;
        if (seenCombination.has(duplicateKey)) {
          issues.push("Riga duplicata nel file importato");
        }
        seenCombination.add(duplicateKey);
      }

      const isValid = issues.length === 0;
      if (isValid && roundId && teamInfo && normalizedPlayer && points != null) {
        validRows.push({
          index,
          roundId,
          teamId: teamInfo.id,
          teamName: teamInfo.name,
          normalizedPlayer,
          points,
        });
      }

      previewRows.push({
        index,
        roundId: roundInfo?.id ?? (Number.isFinite(roundId) ? roundId : null),
        roundName: roundInfo?.name ?? null,
        teamName: rawTeamName,
        teamId: teamInfo?.id ?? null,
        playerName: rawPlayerName,
        normalizedPlayer: normalizedPlayer || null,
        points: points ?? null,
        valid: isValid,
        issues,
      });
    });

    const validCount = validRows.length;
    const invalidCount = previewRows.length - validCount;

    if (dryRun) {
      const response: PreviewResponse = {
        ok: true,
        dryRun: true,
        validCount,
        invalidCount,
        previewRows,
        overwrite,
      };
      return NextResponse.json(response);
    }

    let deleted = 0;
    let inserted = 0;

    if (validRows.length > 0) {
      const grouped = new Map<number, Set<string>>();
      for (const row of validRows) {
        const set = grouped.get(row.roundId) ?? new Set<string>();
        set.add(row.normalizedPlayer);
        grouped.set(row.roundId, set);
      }

      await prisma.$transaction(async (tx) => {
        if (overwrite) {
          for (const [roundId, players] of grouped.entries()) {
            if (players.size === 0) continue;
            const res = await tx.playerResult.deleteMany({
              where: { roundId, player: { in: Array.from(players) } },
            });
            deleted += res.count;
          }
        }

        if (validRows.length > 0) {
          const res = await tx.playerResult.createMany({
            data: validRows.map((row) => ({
              roundId: row.roundId,
              player: row.normalizedPlayer,
              points: row.points,
            })),
            skipDuplicates: true,
          });
          inserted += res.count;
        }
      });
    }

    const recompute = validRows.length > 0 ? await recomputeCompetition(competitionId, "all") : null;

    const response: ApplyResponse = {
      ok: true,
      dryRun: false,
      validCount,
      invalidCount,
      previewRows,
      overwrite,
      applied: validRows.length > 0,
      inserted,
      deleted,
      recompute: {
        f1: recompute?.f1?.summary ?? null,
        h2h: recompute?.h2h?.summary ?? null,
      },
    };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("POST admin results import error", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "errore" },
      { status: 500 },
    );
  }
}

