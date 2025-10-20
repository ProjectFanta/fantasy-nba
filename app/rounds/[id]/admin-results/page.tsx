"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Row = {
  player: string;
  original: string | null;
  teams: string[];
  points: number | null;
};

type ApiRow = {
  player?: unknown;
  original?: unknown;
  teams?: unknown;
  points?: unknown;
};

export default function AdminResultsPage() {
  const params = useParams<{ id: string }>();
  const roundId = useMemo(() => Number(params?.id), [params]);

  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const load = useCallback(async () => {
    setMsg("");
    if (!roundId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setMsg("Non sei loggato.");
      setRows([]);
      return;
    }

    try {
      const res = await fetch(`/api/admin/results/round-players?roundId=${roundId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "Errore caricamento");
        setRows([]);
        return;
      }

      const players: ApiRow[] = Array.isArray(data?.players) ? data.players : [];
      const sanitized: Row[] = players.map((item) => {
        const normalizedPlayer = typeof item.player === "string" ? item.player : "";
        const rawOriginal =
          typeof item.original === "string" && item.original.trim()
            ? item.original.trim()
            : null;
        const teams = Array.isArray(item.teams) ? item.teams.map((team) => `${team}`) : [];
        const rawPoints =
          typeof item.points === "number"
            ? item.points
            : item.points == null
            ? null
            : Number(item.points);
        const points = rawPoints == null || Number.isNaN(rawPoints) ? null : rawPoints;

        return {
          player: normalizedPlayer,
          original: rawOriginal ?? (normalizedPlayer || null),
          teams,
          points,
        };
      });

      setRows(sanitized);
    } catch (error: any) {
      setMsg(error?.message ?? "Errore caricamento");
      setRows([]);
    }
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  function setPoint(index: number, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      if (value.trim() === "") {
        next[index] = { ...current, points: null };
        return next;
      }
      const normalizedValue = value.replace(",", ".");
      const parsed = Number(normalizedValue);
      next[index] = {
        ...current,
        points: Number.isNaN(parsed) ? null : parsed,
      };
      return next;
    });
  }

  function fillZerosWhereEmpty() {
    setRows((prev) => prev.map((row) => ({ ...row, points: row.points == null ? 0 : row.points })));
  }

  async function saveAll() {
    setMsg("");
    if (!roundId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setMsg("Non sei loggato.");
      return;
    }

    const items = rows
      .filter((row) => row.points != null)
      .map((row) => ({ player: row.player, points: row.points as number }));

    if (items.length === 0) {
      setMsg("Niente da salvare");
      return;
    }

    const res = await fetch(`/api/admin/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roundId, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "Errore salvataggio");
      return;
    }

    await load();
    setMsg(`Salvati ${data.count} risultati`);
  }

  const filtered = useMemo(() => {
    const query = filter.toLowerCase().trim();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (!query) return true;
        const matchesPlayer =
          row.player.includes(query) || (row.original ?? "").toLowerCase().includes(query);
        const matchesTeam = row.teams.some((team) => team.toLowerCase().includes(query));
        return matchesPlayer || matchesTeam;
      });
  }, [rows, filter]);

  return (
    <main style={{ margin: "1rem 0" }}>
      <h1>Admin risultati – Round {roundId}</h1>
      {msg && (
        <p style={{ color: msg.startsWith("Salvati") ? "green" : "red" }}>{msg}</p>
      )}

      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <input
          placeholder="Cerca giocatore o squadra…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={fillZerosWhereEmpty}>Imposta 0 dove vuoto</button>
        <button onClick={saveAll}>Salva tutti</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Giocatore</th>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Squadre che lo hanno</th>
            <th style={{ width: 140, padding: "8px 4px" }}>Punti</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ row, index }) => (
            <tr key={row.player}>
              <td style={{ borderTop: "1px solid #ddd", padding: "6px 4px" }}>{row.original ?? row.player}</td>
              <td style={{ borderTop: "1px solid #ddd", padding: "6px 4px" }}>
                {row.teams.length > 0 ? row.teams.join(", ") : "-"}
              </td>
              <td style={{ borderTop: "1px solid #ddd", padding: "6px 4px" }}>
                <input
                  type="number"
                  step="0.1"
                  value={row.points ?? ""}
                  onChange={(event) => setPoint(index, event.target.value)}
                  style={{ width: 120, padding: 6 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
