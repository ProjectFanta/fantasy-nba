import prisma from "../../../../lib/prisma";
import TeamLineupsClient from "./team-lineups-client";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function TeamLineupsPage({ params }: PageProps) {
  const teamId = Number(params.id);

  if (Number.isNaN(teamId)) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto" }}>
        <h1>Formazione</h1>
        <p>Identificativo squadra non valido.</p>
      </main>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      userId: true,
      competitionId: true,
      competition: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!team || !team.competition) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto" }}>
        <h1>Formazione</h1>
        <p>Squadra non trovata.</p>
      </main>
    );
  }

  return (
    <TeamLineupsClient
      teamId={team.id}
      teamName={team.name}
      competitionId={team.competition.id}
      competitionName={team.competition.name}
      ownerUserId={team.userId ?? null}
    />
  );
}
