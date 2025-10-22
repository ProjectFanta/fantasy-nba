import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  roundId?: number;
  lockAt?: string | null;
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

export async function POST(req: Request) {
  try {
    const userId = getUserId(req.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const roundId = Number(body?.roundId);
    if (!roundId) {
      return NextResponse.json({ error: "roundId mancante" }, { status: 400 });
    }

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: {
        competition: {
          include: {
            league: true
          }
        }
      }
    });

    if (!round) {
      return NextResponse.json({ error: "Round non trovato" }, { status: 404 });
    }

    const ownerId = round.competition.league.ownerId ?? null;
    if (!ownerId || ownerId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawLock = body?.lockAt;
    let lockAt: Date | null | undefined = undefined;
    if (typeof rawLock === "string") {
      if (rawLock.trim().length === 0) {
        lockAt = null;
      } else {
        const parsed = new Date(rawLock);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "lockAt non valido" }, { status: 400 });
        }
        lockAt = parsed;
      }
    } else if (rawLock === null) {
      lockAt = null;
    } else if (typeof rawLock !== "undefined") {
      return NextResponse.json({ error: "lockAt non valido" }, { status: 400 });
    }

    const dataUpdate: Prisma.RoundUpdateInput = {};
    if (typeof lockAt !== "undefined") {
      dataUpdate.lockAt = lockAt;
    }

    const updated = await prisma.round.update({
      where: { id: roundId },
      data: dataUpdate,
      select: {
        id: true,
        name: true,
        dayIndex: true,
        startDate: true,
        endDate: true,
        lockAt: true
      }
    });

    return NextResponse.json({ ok: true, round: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "errore" }, { status: 500 });
  }
}
