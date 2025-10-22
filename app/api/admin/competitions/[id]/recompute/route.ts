import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

type Mode = "f1" | "h2h" | "all";
type PostBody = { mode?: Mode };

type RoundSummary = {
  roundId: number;
  scores: {
    teamId: number;
    teamName: string;
    roundScore: number;
    f1Points: number;
  }[];
};

type F1StandingRow = {
  teamId: number;
  teamName: string;
  roundsPlayed: number;
  f1Points: number;
  totalRoundScore: number;
};

type H2HStandingRow = {
  teamId: number;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  gf: number;
  ga: number;
  diff: number;
};

type CompetitionForAdmin = NonNullable<
  Awaited<ReturnType<typeof loadCompetitionWithLineups>>
>;

const tableExistsCache = new Map<string, boolean>();

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

function normalizeName(value: string): string {
  return value.toLowerCase().trim();
}

function extractEntries(raw: unknown): string[] {
  const normalize = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof (value as any).name === "string") {
      return (value as any).name as string;
    }
    if (value == null) return "";
    return `${value}`;
  };

  if (Array.isArray(raw)) {
    return raw.map((item) => normalize(item));
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).items)) {
    return ((raw as any).items as unknown[]).map((item) => normalize(item));
  }
  return [];
}

async function tableExists(tableName: string): Promise<boolean> {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName)!;
  }
  try {
    const [row] = await prisma.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (${tableName}, ${tableName.toLowerCase()})
        ) AS "exists"
      `,
    );
    const exists = Boolean(row?.exists);
    tableExistsCache.set(tableName, exists);
    return exists;
  } catch (error) {
    console.warn(`[admin/recompute] impossibile verificare tabella ${tableName}:`, error);
    tableExistsCache.set(tableName, false);
    return false;
  }
}

async function persistF1Derived(
  competitionId: number,
  roundSummaries: RoundSummary[],
  standings: F1StandingRow[],
) {
  const hasRoundTable = await tableExists("F1RoundScore");
  if (hasRoundTable) {
    const table = Prisma.raw('"F1RoundScore"');
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId}`,
    );
    const statements: ReturnType<typeof prisma.$executeRaw>[] = [];
    for (const round of roundSummaries) {
      for (const row of round.scores) {
        statements.push(
          prisma.$executeRaw(
            Prisma.sql`
              INSERT INTO ${table}
                ("competitionId", "roundId", "teamId", "roundScore", "f1Points")
              VALUES
                (${competitionId}, ${round.roundId}, ${row.teamId}, ${row.roundScore}, ${row.f1Points})
            `,
          ),
        );
      }
    }
    if (statements.length > 0) {
      await prisma.$transaction(statements);
    }
  }

  const hasStandingTable = await tableExists("F1Standing");
  if (hasStandingTable) {
    const table = Prisma.raw('"F1Standing"');
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId}`,
    );
    const statements: ReturnType<typeof prisma.$executeRaw>[] = [];
    for (const row of standings) {
      statements.push(
        prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO ${table}
              ("competitionId", "teamId", "f1Points", "totalRoundScore", "roundsPlayed")
            VALUES
              (${competitionId}, ${row.teamId}, ${row.f1Points}, ${row.totalRoundScore}, ${row.roundsPlayed})
          `,
        ),
      );
    }
    if (statements.length > 0) {
      await prisma.$transaction(statements);
    }
  }
}

async function persistH2HDerived(competitionId: number, standings: H2HStandingRow[]) {
  const hasStandingTable = await tableExists("H2HStanding");
  if (!hasStandingTable) return;

  const table = Prisma.raw('"H2HStanding"');
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId}`,
  );
  const statements: ReturnType<typeof prisma.$executeRaw>[] = [];
  for (const row of standings) {
    statements.push(
      prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO ${table}
            ("competitionId", "teamId", "points", "wins", "losses", "ties", "played", "gf", "ga", "diff")
          VALUES
            (
              ${competitionId},
              ${row.teamId},
              ${row.points},
              ${row.wins},
              ${row.losses},
              ${row.ties},
              ${row.played},
              ${row.gf},
              ${row.ga},
              ${row.diff}
            )
        `,
      ),
    );
  }
  if (statements.length > 0) {
    await prisma.$transaction(statements);
  }
}

async function loadCompetitionWithLineups(competitionId: number) {
  return prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      league: { select: { ownerId: true } },
      rounds: {
        select: { id: true, name: true, dayIndex: true },
        orderBy: { dayIndex: "asc" },
      },
      teams: {
        select: {
          id: true,
          name: true,
          lineups: {
            select: { roundId: true, entries: true },
          },
        },
      },
    },
  });
}

