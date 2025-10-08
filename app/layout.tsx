export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <title>NBA Fantasy</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
