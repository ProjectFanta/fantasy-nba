"use client";

import { useEffect, useMemo, useState } from "react";

export default function RoundAdminResultsPage({ params }: { params: { id: string } }) {
  const roundId = useMemo(() => Number(params.id), [params.id]);
  const [textareaValue, setTextareaValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [results, setResults] = useState<{ player: string; points: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!Number.isNaN(roundId)) {
      loadResults(roundId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function loadResults(id: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/results?roundId=${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Errore nel caricamento dei risultati");
        setResults([]);
      } else {
        setResults(Array.isArray(data?.results) ? data.results : []);
      }
    } catch {
      setError("Errore di rete durante il caricamento dei risultati");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (Number.isNaN(roundId)) {
      setError("roundId non valido");
      return;
    }

    const lines = textareaValue
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setError("Inserisci almeno una riga nel formato 'Nome, punti'");
      return;
    }

    const items = lines
      .map((line) => {
        const [playerRaw, pointsRaw] = line.split(",");
        const player = playerRaw?.trim() ?? "";
        const points = Number(pointsRaw?.trim());
        if (!player || Number.isNaN(points)) {
          return null;
        }
        return { player, points };
      })
      .filter((item): item is { player: string; points: number } => item !== null);

    if (items.length === 0) {
      setError("Nessuna riga valida trovata. Usa il formato 'Nome, punti'");
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ roundId, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Errore durante il salvataggio");
        return;
      }
      setSuccess(`Risultati salvati (${data?.count ?? items.length} elementi)`);
      setTextareaValue("");
      loadResults(roundId);
    } catch {
      setError("Errore di rete durante il salvataggio");
    } finally {
      setIsSaving(false);
    }
  }

  if (Number.isNaN(roundId)) {
    return <main style={{ padding: 24 }}>ID giornata non valido.</main>;
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 800,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        gap: 24,
      }}
    >
      <header>
        <h1>Gestione risultati giornata #{roundId}</h1>
        <p>Inserisci un giocatore per riga nel formato: Nome, punti</p>
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        <textarea
          value={textareaValue}
          onChange={(event) => setTextareaValue(event.target.value)}
          rows={10}
          placeholder="Esempio: \nGiocatore Uno, 45\nGiocatore Due, 38"
          style={{ fontFamily: "monospace", padding: 12, minHeight: 200 }}
        />
        <div>
          <button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvataggio..." : "Salva risultati"}
          </button>
        </div>
        {error && <p style={{ color: "#d00" }}>{error}</p>}
        {success && <p style={{ color: "#0a0" }}>{success}</p>}
      </section>

      <section>
        <h2>Risultati salvati</h2>
        {loading ? (
          <p>Caricamento...</p>
        ) : results.length === 0 ? (
          <p>Nessun risultato presente.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                  Giocatore
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ccc", padding: "4px 8px" }}>
                  Punti
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => (
                <tr key={`${item.player}-${item.points}`}>
                  <td style={{ padding: "4px 8px" }}>{item.player}</td>
                  <td style={{ padding: "4px 8px", textAlign: "right" }}>{item.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
