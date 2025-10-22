import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

import {
  Mode,
  loadCompetitionBasics,
  loadCompetitionWithLineups,
  recomputeF1,
  recomputeH2H,
} from "@/lib/admin/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PostBody = { mode?: Mode };

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
