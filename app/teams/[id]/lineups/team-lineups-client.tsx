"use client";

import { useEffect, useMemo, useState } from "react";

type Round = {
  id: number;
  name: string;
  dayIndex: number;
};

type Lineup = {
  id: number;
  teamId: number;
  roundId: number;
  entries: string[];
};

type JwtPayload = {
  userId?: number;
};

type Props = {
  teamId: number;
  teamName: string;
  competitionId: number;
  competitionName: string;
  ownerUserId: number | null;
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

export default function TeamLineupsClient({
  teamId,
  teamName,
  competitionId,
  competitionName,
  ownerUserId
}: Props) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [entriesText, setEntriesText] = useState("");
  const [currentLineup, setCurrentLineup] = useState<Lineup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [loadingLineup, setLoadingLineup] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const canEdit = useMemo(() => {
    if (!token || ownerUserId === null) return false;
    if (!currentUserId) return false;
    return ownerUserId === currentUserId;
  }, [token, ownerUserId, currentUserId]);

  useEffect(() => {
    async function loadRounds() {
      setLoadingRounds(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/competitions/${competitionId}/rounds`);
        const data = await res.json();
        if (!res.ok) {
          setMessage(data?.error || "Errore nel caricamento delle giornate");
          setRounds([]);
          return;
        }
        const list: Round[] = Array.isArray(data.rounds)
          ? data.rounds.map((r: any) => ({
              id: r.id,
              name: r.name,
              dayIndex: r.dayIndex
            }))
          : [];
        setRounds(list);
        if (list.length > 0) {
          setSelectedRoundId(list[0].id);
        } else {
          setSelectedRoundId(null);
        }
      } catch {
        setMessage("Errore di rete nel caricamento delle giornate");
        setRounds([]);
        setSelectedRoundId(null);
      } finally {
        setLoadingRounds(false);
      }
    }

    loadRounds();
  }, [competitionId]);

  useEffect(() => {
    if (!selectedRoundId) {
      setCurrentLineup(null);
      setEntriesText("");
      return;
    }

    async function loadLineup(roundId: number) {
      setLoadingLineup(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/lineups?teamId=${teamId}&roundId=${roundId}`);
        const data = await res.json();
        if (!res.ok) {
          setMessage(data?.error || "Errore nel caricamento della formazione");
          setCurrentLineup(null);
          setEntriesText("");
          return;
        }
        if (data?.lineup) {
          const entries: string[] = Array.isArray(data.lineup.entries)
            ? data.lineup.entries.map((entry: any) => String(entry))
            : [];
          setCurrentLineup({
            id: data.lineup.id,
            teamId: data.lineup.teamId,
            roundId: data.lineup.roundId,
            entries
          });
          setEntriesText(entries.join("\n"));
        } else {
          setCurrentLineup(null);
          setEntriesText("");
        }
      } catch {
        setMessage("Errore di rete nel caricamento della formazione");
        setCurrentLineup(null);
        setEntriesText("");
      } finally {
        setLoadingLineup(false);
      }
    }

    loadLineup(selectedRoundId);
  }, [selectedRoundId, teamId]);

  async function saveLineup(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoundId) return;
    if (!token) {
      setMessage("Devi essere autenticato per salvare");
      return;
    }
    if (!canEdit) {
      setMessage("Solo il proprietario della squadra può salvare la formazione");
      return;
    }

    const entries = entriesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (entries.length === 0) {
      setMessage("Inserisci almeno un giocatore");
      return;
    }
    if (entries.length > 12) {
      setMessage("Puoi indicare al massimo 12 giocatori");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/lineups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId,
          roundId: selectedRoundId,
          entries
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Errore nel salvataggio della formazione");
        return;
      }
      const savedEntries: string[] = Array.isArray(data.lineup?.entries)
        ? data.lineup.entries.map((entry: any) => String(entry))
        : entries;
      setCurrentLineup(
        data.lineup
          ? {
              id: data.lineup.id,
              teamId: data.lineup.teamId,
              roundId: data.lineup.roundId,
              entries: savedEntries
            }
          : null
      );
      setEntriesText(savedEntries.join("\n"));
      setMessage("Formazione salvata con successo");
    } catch {
      setMessage("Errore di rete nel salvataggio della formazione");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Formazione squadra: {teamName}</h1>
      <p style={{ marginTop: 4 }}>
        Competizione: <a href={`/competitions/${competitionId}/teams`}>{competitionName}</a>
      </p>
      {ownerUserId === null ? (
        <p style={{ marginTop: 8 }}>Questa squadra non ha un proprietario associato.</p>
      ) : canEdit ? (
        <p style={{ marginTop: 8 }}>Puoi salvare una formazione per ogni giornata.</p>
      ) : (
        <p style={{ marginTop: 8 }}>Solo il proprietario della squadra può modificare la formazione.</p>
      )}

      <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          Giornata
          <select
            value={selectedRoundId ?? ""}
            onChange={(e) => setSelectedRoundId(e.target.value ? Number(e.target.value) : null)}
            disabled={loadingRounds || rounds.length === 0}
          >
            {rounds.length === 0 && <option value="">Nessuna giornata disponibile</option>}
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.dayIndex}. {round.name}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={saveLineup} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            Formazione (un giocatore per riga)
            <textarea
              value={entriesText}
              onChange={(e) => setEntriesText(e.target.value)}
              rows={12}
              placeholder="Inserisci i giocatori, uno per riga"
              disabled={!canEdit || !selectedRoundId || loadingLineup || saving}
            />
          </label>
          <button type="submit" disabled={!canEdit || !selectedRoundId || saving}>
            {saving ? "Salvataggio..." : "Salva formazione"}
          </button>
        </form>

        {loadingRounds && <p>Caricamento giornate…</p>}
        {loadingLineup && !saving && <p>Caricamento formazione…</p>}
        {message && <p style={{ marginTop: 8 }}>{message}</p>}
      </section>
    </main>
  );
}
