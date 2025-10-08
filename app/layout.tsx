export const metadata = {
  title: 'NBA Fantasy',
  description: 'Gestisci la tua lega fantasy NBA con stile.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#f5f5f5',
          color: '#111',
        }}
      >
        {children}
      </body>
    </html>
  );
}
