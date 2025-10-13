"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Row = {
  teamId: number;
  name: string;
  Pts: number;
  GP: number;
  GF: number;
  GS: number;
  DR: number;
};

export default function H2HStandingsPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStandings() {
      if (!competitionId) return;
      setError(null);
      try {
        const res = await fetch(`/api/competitions/${competitionId}/standings/h2h`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Errore");
          setRows([]);
        } else {
          setRows(Array.isArray(data?.standings) ? data.standings : []);
        }
      } catch (err) {
        console.error("standings fetch error", err);
        setError("Errore di rete");
      }
    }

    loadStandings();
  }, [competitionId]);

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: 16 }}>
      <h1>Classifica H2H – Competizione {competitionId}</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Pos</th>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Squadra</th>
            <th style={{ padding: "8px 4px" }}>Pts</th>
            <th style={{ padding: "8px 4px" }}>GP</th>
            <th style={{ padding: "8px 4px" }}>GF</th>
            <th style={{ padding: "8px 4px" }}>GS</th>
            <th style={{ padding: "8px 4px" }}>DR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.teamId} style={{ borderTop: "1px solid #ddd" }}>
              <td style={{ padding: "6px 4px" }}>{index + 1}</td>
              <td style={{ padding: "6px 4px" }}>{row.name}</td>
              <td style={{ textAlign: "center", padding: "6px 4px" }}>{row.Pts}</td>
              <td style={{ textAlign: "center", padding: "6px 4px" }}>{row.GP}</td>
              <td style={{ textAlign: "center", padding: "6px 4px" }}>{row.GF}</td>
              <td style={{ textAlign: "center", padding: "6px 4px" }}>{row.GS}</td>
              <td style={{ textAlign: "center", padding: "6px 4px" }}>{row.DR}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: "12px 4px", textAlign: "center", color: "#666" }}>
                Nessun dato disponibile.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
