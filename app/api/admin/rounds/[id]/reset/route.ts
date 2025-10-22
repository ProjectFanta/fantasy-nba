import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function tableExists(tableName: string): Promise<boolean> {
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
    return Boolean(row?.exists);
  } catch (error) {
    console.warn(`[admin/reset] impossibile verificare tabella ${tableName}:`, error);
    return false;
  }
}

async function clearDerivedData(competitionId: number, roundId: number) {
  if (await tableExists("F1RoundScore")) {
    const table = Prisma.raw('"F1RoundScore"');
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId} AND "roundId" = ${roundId}`,
    );
  }

  if (await tableExists("F1Standing")) {
    const table = Prisma.raw('"F1Standing"');
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId}`,
    );
  }

  if (await tableExists("H2HStanding")) {
    const table = Prisma.raw('"H2HStanding"');
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM ${table} WHERE "competitionId" = ${competitionId}`,
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const roundId = Number(params?.id);
    if (!roundId) {
      return NextResponse.json({ error: "roundId mancante" }, { status: 400 });
    }

    const userId = getUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        competition: {
          include: {
            league: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: "Round non trovato" }, { status: 404 });
    }

    const ownerId = round.competition.league?.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [deletedResults, resetMatches] = await prisma.$transaction([
      prisma.playerResult.deleteMany({ where: { roundId } }),
      prisma.match.updateMany({
        where: { roundId, competitionId: round.competitionId },
        data: { homeScore: 0, awayScore: 0, result: null },
      }),
    ]);

    await clearDerivedData(round.competitionId, roundId);

    return NextResponse.json({
      ok: true,
      roundId,
      competitionId: round.competitionId,
      deletedPlayerResults: deletedResults.count,
      matchesReset: resetMatches.count,
    });
  } catch (error: any) {
    console.error("POST admin round reset error", error);
    return NextResponse.json(
      { error: error?.message ?? "errore" },
      { status: 500 },
    );
  }
}
