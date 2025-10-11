"use client";

import { useEffect, useState, FormEvent } from "react";

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
  const [token, setToken] = useState<string | null>(null);

  // Legge il token dal localStorage dopo il mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("token");
      setToken(t);
    }
  }, []);

  // Carica le leghe quando ho un token valido
  useEffect(() => {
    if (token) fetchLeagues();
    else setMsg("Effettua il login per vedere e creare le tue leghe.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    } catch {
      setMsg("Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!token) {
      setMsg("Devi effettuare il login prima di creare una lega.");
      return;
    }
    if (!name.trim()) {
      setMsg("Inserisci il nome della lega");
      return;
    }

    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
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
    } catch {
      setMsg("Errore di rete");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Le mie leghe</h1>

      {/* Form creazione lega */}
      <section style={{ marginBottom: 24 }}>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: 8, maxWidth: 600 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome lega"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione (opzionale)"
          />
          <div>
            <button type="submit" disabled={!token}>Crea nuova lega</button>
            <button
              type="button"
              onClick={() => {
                setName("");
                setDescription("");
              }}
              style={{ marginLeft: 8 }}
            >
              Pulisci
            </button>
          </div>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
        {!token && (
          <p style={{ marginTop: 8 }}>
            Non sei autenticato. <a href="/login">Vai al login</a>
          </p>
        )}
      </section>

      {/* Elenco leghe */}
      <section>
        <h2>Elenco leghe</h2>
        {loading ? (
          <p>Caricamento...</p>
        ) : leagues.length === 0 ? (
          <p>Nessuna lega trovata.</p>
        ) : (
          <ul>
            {leagues.map((l) => (
              <li key={l.id} style={{ marginBottom: 12 }}>
                <strong>{l.name}</strong>
                <div style={{ color: "#666" }}>{l.description ?? "—"}</div>
                <div style={{ marginTop: 4 }}>
                  {/* Link alla gestione competizioni per quella lega */}
                  <a href={`/leagues/${l.id}/competitions`}>Gestisci competizioni</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
