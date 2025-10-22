"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type RoundOption = { id: number; name?: string | null; dayIndex?: number | null };

type OverviewResponse = {
  ok?: boolean;
  competition?: { id: number; name?: string | null } | null;
  rounds?: RoundOption[];
  error?: string;
};

type ImportPreviewRow = {
  index: number;
  roundId: number | null;
  roundName: string | null;
  teamName: string;
  teamId: number | null;
  playerName: string;
  normalizedPlayer: string | null;
  points: number | null;
  valid: boolean;
  issues: string[];
};

type ImportPreviewResponse = {
  ok?: boolean;
  dryRun: boolean;
  validCount: number;
  invalidCount: number;
  previewRows: ImportPreviewRow[];
  errors?: string[];
  overwrite?: boolean;
  applied?: boolean;
  inserted?: number;
  deleted?: number;
  recompute?: {
    f1?: { roundsProcessed?: number; teamsEvaluated?: number } | null;
    h2h?: { matchesEvaluated?: number; matchesUpdated?: number } | null;
  };
  error?: string;
};

type Status = { type: "success" | "error" | "info"; text: string } | null;

type ParsedCsvRow = {
  roundId: string;
  teamName: string;
  playerName: string;
  points: string;
};

type CsvParseResult = {
  rows: ParsedCsvRow[];
  errors: string[];
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function detectDelimiter(line: string): "," | ";" {
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string): CsvParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, array) => !(index === array.length - 1 && line === ""));

  const errors: string[] = [];
  if (lines.length === 0) {
    errors.push("Il file CSV è vuoto.");
    return { rows: [], errors };
  }

  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex === -1) {
    errors.push("Impossibile individuare l'intestazione del CSV.");
    return { rows: [], errors };
  }

  const delimiter = detectDelimiter(lines[headerIndex]);
  const headerCells = parseCsvLine(lines[headerIndex], delimiter);

  const headerMap: Record<string, keyof ParsedCsvRow> = {
    roundid: "roundId",
    round: "roundId",
    roundnumber: "roundId",
    giornata: "roundId",
    teamname: "teamName",
    team: "teamName",
    squadra: "teamName",
    playername: "playerName",
    player: "playerName",
    giocatore: "playerName",
    points: "points",
    score: "points",
    punteggio: "points",
  };

  const columnIndexes: Partial<Record<keyof ParsedCsvRow, number>> = {};
  headerCells.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    const mappedKey = headerMap[normalized];
    if (mappedKey) {
      columnIndexes[mappedKey] = index;
    }
  });

  const missingColumns: string[] = [];
  if (columnIndexes.roundId == null) missingColumns.push("roundId");
  if (columnIndexes.teamName == null) missingColumns.push("teamName");
  if (columnIndexes.playerName == null) missingColumns.push("playerName");
  if (columnIndexes.points == null) missingColumns.push("points");

  if (missingColumns.length > 0) {
    errors.push(
      `Intestazione CSV non valida. Colonne mancanti: ${missingColumns.join(", ")}. ` +
        "Attese: roundId, teamName, playerName, points.",
    );
    return { rows: [], errors };
  }

  const rows: ParsedCsvRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseCsvLine(line, delimiter);
    const roundId = cells[columnIndexes.roundId!]?.trim() ?? "";
    const teamName = cells[columnIndexes.teamName!]?.trim() ?? "";
    const playerName = cells[columnIndexes.playerName!]?.trim() ?? "";
    const points = cells[columnIndexes.points!]?.trim() ?? "";

    if (!roundId && !teamName && !playerName && !points) {
      continue;
    }

    rows.push({
      roundId,
      teamName,
      playerName,
      points,
    });
  }

  if (rows.length === 0) {
    errors.push("Nessuna riga dati trovata nel CSV.");
  }

  return { rows, errors };
}

