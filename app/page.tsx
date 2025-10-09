export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        textAlign: 'center',
      }}
    >
      <h1>🏀 Fantasy NBA</h1>
      <p>Benvenuto! L’app è online e connessa a Supabase.</p>
      <p>Da qui inizieremo a costruire la dashboard, le leghe e le competizioni.</p>
    </main>
  );
}
