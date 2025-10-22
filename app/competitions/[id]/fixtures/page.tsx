"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Match = {
  roundId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  result: string | null;
};

type RoundFixtures = {
  id: number;
  name: string | null;
  matches: Match[];
};

export default function CompetitionFixturesPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);

  const [rounds, setRounds] = useState<RoundFixtures[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadFixtures() {
      if (!competitionId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/competitions/${competitionId}/fixtures`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Errore");
          setRounds([]);
          setSelectedRoundId(null);
        } else {
          const nextRounds = Array.isArray(data?.rounds) ? (data.rounds as RoundFixtures[]) : [];
          setRounds(nextRounds);
          setSelectedRoundId(nextRounds.length > 0 ? nextRounds[0].id : null);
        }
      } catch (err) {
        console.error("fixtures fetch error", err);
        setError("Errore di rete");
        setRounds([]);
        setSelectedRoundId(null);
      } finally {
        setLoading(false);
      }
    }

    loadFixtures();
  }, [competitionId]);

  const selectedRound = selectedRoundId ? rounds.find((r) => r.id === selectedRoundId) : undefined;

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 16px" }}>
      <h1>📅 Fixtures competizione {competitionId}</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Caricamento…</p>}

      {rounds.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Seleziona round:
            <select
              value={selectedRoundId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedRoundId(value ? Number(value) : null);
              }}
              style={{ marginLeft: 12, padding: "4px 8px" }}
            >
              {rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name ?? `Round ${round.id}`}
                </option>
              ))}
            </select>
          </label>

          {selectedRound ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: "12px 0" }}>{selectedRound.name ?? `Round ${selectedRound.id}`}</h2>
                <Link className="btn" href={`/rounds/${selectedRound.id}/fixtures`}>
                  Vai al round
                </Link>
              </div>
              <FixturesTable matches={selectedRound.matches} />
            </div>
          ) : (
            <p>Nessun round selezionato.</p>
          )}
        </section>
      ) : (
        !loading && <p>Nessun round disponibile.</p>
      )}
    </main>
  );
}

type FixturesTableProps = {
  matches: Match[];
};

function FixturesTable({ matches }: FixturesTableProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "8px 4px" }}>Casa</th>
          <th style={{ textAlign: "left", padding: "8px 4px" }}>Trasferta</th>
          <th style={{ textAlign: "center", padding: "8px 4px" }}>Punteggio</th>
          <th style={{ textAlign: "center", padding: "8px 4px" }}>Esito</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match, index) => (
          <tr key={`${match.homeTeamName}-${match.awayTeamName}-${index}`} style={{ borderTop: "1px solid #ddd" }}>
            <td style={{ padding: "6px 4px" }}>{match.homeTeamName}</td>
            <td style={{ padding: "6px 4px" }}>{match.awayTeamName}</td>
            <td style={{ textAlign: "center", padding: "6px 4px" }}>
              {match.homeScore != null && match.awayScore != null
                ? `${match.homeScore} - ${match.awayScore}`
                : "-"}
            </td>
            <td style={{ textAlign: "center", padding: "6px 4px" }}>{match.result ?? "-"}</td>
          </tr>
        ))}
        {matches.length === 0 && (
          <tr>
            <td colSpan={4} style={{ padding: "12px 4px", textAlign: "center", color: "#666" }}>
              Nessun match programmato.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