async function loadCompetitionBasics(competitionId: number) {
  return prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      league: { select: { ownerId: true } },
      rounds: {
        select: { id: true, name: true, dayIndex: true },
        orderBy: { dayIndex: "asc" },
      },
    },
  });
}

async function recomputeF1(competition: CompetitionForAdmin) {
  const roundIds = competition.rounds.map((round) => round.id);
  if (roundIds.length === 0) {
    await persistF1Derived(competition.id, [], []);
    return {
      summary: {
        roundsProcessed: 0,
        teamsEvaluated: competition.teams.length,
      },
      standings: [] as F1StandingRow[],
      rounds: [] as RoundSummary[],
    };
  }

  const playerResults = await prisma.playerResult.findMany({
    where: { roundId: { in: roundIds } },
  });

  const resultsByRound = new Map<number, Map<string, number>>();
  for (const result of playerResults) {
    const normalizedPlayer = normalizeName(`${result.player ?? ""}`);
    if (!normalizedPlayer) continue;
    const roundMap = resultsByRound.get(result.roundId) ?? new Map<string, number>();
    roundMap.set(normalizedPlayer, Number(result.points ?? 0));
    resultsByRound.set(result.roundId, roundMap);
  }

  const lineupByTeam = new Map<number, Map<number, string[]>>();
  for (const team of competition.teams) {
    const map = new Map<number, string[]>();
    for (const lineup of team.lineups ?? []) {
      map.set(lineup.roundId, extractEntries(lineup.entries));
    }
    lineupByTeam.set(team.id, map);
  }

  const roundSummaries: RoundSummary[] = [];
  const standingsMap = new Map<number, F1StandingRow>();

  for (const round of competition.rounds) {
    const roundId = round.id;
    const scoreRows: RoundSummary["scores"] = [];
    for (const team of competition.teams) {
      const entries = lineupByTeam.get(team.id)?.get(roundId) ?? [];
      const uniquePlayers = new Set(entries.map((name) => normalizeName(name)).filter(Boolean));
      const roundMap = resultsByRound.get(roundId) ?? new Map<string, number>();
      let roundScore = 0;
      for (const playerName of uniquePlayers) {
        roundScore += Number(roundMap.get(playerName) ?? 0);
      }
      scoreRows.push({
        teamId: team.id,
        teamName: team.name,
        roundScore,
        f1Points: 0,
      });
    }

    scoreRows.sort((a, b) => b.roundScore - a.roundScore);
    scoreRows.forEach((row, index) => {
      const f1Points = index < F1_POINTS.length ? F1_POINTS[index] : 0;
      row.f1Points = f1Points;
      const prev = standingsMap.get(row.teamId) ?? {
        teamId: row.teamId,
        teamName: row.teamName,
        roundsPlayed: 0,
        f1Points: 0,
        totalRoundScore: 0,
      };
      standingsMap.set(row.teamId, {
        teamId: row.teamId,
        teamName: row.teamName,
        roundsPlayed: prev.roundsPlayed + 1,
        f1Points: prev.f1Points + f1Points,
        totalRoundScore: prev.totalRoundScore + row.roundScore,
      });
    });

    roundSummaries.push({ roundId, scores: scoreRows });
  }

  const standings = Array.from(standingsMap.values()).sort(
    (a, b) =>
      b.f1Points - a.f1Points ||
      b.totalRoundScore - a.totalRoundScore ||
      a.teamName.localeCompare(b.teamName),
  );

  await persistF1Derived(competition.id, roundSummaries, standings);

  return {
    summary: {
      roundsProcessed: roundSummaries.length,
      teamsEvaluated: standings.length,
    },
    standings,
    rounds: roundSummaries,
  };
}