export default function CompetitionImportPage() {
  const params = useParams<{ id: string }>();
  const paramsId = params?.id ?? "";
  const competitionId = useMemo(() => Number(paramsId), [paramsId]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [allowed, setAllowed] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [competitionName, setCompetitionName] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundOption[]>([]);

  const [status, setStatus] = useState<Status>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setToken(null);
      return;
    }
    const stored = window.localStorage.getItem("token");
    setToken(stored);
  }, []);

  useEffect(() => {
    if (!competitionId) return;
    if (token === undefined) return;

    if (!token) {
      setAllowed(false);
      setStatus({ type: "error", text: "Devi effettuare il login per accedere all'import." });
      setInitializing(false);
      return;
    }

    let cancelled = false;

    async function loadOverview() {
      setInitializing(true);
      try {
        const res = await fetch(`/api/admin/competitions/${competitionId}/recompute`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as OverviewResponse;
        if (!res.ok) {
          const message = data?.error ?? "Impossibile caricare i dati amministrativi.";
          if (!cancelled) {
            setAllowed(false);
            setStatus({ type: "error", text: message });
          }
          return;
        }
        if (!cancelled) {
          setAllowed(true);
          setCompetitionName(data?.competition?.name ?? null);
          setRounds(Array.isArray(data?.rounds) ? data.rounds : []);
          setStatus({ type: "success", text: "Accesso amministratore verificato." });
        }
      } catch (error: any) {
        if (!cancelled) {
          setAllowed(false);
          setStatus({
            type: "error",
            text: error?.message ? `Errore di rete: ${error.message}` : "Errore durante il caricamento dei dati.",
          });
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [competitionId, token]);

  const runDryRun = useCallback(
    async (rowsForPreview: ParsedCsvRow[], overwriteFlag: boolean) => {
      if (!competitionId) {
        setStatus({ type: "error", text: "ID competizione non valido." });
        return;
      }
      if (token === undefined) return;
      if (!token) {
        setStatus({ type: "error", text: "Token non disponibile. Effettua di nuovo il login." });
        return;
      }
      if (!allowed) {
        setStatus({ type: "error", text: "Non hai i permessi per effettuare l'import." });
        return;
      }
      if (rowsForPreview.length === 0) {
        setStatus({ type: "error", text: "Nessuna riga da inviare." });
        return;
      }

      setLoading(true);
      setGlobalErrors([]);
      try {
        const res = await fetch(`/api/admin/results/import?dryRun=1`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            competitionId,
            rows: rowsForPreview,
            overwrite: overwriteFlag,
          }),
        });
        const data = (await res.json()) as ImportPreviewResponse;
        if (!res.ok || data?.ok === false) {
          const message = data?.error ?? "Errore durante l'anteprima dell'import.";
          setPreview(null);
          setGlobalErrors(data?.errors ?? []);
          setStatus({ type: "error", text: message });
          return;
        }
        setPreview(data);
        setGlobalErrors(data?.errors ?? []);
        setStatus({
          type: "info",
          text: `Anteprima generata: ${data.validCount} righe valide, ${data.invalidCount} non valide.`,
        });
      } catch (error: any) {
        setPreview(null);
        setStatus({
          type: "error",
          text: error?.message ? `Errore di rete: ${error.message}` : "Errore durante il caricamento dell'anteprima.",
        });
      } finally {
        setLoading(false);
      }
    },
    [allowed, competitionId, token],
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const content = await file.text();
        const parsed = parseCsv(content);
        setFileName(file.name);
        setRows(parsed.rows);
        setPreview(null);
        setGlobalErrors(parsed.errors);

        if (parsed.errors.length > 0) {
          setStatus({ type: "error", text: parsed.errors[0] });
          return;
        }

        if (parsed.rows.length > 0) {
          if (allowed && token) {
            setStatus({
              type: "info",
              text: `File "${file.name}" caricato (${parsed.rows.length} righe). Generazione anteprima…`,
            });
            await runDryRun(parsed.rows, overwrite);
          } else {
            setStatus({
              type: "info",
              text: `File "${file.name}" caricato (${parsed.rows.length} righe). Attendi la verifica dei permessi per generare l'anteprima.`,
            });
          }
        } else {
          setStatus({
            type: "info",
            text: `File "${file.name}" caricato ma non contiene righe da importare.`,
          });
        }
      } catch (error: any) {
        setStatus({
          type: "error",
          text: error?.message ? `Impossibile leggere il file: ${error.message}` : "Errore durante la lettura del file.",
        });
      }
    },
    [allowed, overwrite, runDryRun, token],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
      event.target.value = "";
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleApply = useCallback(async () => {
    if (!competitionId) {
      setStatus({ type: "error", text: "ID competizione non valido." });
      return;
    }
    if (!token) {
      setStatus({ type: "error", text: "Token non disponibile. Effettua di nuovo il login." });
      return;
    }
    if (!allowed) {
      setStatus({ type: "error", text: "Non hai i permessi per effettuare l'import." });
      return;
    }
    if (rows.length === 0) {
      setStatus({ type: "error", text: "Carica prima un file CSV." });
      return;
    }

    setApplying(true);
    setGlobalErrors([]);
    try {
      const res = await fetch(`/api/admin/results/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          competitionId,
          rows,
          overwrite,
        }),
      });
      const data = (await res.json()) as ImportPreviewResponse;
      if (!res.ok || data?.ok === false) {
        const message = data?.error ?? "Errore durante l'import dei risultati.";
        setStatus({ type: "error", text: message });
        setGlobalErrors(data?.errors ?? []);
        setPreview(null);
        return;
      }
      setPreview(data);
      setGlobalErrors(data?.errors ?? []);
      const inserted = data?.inserted ?? 0;
      const deleted = data?.deleted ?? 0;
      setStatus({
        type: "success",
        text: `Import completato: ${inserted} risultati inseriti e ${deleted} sovrascritti.`,
      });
    } catch (error: any) {
      setStatus({
        type: "error",
        text: error?.message ? `Errore di rete: ${error.message}` : "Errore durante l'import dei risultati.",
      });
    } finally {
      setApplying(false);
    }
  }, [allowed, competitionId, overwrite, rows, token]);

  const handleOverwriteToggle = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setOverwrite(checked);
      if (rows.length > 0) {
        await runDryRun(rows, checked);
      }
    },
    [rows, runDryRun],
  );

  useEffect(() => {
    if (!allowed) return;
    if (!token) return;
    if (rows.length === 0) return;
    if (preview) return;
    void runDryRun(rows, overwrite);
  }, [allowed, overwrite, preview, rows, runDryRun, token]);

  return (
    <main style={{ maxWidth: 1000, margin: "2rem auto", padding: "0 16px" }}>
      <h1>
        Import risultati competizione {competitionId}
        {competitionName ? ` – ${competitionName}` : ""}
      </h1>

      <p style={{ marginTop: 0 }}>
        <Link href={`/competitions/${paramsId}/admin`} style={{ color: "#1976d2" }}>
          ← Torna al pannello admin
        </Link>
      </p>

      {status && (
        <p
          style={{
            color:
              status.type === "error"
                ? "#c62828"
                : status.type === "success"
                ? "#2e7d32"
                : "#555",
            marginBottom: 16,
          }}
        >
          {status.text}
        </p>
      )}

      {initializing ? (
        <p>Verifica permessi in corso…</p>
      ) : !allowed ? (
        <p>
          Non hai i permessi necessari per importare i risultati di questa competizione. Contatta il proprietario della lega per ottenere l'accesso.
        </p>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #1976d2",
                borderRadius: 8,
                padding: 32,
                textAlign: "center",
                background: dragActive ? "#e3f2fd" : "#fafafa",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}
            >
              <strong>Trascina qui il CSV oppure clicca per selezionarlo</strong>
              <p style={{ marginTop: 8, color: "#555" }}>
                Formato atteso: roundId, teamName, playerName, points
              </p>
              {fileName ? (
                <p style={{ marginTop: 12 }}>
                  File selezionato: <strong>{fileName}</strong>
                </p>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleInputChange}
              style={{ display: "none" }}
            />
          </div>

          {rounds.length > 0 && (
            <details style={{ background: "#f9f9f9", padding: 12, borderRadius: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Round disponibili ({rounds.length})</summary>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                {rounds.map((round) => (
                  <li key={round.id}>
                    {round.dayIndex != null ? `Giornata ${round.dayIndex}` : `Round ${round.id}`}
                    {round.name ? ` – ${round.name}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={overwrite} onChange={handleOverwriteToggle} />
              <span>Sovrascrivi risultati esistenti</span>
            </label>
            <button onClick={() => runDryRun(rows, overwrite)} disabled={loading || rows.length === 0}>
              {loading ? "Calcolo anteprima…" : "Ricalcola anteprima"}
            </button>
            <button
              onClick={handleApply}
              disabled={applying || loading || !preview || preview.validCount === 0}
              style={{ background: "#2e7d32", color: "#fff", padding: "8px 16px", borderRadius: 6 }}
            >
              {applying ? "Applicazione in corso…" : "Applica risultati"}
            </button>
          </div>

          {globalErrors.length > 0 && (
            <div style={{ color: "#c62828" }}>
              <h3 style={{ marginTop: 0 }}>Errori</h3>
              <ul>
                {globalErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {preview ? (
            <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>Anteprima</h3>
              <p style={{ marginTop: 0 }}>
                {preview.validCount} righe valide, {preview.invalidCount} righe non valide.
                {preview.overwrite ? " (Modalità sovrascrittura attiva)" : ""}
              </p>
              {preview.dryRun ? (
                <p style={{ color: "#555", marginTop: 0 }}>L'applicazione non è stata ancora eseguita.</p>
              ) : (
                <div style={{ color: "#2e7d32" }}>
                  <p style={{ margin: "4px 0" }}>
                    Inseriti: <strong>{preview.inserted ?? 0}</strong> – Sovrascritti: <strong>{preview.deleted ?? 0}</strong>
                  </p>
                  {preview.recompute?.f1 ? (
                    <p style={{ margin: "4px 0" }}>
                      F1 ricalcolato: {preview.recompute.f1.roundsProcessed ?? 0} round elaborati, {preview.recompute.f1.teamsEvaluated ?? 0} squadre aggiornate.
                    </p>
                  ) : null}
                  {preview.recompute?.h2h ? (
                    <p style={{ margin: "4px 0" }}>
                      H2H ricalcolato: {preview.recompute.h2h.matchesEvaluated ?? 0} partite verificate, {preview.recompute.h2h.matchesUpdated ?? 0} aggiornate.
                    </p>
                  ) : null}
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                  <thead>
                    <tr style={{ background: "#f5f5f5" }}>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>#</th>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Round</th>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Squadra</th>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Giocatore</th>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Punti</th>
                      <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #ddd" }}>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((row) => {
                      const background = row.valid ? "#e8f5e9" : "#ffebee";
                      const roundLabel = row.roundName
                        ? `${row.roundName} ${row.roundId ? `(#${row.roundId})` : ""}`
                        : row.roundId ?? "-";
                      return (
                        <tr key={row.index} style={{ background }}>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{row.index + 1}</td>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{roundLabel}</td>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{row.teamName || "-"}</td>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{row.playerName || "-"}</td>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee" }}>{row.points ?? "-"}</td>
                          <td style={{ padding: "8px", borderBottom: "1px solid #eee", color: row.valid ? "#2e7d32" : "#c62828" }}>
                            {row.valid ? "OK" : row.issues.join("; ") || "Errore"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ color: "#555" }}>
              Carica un CSV per visualizzare l'anteprima dei risultati importati.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

