"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Competition = {
  id: number;
  name: string;
  type: "H2H" | "F1";
  totalRounds?: number | null;
};

export default function LeagueCompetitionsPage({ params }: { params: { id: string } }) {
  const leagueId = Number(params.id);
  const [list, setList] = useState<Competition[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"H2H" | "F1">("H2H");
  const [totalRounds, setTotalRounds] = useState<number>(8);
  const [msg, setMsg] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  async function load() {
    setMsg(null);
    try {
      const res = await fetch(`/api/competitions?leagueId=${leagueId}`);
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || "Errore caricamento competizioni");
      else setList(data.competitions || []);
    } catch {
      setMsg("Errore di rete");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  async function createCompetition(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ leagueId, name, type, totalRounds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore creazione competizione");
        return;
      }
      setMsg("Competizione creata");
      setName("");
      setType("H2H");
      setTotalRounds(8);
      load();
    } catch {
      setMsg("Errore di rete");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Competizioni — Lega #{leagueId}</h1>

      <section style={{ margin: "16px 0" }}>
        <form onSubmit={createCompetition} style={{ display: "grid", gap: 8, maxWidth: 600 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome competizione" />
          <label>
            Tipo:&nbsp;
            <select value={type} onChange={(e) => setType(e.target.value as "H2H" | "F1")}> 
              <option value="H2H">Calendario 1v1 (H2H)</option>
              <option value="F1">Formula 1</option>
            </select>
          </label>
          <label>
            Numero giornate:&nbsp;
            <input
              type="number"
              min={1}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value) || 1)}
            />
          </label>
          <button type="submit">Crea competizione</button>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </section>

      <section>
        <h2>Elenco</h2>
        {list.length === 0 ? (
          <p>Nessuna competizione</p>
        ) : (
          <ul>
            {list.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <strong>{c.name}</strong> — {c.type}
                {c.totalRounds ? `, ${c.totalRounds} giornate` : ""}
                <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/competitions/${c.id}/rounds`}>Configura calendario giornate</Link>
                  <span style={{ margin: "0 4px" }}>|</span>
                  <Link href={`/competitions/${c.id}/teams`}>Gestisci squadre</Link>
                  <span style={{ margin: "0 4px" }}>|</span>
                  <Link href={`/competitions/${c.id}`}>Apri Hub</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
