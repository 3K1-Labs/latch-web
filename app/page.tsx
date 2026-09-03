import Image from 'next/image';

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0a0a0a',
      }}
    >
      <Image src="/latch.png" alt="Latch" width={96} height={96} priority style={{ borderRadius: '20%' }} />
      <p style={{ opacity: 0.6, color: '#fafafa' }}>Coming soon.</p>
    </main>
  );
}
