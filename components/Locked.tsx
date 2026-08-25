/** Placeholder for a stage that is not reachable yet. */
export function Locked({ what, blockedBy }: { what: string; blockedBy: string }) {
  return (
    <div className="empty">
      <strong>{what}</strong>
      <div style={{ marginTop: 4 }}>Unlocks after: {blockedBy}</div>
    </div>
  );
}
