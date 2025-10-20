"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function NavBar() {
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem("token");
      setLogged(!!t);
    } catch {}
  }, []);

  function logout() {
    try {
      localStorage.removeItem("token");
      // hard refresh verso home
      window.location.href = "/";
    } catch {}
  }

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 16px",
        borderBottom: "1px solid #eee",
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 10
      }}
    >
      <Link href="/">🏠 Home</Link>
      <Link href="/leagues">Leagues</Link>
      <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
        {!logged ? (
          <>
            <Link href="/login">Login</Link>
            <Link href="/register">Registrati</Link>
          </>
        ) : (
          <button onClick={logout}>Logout</button>
        )}
      </div>
    </nav>
  );
}
