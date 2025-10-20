import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy NBA",
  description: "Gestione leghe, competizioni e risultati",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#f5f5f5",
          color: "#111",
        }}
      >
        <NavBar />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px" }}>{children}</div>
      </body>
    </html>
  );
}
