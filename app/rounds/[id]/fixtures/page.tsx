"use client";

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

export default function RoundFixturesPage() {
  const params = useParams<{ id: string }>();
  const roundId = useMemo(() => Number(params?.id), [params]);
  const roundLabel = Number.isFinite(roundId) && roundId > 0 ? roundId : params?.id ?? "-";

  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadFixtures() {
      if (!roundId || Number.isNaN(roundId)) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rounds/${roundId}/fixtures`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Errore");
          setMatches([]);
        } else {
          setMatches(Array.isArray(data?.matches) ? (data.matches as Match[]) : []);
        }
      } catch (err) {
        console.error("round fixtures fetch error", err);
        setError("Errore di rete");
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }

    loadFixtures();
  }, [roundId]);

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 16px" }}>
      <h1>📅 Round {roundLabel} – Fixtures</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Caricamento…</p>}
      <FixturesTable matches={matches} />
    </main>
  );
}

type FixturesTableProps = {
  matches: Match[];
};

function FixturesTable({ matches }: FixturesTableProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
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
