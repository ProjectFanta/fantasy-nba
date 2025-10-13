"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Round = { id: number; name?: string | null };

type RoundsResponse = { ok?: boolean; rounds?: Round[] };

type Message = { type: "success" | "error"; text: string } | null;

export default function H2HAdminPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadRounds() {
      if (!competitionId) return;
      try {
        const res = await fetch(`/api/competitions/${competitionId}/rounds`, { cache: "no-store" });
        const data = (await res.json()) as RoundsResponse;
        if (res.ok && Array.isArray(data?.rounds)) {
          setRounds(data.rounds);
        }
      } catch (error) {
        console.error("Failed to load rounds", error);
      }
    }

    loadRounds();
  }, [competitionId]);

  const handleSchedule = async () => {
    if (!competitionId) return;
    setLoading(true);
    setMessage(null);
    const token = window.localStorage.getItem("token");
    if (!token) {
      setMessage({ type: "error", text: "Non sei loggato." });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/h2h/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ competitionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? "Errore" });
      } else {
        setMessage({
          type: "success",
          text: `Calendario creato: ${data.created} match, rounds usati: ${data.roundsUsed}`,
        });
      }
    } catch (error) {
      console.error("generate schedule error", error);
      setMessage({ type: "error", text: "Errore di rete" });
    } finally {
      setLoading(false);
    }
  };

  const handleCompute = async (roundId: number) => {
    if (!competitionId) return;
    setLoading(true);
    setMessage(null);
    const token = window.localStorage.getItem("token");
    if (!token) {
      setMessage({ type: "error", text: "Non sei loggato." });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/h2h/compute?roundId=${roundId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error ?? "Errore" });
      } else {
        setMessage({ type: "success", text: `Risultati calcolati: ${data.updated} partite aggiornate` });
      }
    } catch (error) {
      console.error("compute round error", error);
      setMessage({ type: "error", text: "Errore di rete" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: 16 }}>
      <h1>H2H Admin – Competizione {competitionId}</h1>
      {message && (
        <p style={{ color: message.type === "error" ? "red" : "green" }}>{message.text}</p>
      )}
      <button onClick={handleSchedule} disabled={loading} style={{ marginBottom: 16 }}>
        {loading ? "Attendere..." : "Genera calendario (round-robin)"}
      </button>
      <h2 style={{ marginTop: 24 }}>Calcola risultati round</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {rounds.map((round) => (
          <li key={round.id} style={{ marginBottom: 8 }}>
            <span>
              Round {round.id}
              {round.name ? ` – ${round.name}` : ""}
            </span>{" "}
            <button onClick={() => handleCompute(round.id)} disabled={loading}>
              Calcola
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
