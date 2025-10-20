"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type PlayerRow = {
  key: string;
  displayName: string;
  input: string;
};

type SavedResult = {
  player: string;
  points: number;
};

export default function AdminResultsPage() {
  const params = useParams<{ id: string }>();
  const roundId = useMemo(() => Number(params?.id), [params]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
  const savedResultsRef = useRef<SavedResult[]>([]);
  const [csvText, setCsvText] = useState("");
  const [msg, setMsg] = useState<string>("");

  const applyResultsToPlayers = useCallback((results: SavedResult[]) => {
    const map = new Map(results.map((r) => [r.player, r.points]));
    setPlayers((prev) =>
      prev.map((row) => {
        if (map.has(row.key)) {
          const value = map.get(row.key);
          return { ...row, input: value !== undefined ? String(value) : row.input };
        }
        return row;
      })
    );
  }, []);

  const updateSavedResults = useCallback(
    (results: SavedResult[]) => {
      savedResultsRef.current = results;
      setSavedResults(results);
      applyResultsToPlayers(results);
    },
    [applyResultsToPlayers]
  );

  const loadResults = useCallback(async () => {
    if (!roundId) return;
    try {
      const res = await fetch(`/api/admin/results?roundId=${roundId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "Errore nel caricamento dei risultati");
        updateSavedResults([]);
        return;
      }
      const parsed: SavedResult[] = Array.isArray(data?.results)
        ? data.results
            .map((item: any) => {
              const player = typeof item?.player === "string" ? item.player.trim().toLowerCase() : "";
              const points = Number(item?.points);
              if (!player || Number.isNaN(points)) return null;
              return { player, points };
            })
            .filter(Boolean) as SavedResult[]
        : [];
      updateSavedResults(parsed);
    } catch (error: any) {
      setMsg(error?.message ?? "Errore nel caricamento dei risultati");
    }
  }, [roundId, updateSavedResults]);

  const loadPlayers = useCallback(async () => {
    if (!roundId) return;
    try {
      const res = await fetch(`/api/rounds/${roundId}/players`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "Errore nel caricamento dei giocatori");
        setPlayers([]);
        return;
      }
      const incoming = Array.isArray(data?.players) ? data.players : [];
      setPlayers((prev) => {
        const prevMap = new Map(prev.map((row) => [row.key, row]));
        const resultsMap = new Map(savedResultsRef.current.map((r) => [r.player, r.points]));
        const rows: PlayerRow[] = [];
        const seen = new Set<string>();
        for (const raw of incoming) {
          if (typeof raw !== "string") continue;
          const displayName = raw.trim();
          if (!displayName) continue;
          const key = displayName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const previous = prevMap.get(key);
          const savedPoints = resultsMap.get(key);
          const input = savedPoints !== undefined ? String(savedPoints) : previous?.input ?? "";
          rows.push({
            key,
            displayName: displayName || previous?.displayName || key,
            input
          });
        }
        return rows;
      });
    } catch (error: any) {
      setMsg(error?.message ?? "Errore nel caricamento dei giocatori");
      setPlayers([]);
    }
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    (async () => {
      await loadPlayers();
      await loadResults();
    })();
  }, [roundId, loadPlayers, loadResults]);

  function handleInputChange(key: string, value: string) {
    setPlayers((prev) =>
      prev.map((row) => (row.key === key ? { ...row, input: value } : row))
    );
  }

  function applyCsv() {
    setMsg("");
    const lines = csvText.split("\n");
    const updates = new Map<string, string>();
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const parts = raw.split(",");
      if (parts.length < 2) continue;
      const name = parts[0]?.trim();
      const pointsPart = parts.slice(1).join(",").trim();
      if (!name || !pointsPart) continue;
      const key = name.toLowerCase();
      const numeric = Number(pointsPart.replace(/,/g, "."));
      if (Number.isNaN(numeric)) continue;
      updates.set(key, String(numeric));
    }
    if (updates.size === 0) {
      setMsg("Nessuna riga valida trovata nel CSV");
      return;
    }
    let updatedCount = 0;
    setPlayers((prev) =>
      prev.map((row) => {
        if (updates.has(row.key)) {
          updatedCount++;
          return { ...row, input: updates.get(row.key)! };
        }
        return row;
      })
    );
    setMsg(updatedCount > 0 ? `Aggiornati ${updatedCount} giocatori dal CSV` : "Nessuna corrispondenza trovata nel CSV");
  }

  async function onSave() {
    setMsg("");
    if (!roundId) {
      setMsg("Round non valido.");
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setMsg("Non sei loggato.");
      return;
    }

    const items: { player: string; points: number }[] = [];
    const invalid: string[] = [];

    for (const row of players) {
      const value = row.input.trim();
      if (!value) continue;
      const points = Number(value);
      if (Number.isNaN(points)) {
        invalid.push(row.displayName);
        continue;
      }
      items.push({ player: row.key, points });
    }

    if (invalid.length > 0) {
      setMsg(`Valori non validi per: ${invalid.join(", ")}`);
      return;
    }

    if (items.length === 0) {
      setMsg("Inserisci almeno un punteggio");
      return;
    }

    try {
      const res = await fetch(`/api/admin/results`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roundId, items })
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "Errore salvataggio");
      } else {
        setMsg(`Salvati ${data.count} risultati`);
        await loadResults();
      }
    } catch (error: any) {
      setMsg(error?.message ?? "Errore salvataggio");
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: 16 }}>
      <h1>Admin risultati – Round {roundId}</h1>
      <section style={{ marginTop: 16 }}>
        <h2>Giocatori del round</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px 4px" }}>Nome</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "8px 4px" }}>Punti</th>
            </tr>
          </thead>
          <tbody>
            {players.map((row) => (
              <tr key={row.key}>
                <td style={{ borderBottom: "1px solid #eee", padding: "6px 4px" }}>{row.displayName}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: "6px 4px" }}>
                  <input
                    type="number"
                    value={row.input}
                    onChange={(e) => handleInputChange(row.key, e.target.value)}
                    step="0.1"
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr>
                <td colSpan={2} style={{ padding: 12, textAlign: "center", color: "#666" }}>
                  Nessun giocatore trovato per questo round.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Incolla CSV (Nome, punti)</h2>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          style={{ width: "100%", fontFamily: "monospace", marginTop: 8 }}
          placeholder={"LeBron James, 42\nNikola Jokic, 55\nStephen Curry, 37.5"}
        />
        <button onClick={applyCsv} style={{ marginTop: 8 }}>
          Applica CSV ai campi
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <button onClick={onSave}>Salva risultati</button>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Risultati salvati</h2>
        <ul>
          {savedResults.map((r, i) => {
            const displayName = players.find((row) => row.key === r.player)?.displayName ?? r.player;
            return (
              <li key={`${r.player}-${i}`}>
                {displayName} — {r.points}
              </li>
            );
          })}
          {savedResults.length === 0 && <li>Nessun risultato salvato.</li>}
        </ul>
      </section>
    </main>
  );
}
