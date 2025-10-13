"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

export default function AdminResultsPage() {
  const params = useParams<{ id: string }>();
  const roundId = useMemo(() => Number(params?.id), [params]);
  const [text, setText] = useState("");
  const [list, setList] = useState<{ player: string; points: number }[]>([]);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    if (!roundId) return;
    const res = await fetch(`/api/admin/results?roundId=${roundId}`, { cache: "no-store" });
    const data = await res.json();
    if (data?.results) setList(data.results);
  }

  useEffect(() => {
    load();
  }, [roundId]);

  async function onSave() {
    setMsg("");
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setMsg("Non sei loggato.");
      return;
    }
    const items: { player: string; points: number }[] = [];
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      const [name, pts] = raw.split(",").map(s => s.trim());
      const points = Number(pts);
      if (!name || Number.isNaN(points)) continue;
      items.push({ player: name, points });
    }
    if (items.length === 0) {
      setMsg("Inserisci almeno una riga: Nome, punti");
      return;
    }
    const res = await fetch(`/api/admin/results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ roundId, items })
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data?.error ?? "Errore salvataggio");
    } else {
      setMsg(`Salvati ${data.count} risultati`);
      setText("");
      load();
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: 16 }}>
      <h1>Admin risultati – Round {roundId}</h1>
      <p>Una riga per giocatore: <code>Nome, punti</code></p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        style={{ width: "100%", fontFamily: "monospace" }}
        placeholder={"LeBron James, 42\nNikola Jokic, 55\nStephen Curry, 37.5"}
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={onSave}>Salva risultati</button>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      <h2 style={{ marginTop: 24 }}>Risultati salvati</h2>
      <ul>
        {list.map((r, i) => (
          <li key={i}>{r.player} — {r.points}</li>
        ))}
      </ul>
    </main>
  );
}