async function recomputeH2H(competition: CompetitionForAdmin) {
  const matches = await prisma.match.findMany({
    where: { competitionId: competition.id },
  });

  if (matches.length === 0) {
    await persistH2HDerived(competition.id, []);
    return {
      summary: {
        matchesEvaluated: 0,
        matchesUpdated: 0,
        standings: [] as H2HStandingRow[],
      },
    };
  }

  const roundIds = Array.from(new Set(matches.map((match) => match.roundId)));
  const playerResults = await prisma.playerResult.findMany({
    where: { roundId: { in: roundIds } },
  });

  const resultsByRound = new Map<number, Map<string, number>>();
  for (const result of playerResults) {
    const normalizedPlayer = normalizeName(`${result.player ?? ""}`);
    if (!normalizedPlayer) continue;
    const roundMap = resultsByRound.get(result.roundId) ?? new Map<string, number>();
    roundMap.set(normalizedPlayer, Number(result.points ?? 0));
    resultsByRound.set(result.roundId, roundMap);
  }

  const lineupByTeam = new Map<number, Map<number, string[]>>();
  for (const team of competition.teams) {
    const map = new Map<number, string[]>();
    for (const lineup of team.lineups ?? []) {
      map.set(lineup.roundId, extractEntries(lineup.entries));
    }
    lineupByTeam.set(team.id, map);
  }

  const recomputed = matches.map((match) => {
    const roundMap = resultsByRound.get(match.roundId) ?? new Map<string, number>();

    const homeEntries = lineupByTeam.get(match.homeTeamId)?.get(match.roundId) ?? [];
    const awayEntries = lineupByTeam.get(match.awayTeamId)?.get(match.roundId) ?? [];

    const computeScore = (entries: string[]) => {
      const uniquePlayers = new Set(entries.map((name) => normalizeName(name)).filter(Boolean));
      let total = 0;
      for (const playerName of uniquePlayers) {
        total += Number(roundMap.get(playerName) ?? 0);
      }
      return total;
    };

    const homeScore = computeScore(homeEntries);
    const awayScore = computeScore(awayEntries);

    let result: "H" | "A" | "D";
    if (homeScore > awayScore) result = "H";
    else if (homeScore < awayScore) result = "A";
    else result = "D";

    const changed =
      Number(match.homeScore ?? 0) !== homeScore ||
      Number(match.awayScore ?? 0) !== awayScore ||
      (match.result ?? null) !== result;

    return {
      matchId: match.id,
      roundId: match.roundId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore,
      awayScore,
      result,
      changed,
    };
  });

  const updates = recomputed.filter((item) => item.changed);
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((item) =>
        prisma.match.update({
          where: { id: item.matchId },
          data: {
            homeScore: item.homeScore,
            awayScore: item.awayScore,
            result: item.result,
          },
        }),
      ),
    );
  }

  const standingsMap = new Map<number, H2HStandingRow>();
  for (const team of competition.teams ?? []) {
    standingsMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      points: 0,
      gf: 0,
      ga: 0,
      diff: 0,
    });
  }

  for (const item of recomputed) {
    const home = standingsMap.get(item.homeTeamId);
    const away = standingsMap.get(item.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;

    home.gf += item.homeScore;
    home.ga += item.awayScore;
    away.gf += item.awayScore;
    away.ga += item.homeScore;

    if (item.result === "H") {
      home.wins += 1;
      home.points += 2;
      away.losses += 1;
    } else if (item.result === "A") {
      away.wins += 1;
      away.points += 2;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const standings = Array.from(standingsMap.values()).map((row) => ({
    ...row,
    diff: row.gf - row.ga,
  }));

  standings.sort((a, b) =>
    b.points - a.points ||
    (b.diff ?? 0) - (a.diff ?? 0) ||
    b.gf - a.gf ||
    a.teamName.localeCompare(b.teamName),
  );

  await persistH2HDerived(competition.id, standings);

  return {
    summary: {
      matchesEvaluated: recomputed.length,
      matchesUpdated: updates.length,
      standings,
    },
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const competitionId = Number(params?.id);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const userId = getUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const competition = await loadCompetitionBasics(competitionId);
    if (!competition) {
      return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });
    }

    const ownerId = competition.league?.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      competition: {
        id: competition.id,
        name: competition.name,
        leagueId: competition.leagueId,
      },
      rounds: competition.rounds ?? [],
    });
  } catch (error: any) {
    console.error("GET admin competition recompute error", error);
    return NextResponse.json(
      { error: error?.message ?? "errore" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const competitionId = Number(params?.id);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const userId = getUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PostBody;
    const mode = body?.mode;
    if (mode !== "f1" && mode !== "h2h" && mode !== "all") {
      return NextResponse.json({ error: "mode non valido" }, { status: 400 });
    }

    const competition = await loadCompetitionWithLineups(competitionId);
    if (!competition) {
      return NextResponse.json({ error: "Competizione non trovata" }, { status: 404 });
    }

    const ownerId = competition.league?.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const runF1 = mode === "f1" || mode === "all";
    const runH2H = mode === "h2h" || mode === "all";

    const results: {
      f1?: Awaited<ReturnType<typeof recomputeF1>>;
      h2h?: Awaited<ReturnType<typeof recomputeH2H>>;
    } = {};

    if (runF1) {
      results.f1 = await recomputeF1(competition);
    }
    if (runH2H) {
      results.h2h = await recomputeH2H(competition);
    }

    return NextResponse.json({
      ok: true,
      competitionId,
      mode,
      f1: results.f1?.summary ?? null,
      h2h: results.h2h?.summary ?? null,
    });
  } catch (error: any) {
    console.error("POST admin competition recompute error", error);
    return NextResponse.json(
      { error: error?.message ?? "errore" },
      { status: 500 },
    );
  }
}
