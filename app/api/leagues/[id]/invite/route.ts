import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const leagueId = Number(params.id);
  const uid = authUserId(req.headers.get("authorization"));
  if (!leagueId || !uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.ownerId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = crypto.randomBytes(9).toString("base64url");
  const updated = await prisma.league.update({
    where: { id: leagueId },
    data: { inviteCode: code } as any,
    select: { id: true, inviteCode: true } as any,
  });
  return NextResponse.json({ ok: true, ...updated });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const leagueId = Number(params.id);
  const uid = authUserId(req.headers.get("authorization"));
  if (!leagueId || !uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = (await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, ownerId: true, inviteCode: true } as any,
  })) as any;
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.ownerId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, id: league.id, inviteCode: league.inviteCode ?? null });
}
