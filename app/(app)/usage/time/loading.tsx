/**
 * Shown the instant a range button is clicked.
 *
 * Without this the old table sits there while the new one loads, and the
 * click reads as a page that ignored you.
 */
export default function Loading() {
  return (
    <main>
      <div className="eyebrow">Usage</div>
      <h1>Time</h1>
      <p className="note" style={{ marginTop: 8 }}>Loading…</p>
      <div className="grid" style={{ marginTop: 28 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ height: 120, opacity: 0.35 }} />
        ))}
      </div>
    </main>
  );
}
