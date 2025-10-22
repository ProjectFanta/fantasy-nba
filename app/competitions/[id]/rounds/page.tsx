"use client";

import { useEffect, useState } from "react";

function toDateTimeLocalString(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoStringFromInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

type Round = {
  id?: number;
  name?: string;
  startDate: string;
  endDate: string;
  lockAt?: string;
};

type ExistingRound = {
  id: number;
  name: string;
  dayIndex: number;
  startDate: string;
  endDate: string;
  lockAt: string | null;
};

export default function CompetitionRoundsPage({ params }: { params: { id: string } }) {
  const competitionId = Number(params.id);
  const [existing, setExisting] = useState<ExistingRound[]>([]);
  const [count, setCount] = useState<number>(8);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [lockValues, setLockValues] = useState<Record<number, string>>({});
  const [lockSaving, setLockSaving] = useState<number | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    // carica eventuali giornate già create
    (async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/rounds`);
        const data = await res.json();
        if (res.ok) {
          const rounds: ExistingRound[] = Array.isArray(data?.rounds)
            ? data.rounds.map((r: any) => ({
                id: Number(r.id),
                name: r.name ?? "",
                dayIndex: Number(r.dayIndex),
                startDate: r.startDate,
                endDate: r.endDate,
                lockAt: r.lockAt ?? null
              }))
            : [];
          setExisting(rounds);
          setLockValues(() => {
            const next: Record<number, string> = {};
            rounds.forEach((round) => {
              next[round.id] = toDateTimeLocalString(round.lockAt);
            });
            return next;
          });
          setLockMessage(null);
          setLockError(null);
        }
      } catch {}
    })();
  }, [competitionId]);

  function generateRows() {
    const today = new Date();
    const template: Round[] = Array.from({ length: count }).map((_, i) => {
      const start = new Date(today);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startLocal = toDateTimeLocalString(start);
      const endLocal = toDateTimeLocalString(end);
      return {
        name: `Giornata ${i + 1}`,
        startDate: startLocal,
        endDate: endLocal,
        lockAt: startLocal
      };
    });
    setRounds(template);
  }

  async function submitRounds(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    let payload: { rounds: { name: string; startDate: string; endDate: string; lockAt: string | null }[] };
    try {
      payload = {
        rounds: rounds.map((r, idx) => {
          const start = new Date(r.startDate);
          const end = new Date(r.endDate);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new Error("Date non valide per la giornata");
          }
          return {
            name: r.name?.trim() || `Giornata ${idx + 1}`,
            // convertiamo datetime-local (YYYY-MM-DDTHH:mm) in ISO con :00Z
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            lockAt: toIsoStringFromInput(r.lockAt ?? null)
          };
        })
      };
    } catch (error: any) {
      setMsg(error?.message || "Errore nei dati delle giornate");
      return;
    }

    try {
      const res = await fetch(`/api/competitions/${competitionId}/rounds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore salvataggio giornate");
        return;
      }
      setMsg(`Calendario salvato (${data.count} giornate)`);
    } catch {
      setMsg("Errore di rete");
    }
  }

  function updateField(i: number, key: keyof Round, value: string) {
    const next = [...rounds];
    (next[i] as any)[key] = value;
    setRounds(next);
  }

  async function saveLock(roundId: number) {
    const inputValue = lockValues[roundId] ?? "";
    const isoValue = toIsoStringFromInput(inputValue || null);
    setLockMessage(null);
    setLockError(null);
    setLockSaving(roundId);

    try {
      const res = await fetch(`/api/admin/rounds/update-lock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({ roundId, lockAt: isoValue })
      });
      const data = await res.json();
      if (!res.ok) {
        setLockError(data?.error || "Errore aggiornamento lock");
        return;
      }

      const updatedLockAt: string | null = data?.round?.lockAt ?? null;
      setExisting((prev) =>
        prev.map((round) => (round.id === roundId ? { ...round, lockAt: updatedLockAt } : round))
      );
      setLockValues((prev) => ({
        ...prev,
        [roundId]: toDateTimeLocalString(updatedLockAt)
      }));
      setLockMessage(
        updatedLockAt
          ? `Lock impostato al ${new Date(updatedLockAt).toLocaleString()}`
          : "Lock rimosso"
      );
    } catch {
      setLockError("Errore di rete durante l'aggiornamento del lock");
    } finally {
      setLockSaving(null);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Calendario competizione #{competitionId}</h1>

      {existing.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2>Giornate esistenti</h2>
          {lockMessage && <p style={{ marginTop: 8, color: "green" }}>{lockMessage}</p>}
          {lockError && <p style={{ marginTop: 8, color: "crimson" }}>{lockError}</p>}
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 12
            }}
          >
            {existing.map((r) => {
              const locked = r.lockAt ? new Date(r.lockAt).getTime() <= Date.now() : false;
              return (
                <li
                  key={r.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 12,
                    display: "grid",
                    gap: 8
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <strong>
                        {r.dayIndex}. {r.name}
                      </strong>
                      <div style={{ fontSize: 12, color: "#555" }}>
                        {new Date(r.startDate).toLocaleString()} → {new Date(r.endDate).toLocaleString()}
                      </div>
                    </div>
                    {locked && <span style={{ fontSize: 14, color: "#c00" }}>🔒 Locked</span>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 14 }}>
                      Lock datetime:&nbsp;
                      <input
                        type="datetime-local"
                        value={lockValues[r.id] ?? ""}
                        onChange={(e) =>
                          setLockValues((prev) => ({
                            ...prev,
                            [r.id]: e.target.value
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => saveLock(r.id)}
                      disabled={lockSaving === r.id}
                    >
                      {lockSaving === r.id ? "Salvataggio..." : "Salva lock"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLockValues((prev) => ({
                          ...prev,
                          [r.id]: ""
                        }));
                        setLockMessage(null);
                        setLockError(null);
                      }}
                      disabled={lockSaving === r.id}
                      style={{ background: "transparent", border: "1px dashed #aaa", padding: "4px 8px" }}
                    >
                      Svuota
                    </button>
                  </div>
                  {r.lockAt && (
                    <div style={{ fontSize: 12, color: "#777" }}>
                      UTC: {new Date(r.lockAt).toLocaleString("en-GB", { hour12: false })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section style={{ marginBottom: 16 }}>
        <h2>Genera giornate</h2>
        <label>
          Numero giornate:&nbsp;
          <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </label>
        <button style={{ marginLeft: 8 }} onClick={generateRows}>Genera righe</button>
      </section>

      {rounds.length > 0 && (
        <form onSubmit={submitRounds} style={{ display: "grid", gap: 12 }}>
          {rounds.map((r, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 8,
                alignItems: "center"
              }}
            >
              <input
                value={r.name || ""}
                onChange={(e) => updateField(i, "name", e.target.value)}
                placeholder={`Giornata ${i + 1}`}
              />
              <input
                type="datetime-local"
                value={r.startDate}
                onChange={(e) => updateField(i, "startDate", e.target.value)}
              />
              <input
                type="datetime-local"
                value={r.endDate}
                onChange={(e) => updateField(i, "endDate", e.target.value)}
              />
              <input
                type="datetime-local"
                value={r.lockAt || ""}
                onChange={(e) => updateField(i, "lockAt", e.target.value)}
                placeholder="Lock datetime"
              />
            </div>
          ))}
          <button type="submit">Salva calendario</button>
        </form>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
