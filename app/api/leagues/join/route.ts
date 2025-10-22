import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function authUserId(auth?: string | null): number | null {
  if (!auth) return null;
  const [sch, tok] = auth.split(" ");
  if (sch?.toLowerCase() !== "bearer" || !tok) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const p = jwt.verify(tok, secret) as any;
    return typeof p?.userId === "number" ? p.userId : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const uid = authUserId(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { code } = await req.json().catch(() => ({}));
  if (!code) {
    return NextResponse.json({ error: "Codice mancante" }, { status: 400 });
  }

  const league = await prisma.league.findFirst({ where: { inviteCode: code } as any });
  if (!league) {
    return NextResponse.json({ error: "Codice non valido" }, { status: 400 });
  }

  const already = await prisma.leagueMember.findFirst({
    where: { leagueId: league.id, userId: uid },
  });
  if (already) {
    return NextResponse.json({ ok: true, leagueId: league.id, already: true });
  }

  await prisma.leagueMember.create({
    data: { leagueId: league.id, userId: uid },
  });

  return NextResponse.json({ ok: true, leagueId: league.id });
}
