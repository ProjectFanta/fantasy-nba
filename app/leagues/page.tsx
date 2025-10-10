// app/leagues/page.tsx
"use client";

import { useEffect, useState } from "react";

type League = {
  id: number;
  name: string;
  description?: string | null;
  createdAt?: string;
};

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    fetchLeagues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLeagues() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/leagues", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore caricamento leghe");
      } else {
        setLeagues(data.leagues || []);
      }
    } catch (err) {
      setMsg("Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!name.trim()) {
      setMsg("Inserisci il nome della lega");
      return;
    }
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore creazione lega");
        return;
      }
      setName("");
      setDescription("");
      setMsg("Lega creata con successo");
      fetchLeagues();
    } catch (err) {
      setMsg("Errore di rete");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Le mie leghe</h1>

      <section style={{ marginBottom: 24 }}>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8, maxWidth: 600 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome lega" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione (opzionale)" />
          <div>
            <button type="submit">Crea nuova lega</button>
            <button type="button" onClick={() => { setName(""); setDescription(""); }} style={{ marginLeft: 8 }}>
              Pulisci
            </button>
          </div>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </section>

      <section>
        <h2>Elenco leghe</h2>
        {loading ? (
          <p>Caricamento...</p>
        ) : leagues.length === 0 ? (
          <p>Nessuna lega trovata.</p>
        ) : (
          <ul>
            {leagues.map((l) => (
              <li key={l.id} style={{ marginBottom: 8 }}>
                <strong>{l.name}</strong>
                <div style={{ color: "#666" }}>{l.description ?? "—"}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
