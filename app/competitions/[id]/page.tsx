"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Round = { id: number; name?: string; dayIndex?: number };
type Competition = { id: number; name: string; type: string };

export default function CompetitionHubPage() {
  const params = useParams<{ id: string }>();
  const competitionId = useMemo(() => Number(params?.id), [params]);

  const [comp, setComp] = useState<Competition | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    async function load() {
      setErr("");
      if (!competitionId) return;

      // 1) rounds
      const r = await fetch(`/api/competitions/${competitionId}/rounds`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setRounds(data);
      } else {
        setErr("Impossibile caricare le giornate");
      }

      // 2) info competition (fallback semplice se non c'è un endpoint dedicato)
      try {
        const leaguesRes = await fetch(`/api/leagues`, { cache: "no-store" });
        if (leaguesRes.ok) {
          const leagues = await leaguesRes.json();
          // Cerca la competition dentro le leghe
          let found: Competition | null = null;
          for (const lg of leagues) {
            if (Array.isArray(lg.competitions)) {
              for (const c of lg.competitions) {
                if (Number(c.id) === competitionId) {
                  found = { id: c.id, name: c.name, type: c.type };
                  break;
                }
              }
            }
            if (found) break;
          }
          setComp(found);
        }
      } catch (e) {
        setErr("Impossibile caricare la competizione");
      }
    }
    load();
  }, [competitionId]);

  return (
    <main>
      <h1>
        Competizione #{competitionId}
        {comp?.name ? ` – ${comp.name}` : ""}
      </h1>
      {comp?.type && (
        <p>
          Tipo: <strong>{comp.type}</strong> (H2H o F1)
        </p>
      )}
      {err && <p style={{ color: "red" }}>{err}</p>}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <Link className="btn" href={`/competitions/${competitionId}/rounds`}>
          🗓️ Configura calendario giornate
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/fixtures`}>
          📅 Fixtures
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/teams`}>
          👥 Gestisci squadre
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/standings/f1`}>
          🏁 Classifica Formula-1
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/admin`}>
          ⚙️ Admin
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/h2h-admin`}>
          🛠️ H2H Admin
        </Link>
        <Link className="btn" href={`/competitions/${competitionId}/standings/h2h`}>
          📊 Classifica H2H
        </Link>
      </section>

      <h2 style={{ marginTop: 24 }}>Giornate</h2>
      {rounds.length === 0 ? (
        <p>Nessun round definito.</p>
      ) : (
        <ul>
          {rounds.map((r) => (
            <li key={r.id} style={{ marginBottom: 8 }}>
              {r.name ? r.name : `Round ${r.id}`}
              <Link href={`/rounds/${r.id}/admin-results`} style={{ marginLeft: 8 }}>
                ➜ Risultati admin
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
