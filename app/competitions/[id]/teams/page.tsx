"use client";

import { useEffect, useMemo, useState } from "react";

type Team = {
  id: number;
  name: string;
  userId: number | null;
};

type JwtPayload = {
  userId?: number;
};

function parseToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function CompetitionTeamsPage({ params }: { params: { id: string } }) {
  const competitionId = Number(params.id);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
    if (storedToken) {
      const payload = parseToken(storedToken);
      if (payload?.userId) {
        setCurrentUserId(Number(payload.userId));
      }
    }
  }, []);

  const myTeam = useMemo(() => {
    if (!currentUserId) return null;
    return teams.find((t) => t.userId === currentUserId) ?? null;
  }, [teams, currentUserId]);

  async function load() {
    setMsg(null);
    try {
      const res = await fetch(`/api/teams?competitionId=${competitionId}`);
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore caricamento squadre");
        return;
      }
      setTeams(Array.isArray(data.teams) ? data.teams : []);
    } catch {
      setMsg("Errore di rete");
    }
  }

  useEffect(() => {
    if (!Number.isNaN(competitionId)) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setMsg("Devi essere autenticato");
      return;
    }
    setMsg(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ competitionId, name })
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore creazione squadra");
        return;
      }
      setMsg("Squadra creata");
      setName("");
      load();
    } catch {
      setMsg("Errore di rete");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Squadre — Competizione #{competitionId}</h1>

      {myTeam ? (
        <section style={{ margin: "16px 0" }}>
          <p>
            La tua squadra: <strong>{myTeam.name}</strong>
          </p>
        </section>
      ) : (
        <section style={{ margin: "16px 0" }}>
          <h2>Crea la tua squadra</h2>
          <form onSubmit={createTeam} style={{ display: "grid", gap: 8, maxWidth: 500 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome squadra"
              required
            />
            <button type="submit" disabled={!token || !name.trim()}>
              Crea squadra
            </button>
          </form>
        </section>
      )}

      {msg && <p style={{ margin: "8px 0" }}>{msg}</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Le squadre</h2>
        {teams.length === 0 ? (
          <p>Nessuna squadra presente</p>
        ) : (
          <ul>
            {teams.map((team) => (
              <li key={team.id} style={{ marginBottom: 12 }}>
                <strong>{team.name}</strong>
                {myTeam && team.id === myTeam.id && " (la tua)"}
                <div style={{ marginTop: 4 }}>
                  <a href={`/teams/${team.id}/lineups`}>Imposta formazione</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
