"use client";

import { useEffect, useMemo, useState } from "react";

type StandingsRow = {
  teamId: number;
  teamName: string;
  f1Points: number;
  roundsPlayed: number;
  totalRoundScore: number;
};

export default function CompetitionF1StandingsPage({ params }: { params: { id: string } }) {
  const competitionId = useMemo(() => Number(params.id), [params.id]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isNaN(competitionId)) {
      fetchStandings(competitionId);
    } else {
      setError("competitionId non valido");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  async function fetchStandings(id: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/competitions/${id}/standings/f1`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Errore nel caricamento della classifica");
        setStandings([]);
      } else {
        setStandings(Array.isArray(data?.standings) ? data.standings : []);
      }
    } catch {
      setError("Errore di rete");
      setStandings([]);
    } finally {
      setLoading(false);
    }
  }

  if (Number.isNaN(competitionId)) {
    return <main style={{ padding: 24 }}>ID competizione non valido.</main>;
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        gap: 24,
      }}
    >
      <header>
        <h1>Classifica F1</h1>
        <p>Panoramica dei punteggi F1, giornate giocate e somma punti ottenuti per round.</p>
      </header>

      {error && <p style={{ color: "#d00" }}>{error}</p>}
      {loading ? (
        <p>Caricamento...</p>
      ) : standings.length === 0 ? (
        <p>Nessun dato di classifica disponibile.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>Pos</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                Squadra
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                Punti F1
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                Giornate
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                Somma round
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => (
              <tr key={row.teamId}>
                <td style={{ padding: "4px 8px" }}>{index + 1}</td>
                <td style={{ padding: "4px 8px" }}>{row.teamName}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.f1Points}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.roundsPlayed}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{row.totalRoundScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
