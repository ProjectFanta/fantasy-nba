"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

export default function LeagueInvitePage() {
  const params = useParams<{ id: string }>();
  const leagueId = useMemo(() => Number(params?.id), [params]);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const token = localStorage.getItem("token");
    if (!token) {
      setMsg("Non sei loggato");
      return;
    }
    const r = await fetch(`/api/leagues/${leagueId}/invite`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) {
      setMsg(d?.error ?? "Errore");
      setCode(null);
      return;
    }
    setCode(d.inviteCode ?? null);
  }
  async function rotate() {
    setMsg("");
    const token = localStorage.getItem("token");
    if (!token) {
      setMsg("Non sei loggato");
      return;
    }
    const r = await fetch(`/api/leagues/${leagueId}/invite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (!r.ok) {
      setMsg(d?.error ?? "Errore");
      return;
    }
    setCode(d.inviteCode);
  }
  useEffect(() => {
    if (leagueId) load();
  }, [leagueId]);

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setMsg("Copiato negli appunti");
  }

  return (
    <main>
      <h1>Inviti lega #{leagueId}</h1>
      {msg && <p>{msg}</p>}
      <p>
        <b>Codice attuale:</b> {code ?? "— nessun codice —"}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={rotate}>Genera/Ruota codice</button>
        <button onClick={copy} disabled={!code}>
          Copia
        </button>
      </div>
      {code && (
        <p style={{ marginTop: 12 }}>
          Link rapido: <code>/join?code={code}</code>
        </p>
      )}
    </main>
  );
}
