"use client";

/**
 * Horizontal progress through the pipeline. Steps before the current one are
 * done, the current one is live, everything after is locked.
 */
export function StageRail({
  steps,
  currentId,
}: {
  steps: readonly { id: string; label: string }[];
  currentId: string;
}) {
  const idx = steps.findIndex((s) => s.id === currentId);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="rail">
        {steps.map((s, i) => (
          <span key={s.id} className={i < idx ? "on" : i === idx ? "wait" : ""} />
        ))}
      </div>
      <div className="row between">
        <span className="rail-label">
          Step {Math.max(idx, 0) + 1} of {steps.length}
        </span>
        <span className="rail-label" style={{ color: "var(--ink)" }}>
          {steps[idx]?.label ?? steps[steps.length - 1].label}
        </span>
      </div>
    </div>
  );
}
