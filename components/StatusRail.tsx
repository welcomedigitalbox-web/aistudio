const STAGES = ["draft", "internal_review", "approved", "published"] as const;
const LABEL: Record<string, string> = {
  draft: "Draft",
  internal_review: "In review",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

export function StatusRail({ status }: { status: string }) {
  const idx = STAGES.indexOf(status as (typeof STAGES)[number]);
  const rejected = status === "rejected";

  return (
    <div>
      <div className="rail" role="img" aria-label={`Status: ${LABEL[status] ?? status}`}>
        {STAGES.map((s, i) => (
          <span
            key={s}
            className={
              rejected && i === 0 ? "bad" : i < idx ? "on" : i === idx ? (status === "internal_review" ? "wait" : "on") : ""
            }
          />
        ))}
      </div>
      <div className="rail-label">{LABEL[status] ?? status}</div>
    </div>
  );
}
