"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Row = { teamId: number; teamName: string; f1Points: number; roundsPlayed: number; totalRoundScore: number };

export default function F1StandingsPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    async function run() {
      setErr("");
      if (!competitionId) return;
      const res = await fetch(`/api/competitions/${competitionId}/standings/f1`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Errore");
      } else {
        setRows(data?.standings ?? []);
      }
    }
    run();
  }, [competitionId]);

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: 16 }}>
      <h1>Classifica Formula-1 – Competizione {competitionId}</h1>
      {err && <p style={{ color: "red" }}>{err}</p>}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Pos</th>
            <th style={{ textAlign: "left" }}>Squadra</th>
            <th>Punti F1</th>
            <th>Giornate</th>
            <th>Somma punteggi round</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId}>
              <td>{i + 1}</td>
              <td>{r.teamName}</td>
              <td style={{ textAlign: "center" }}>{r.f1Points}</td>
              <td style={{ textAlign: "center" }}>{r.roundsPlayed}</td>
              <td style={{ textAlign: "center" }}>{r.totalRoundScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
