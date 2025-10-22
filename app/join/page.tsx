"use client";

import { useEffect, useState } from "react";

export default function JoinLeaguePage() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("code");
    if (c) setCode(c);
  }, []);

  async function join() {
    setMsg("");
    const token = localStorage.getItem("token");
    if (!token) {
      setMsg("Devi essere loggato");
      return;
    }
    const r = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (!r.ok) {
      setMsg(d?.error ?? "Errore");
      return;
    }
    setMsg(d.already ? "Sei già membro di questa lega" : "Ingresso avvenuto!");
  }

  return (
    <main>
      <h1>Unisciti a una lega</h1>
      {msg && <p>{msg}</p>}
      <input
        placeholder="Inserisci codice invito"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ padding: 8, width: 280 }}
      />
      <button onClick={join} style={{ marginLeft: 8 }}>
        Entra
      </button>
    </main>
  );
}
