"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type RoundOption = { id: number; name?: string | null; dayIndex?: number | null };
type OverviewResponse = {
  ok?: boolean;
  competition?: { id: number; name?: string | null } | null;
  rounds?: RoundOption[];
  error?: string;
};

type Mode = "f1" | "h2h" | "all";

type RecomputeSummary = {
  roundsProcessed?: number;
  teamsEvaluated?: number;
  matchesEvaluated?: number;
  matchesUpdated?: number;
};

type RecomputeResponse = {
  ok?: boolean;
  mode?: Mode;
  f1?: RecomputeSummary | null;
  h2h?: RecomputeSummary | null;
  error?: string;
};

type ResetResponse = {
  ok?: boolean;
  competitionId?: number;
  roundId?: number;
  deletedPlayerResults?: number;
  matchesReset?: number;
  error?: string;
};

type LogEntry = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
  timestamp: string;
};

type Status = { type: LogEntry["type"]; text: string } | null;

export default function CompetitionAdminPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);

  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [allowed, setAllowed] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<Mode | "reset" | null>(null);

  const logCounter = useRef(0);

  const appendLog = useCallback((type: LogEntry["type"], message: string) => {
    logCounter.current += 1;
    const entry: LogEntry = {
      id: logCounter.current,
      type,
      message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogEntries((prev) => [entry, ...prev].slice(0, 50));
    setStatus({ type, text: message });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setToken(null);
      return;
    }
    const stored = window.localStorage.getItem("token");
    setToken(stored);
  }, []);

  useEffect(() => {
    if (!competitionId) return;
    if (token === undefined) return;

    if (!token) {
      setAllowed(false);
      setRounds([]);
      setSelectedRound(null);
      setCompetitionName(null);
      setStatus({ type: "error", text: "Devi effettuare il login per accedere all'area admin." });
      setInitializing(false);
      return;
    }

    let cancelled = false;
    async function loadOverview() {
      setInitializing(true);
      try {
        const res = await fetch(`/api/admin/competitions/${competitionId}/recompute`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as OverviewResponse;
        if (!res.ok) {
          const message = data?.error ?? "Impossibile caricare i dati admin.";
          if (!cancelled) {
            setAllowed(false);
            setRounds([]);
            setSelectedRound(null);
            setCompetitionName(null);
            setStatus({ type: "error", text: message });
          }
          return;
        }
        if (!cancelled) {
          setAllowed(true);
          setCompetitionName(data?.competition?.name ?? null);
          const roundList = Array.isArray(data?.rounds) ? data.rounds : [];
          setRounds(roundList);
          setSelectedRound(roundList.length > 0 ? Number(roundList[0].id) : null);
          setStatus({ type: "success", text: "Accesso amministratore verificato." });
        }
      } catch (error: any) {
        if (!cancelled) {
          setAllowed(false);
          setStatus({
            type: "error",
            text: error?.message ? `Errore di rete: ${error.message}` : "Errore di rete durante il caricamento.",
          });
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [competitionId, token]);

  const handleRecompute = useCallback(
    async (mode: Mode) => {
      if (!competitionId) return;
      if (!token) {
        appendLog("error", "Non sei loggato.");
        return;
      }
      setBusy(mode);
      setStatus({ type: "info", text: "Elaborazione in corso…" });
      try {
        const res = await fetch(`/api/admin/competitions/${competitionId}/recompute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode }),
        });
        const data = (await res.json()) as RecomputeResponse;
        if (!res.ok) {
          appendLog("error", data?.error ?? "Errore durante il ricalcolo.");
          return;
        }
        const parts: string[] = [];
        if (data.f1) {
          const roundsProcessed = data.f1.roundsProcessed ?? 0;
          const teams = data.f1.teamsEvaluated ?? 0;
          parts.push(`F1: ${roundsProcessed} round elaborati, ${teams} squadre`);
        }
        if (data.h2h) {
          const matches = data.h2h.matchesEvaluated ?? 0;
          const updated = data.h2h.matchesUpdated ?? 0;
          parts.push(`H2H: ${matches} partite valutate (${updated} aggiornate)`);
        }
        const summary = parts.length > 0 ? parts.join(" – ") : "Operazione completata";
        appendLog("success", `Ricalcolo completato (${summary}).`);
      } catch (error: any) {
        appendLog(
          "error",
          error?.message ? `Errore di rete: ${error.message}` : "Errore di rete durante il ricalcolo.",
        );
      } finally {
        setBusy(null);
      }
    },
    [appendLog, competitionId, token],
  );

  const handleResetRound = useCallback(async () => {
    if (!competitionId) return;
    if (!token) {
      appendLog("error", "Non sei loggato.");
      return;
    }
    if (!selectedRound) {
      appendLog("error", "Seleziona un round da resettare.");
      return;
    }
    setBusy("reset");
    setStatus({ type: "info", text: "Reset del round in corso…" });
    try {
      const res = await fetch(`/api/admin/rounds/${selectedRound}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as ResetResponse;
      if (!res.ok) {
        appendLog("error", data?.error ?? "Errore durante il reset del round.");
        return;
      }
      const deleted = data.deletedPlayerResults ?? 0;
      const resetMatches = data.matchesReset ?? 0;
      appendLog(
        "success",
        `Round ${selectedRound} resettato: ${deleted} risultati eliminati, ${resetMatches} partite azzerate.`,
      );
    } catch (error: any) {
      appendLog(
        "error",
        error?.message ? `Errore di rete: ${error.message}` : "Errore di rete durante il reset del round.",
      );
    } finally {
      setBusy(null);
    }
  }, [appendLog, competitionId, selectedRound, token]);

  const renderRoundsSelect = () => {
    if (rounds.length === 0) {
      return <p>Nessun round disponibile per questa competizione.</p>;
    }
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>Round da resettare</span>
        <select
          value={selectedRound ?? ""}
          onChange={(event) => {
            const value = Number(event.target.value);
            setSelectedRound(Number.isNaN(value) ? null : value);
          }}
          disabled={busy !== null}
          style={{ padding: 8, maxWidth: 320 }}
        >
          {rounds.map((round) => {
            const labelParts: string[] = [];
            if (round.dayIndex != null) {
              labelParts.push(`Giornata ${round.dayIndex}`);
            } else {
              labelParts.push(`Round ${round.id}`);
            }
            if (round.name) {
              labelParts.push(round.name);
            }
            return (
              <option key={round.id} value={round.id}>
                {labelParts.join(" – ")}
              </option>
            );
          })}
        </select>
      </label>
    );
  };

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 16px" }}>
      <h1>
        Admin competizione {competitionId}
        {competitionName ? ` – ${competitionName}` : ""}
      </h1>
      {status && (
        <p
          style={{
            color:
              status.type === "error"
                ? "#c62828"
                : status.type === "success"
                ? "#2e7d32"
                : "#555",
            marginBottom: 16,
          }}
        >
          {status.text}
        </p>
      )}

      {initializing ? (
        <p>Caricamento dati in corso…</p>
      ) : !allowed ? (
        <p>
          Non hai i permessi per accedere al pannello amministrativo di questa competizione.
        </p>
      ) : (
        <>
          {competitionId ? (
            <div style={{ marginBottom: 16 }}>
              <Link
                href={`/competitions/${competitionId}/admin/import`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  textDecoration: "none",
                  background: "#1976d2",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                <span aria-hidden="true">📥</span>
                <span>Import risultati</span>
              </Link>
            </div>
          ) : null}
          <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2>Ricalcolo classifiche</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button onClick={() => handleRecompute("f1")} disabled={busy !== null}>
                {busy === "f1" ? "Ricalcolo F1…" : "Ricalcola F1"}
              </button>
              <button onClick={() => handleRecompute("h2h")} disabled={busy !== null}>
                {busy === "h2h" ? "Ricalcolo H2H…" : "Ricalcola H2H"}
              </button>
              <button onClick={() => handleRecompute("all")} disabled={busy !== null}>
                {busy === "all" ? "Ricalcolo completo…" : "Ricalcola Tutto"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2>Reset risultati round</h2>
            {renderRoundsSelect()}
            <button onClick={handleResetRound} disabled={busy !== null} style={{ maxWidth: 220 }}>
              {busy === "reset" ? "Reset in corso…" : "Reset risultati round"}
            </button>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 16, background: "#fafafa" }}>
            <h3 style={{ marginTop: 0 }}>Log operazioni</h3>
            {logEntries.length === 0 ? (
              <p style={{ color: "#666" }}>Nessuna operazione eseguita al momento.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {logEntries.map((entry) => (
                  <li key={entry.id} style={{ fontFamily: "monospace" }}>
                    <span style={{ color: "#999", marginRight: 8 }}>[{entry.timestamp}]</span>
                    <span
                      style={{
                        color:
                          entry.type === "error"
                            ? "#c62828"
                            : entry.type === "success"
                            ? "#2e7d32"
                            : "#333",
                      }}
                    >
                      {entry.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </section>
        </>
      )}
    </main>
  );
}
