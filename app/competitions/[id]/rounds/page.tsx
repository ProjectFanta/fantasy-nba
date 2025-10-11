"use client";

import { useEffect, useState } from "react";

type Round = {
  id?: number;
  name?: string;
  startDate: string;
  endDate: string;
};

export default function CompetitionRoundsPage({ params }: { params: { id: string } }) {
  const competitionId = Number(params.id);
  const [existing, setExisting] = useState<any[]>([]);
  const [count, setCount] = useState<number>(8);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    // carica eventuali giornate già create
    (async () => {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/rounds`);
        const data = await res.json();
        if (res.ok) setExisting(data.rounds || []);
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
      return {
        name: `Giornata ${i + 1}`,
        startDate: new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
        endDate: new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      };
    });
    setRounds(template);
  }

  async function submitRounds(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const payload = {
        rounds: rounds.map((r, idx) => ({
          name: r.name || `Giornata ${idx + 1}`,
          // convertiamo datetime-local (YYYY-MM-DDTHH:mm) in ISO con :00Z
          startDate: new Date(r.startDate).toISOString(),
          endDate: new Date(r.endDate).toISOString()
        }))
      };
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

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Calendario competizione #{competitionId}</h1>

      {existing.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h2>Giornate esistenti</h2>
          <ul>
            {existing.map((r: any) => (
              <li key={r.id}>
                {r.dayIndex}. {r.name} — {new Date(r.startDate).toLocaleDateString()} → {new Date(r.endDate).toLocaleDateString()}
              </li>
            ))}
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
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
              <input value={r.name || ""} onChange={(e) => updateField(i, "name", e.target.value)} placeholder={`Giornata ${i + 1}`} />
              <input type="datetime-local" value={r.startDate} onChange={(e) => updateField(i, "startDate", e.target.value)} />
              <input type="datetime-local" value={r.endDate} onChange={(e) => updateField(i, "endDate", e.target.value)} />
            </div>
          ))}
          <button type="submit">Salva calendario</button>
        </form>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
