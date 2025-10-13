import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const competitionId = Number(params?.id);
    if (!competitionId) {
      return NextResponse.json({ error: "competitionId mancante" }, { status: 400 });
    }

    const teams = await prisma.team.findMany({
      where: { competitionId },
      select: { id: true, name: true },
    });

    if (teams.length === 0) {
      return NextResponse.json({ standings: [] });
    }

    const matches = await prisma.match.findMany({
      where: { competitionId },
    });

    const table = new Map<
      number,
      { teamId: number; name: string; Pts: number; GP: number; GF: number; GS: number; DR: number }
    >();

    for (const team of teams) {
      table.set(team.id, {
        teamId: team.id,
        name: team.name,
        Pts: 0,
        GP: 0,
        GF: 0,
        GS: 0,
        DR: 0,
      });
    }

    for (const match of matches) {
      const home = table.get(match.homeTeamId);
      const away = table.get(match.awayTeamId);
      if (!home || !away) continue;

      home.GP += 1;
      away.GP += 1;
      home.GF += Number(match.homeScore ?? 0);
      home.GS += Number(match.awayScore ?? 0);
      away.GF += Number(match.awayScore ?? 0);
      away.GS += Number(match.homeScore ?? 0);

      if (match.result === "H") {
        home.Pts += 2;
      } else if (match.result === "A") {
        away.Pts += 2;
      } else if (match.result === "D") {
        home.Pts += 1;
        away.Pts += 1;
      }
    }

    for (const entry of table.values()) {
      entry.DR = entry.GF - entry.GS;
    }

    const standings = Array.from(table.values()).sort(
      (a, b) => b.Pts - a.Pts || b.DR - a.DR || b.GF - a.GF,
    );

    return NextResponse.json({ standings });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "errore" }, { status: 500 });
  }
}
