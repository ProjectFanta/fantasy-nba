"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error || "Errore");
      } else {
        setMsg("Registrazione completata. Effettua il login.");
        setEmail("");
        setPassword("");
        setName("");
      }
    } catch (err) {
      setMsg("Errore di rete");
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700, margin: "0 auto" }}>
      <h1>Registrazione</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opzionale)" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
        <button type="submit">Registrati</button>
      </form>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
