'use client';

/**
 * When the root layout itself fails (Task 14.6). This replaces the layout, so
 * there is no header, no language, no stylesheet: plain Macedonian and inline
 * styles. Rare; `error.tsx` takes every failure below the layout.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="mk">
      <body style={{ margin: 0, background: '#f9fafb', color: '#111827', fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <title>Грешка | Marshal</title>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <p style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: 2, margin: '0 0 24px' }}>MARSHAL</p>
            <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Нешто тргна наопаку</h1>
            <p style={{ color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
              Страната не се вчита. Пробајте повторно, а ако пак не успее, вратете се на почетната.
            </p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ padding: '12px 24px', background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', margin: 4 }}
            >
              Пробајте повторно
            </button>
            {/* A plain link: the router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ display: 'inline-block', padding: '11px 24px', border: '1px solid #d1d5db', borderRadius: 8, color: '#1f2937', textDecoration: 'none', fontWeight: 600, margin: 4 }}>
              Почетна
            </a>
            {error.digest && <p style={{ marginTop: 32, fontSize: 12, color: '#9ca3af' }}>Код на грешката: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
