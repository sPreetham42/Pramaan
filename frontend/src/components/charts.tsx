/**
 * Small, honest data visuals built from the design tokens.
 *
 * CompareBars: baseline / target / observed on one shared scale, so the
 * gap that decides a verdict is readable at a glance.
 *
 * StepBar: segmented progress (milestones, payments, evidence checks,
 * journey gates). Always accompanied by a "X of Y" label; color is never
 * the only signal.
 */

export type CompareRow = {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "ok" | "danger";
};

const BAR_FILL: Record<CompareRow["tone"], string> = {
  neutral: "bg-muted/40",
  accent: "bg-accent",
  ok: "bg-ok",
  danger: "bg-danger",
};

export function CompareBars({ rows, unit }: { rows: CompareRow[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value)) * 1.15;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const width = Math.max(3, Math.round((r.value / max) * 100));
        return (
          <div key={r.label} className="grid grid-cols-[84px_minmax(0,1fr)_58px] items-center gap-3">
            <span className="text-12 text-muted">{r.label}</span>
            <div className="h-2.5 w-full border border-line bg-paper/60">
              <div className={`h-full ${BAR_FILL[r.tone]}`} style={{ width: `${width}%` }} />
            </div>
            <span className="mono text-right text-12 font-medium text-ink">
              {r.value} {unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function StepBar({
  segments,
  done,
  label,
}: {
  segments: number;
  done: number;
  label: string;
}) {
  const filled = Math.max(0, Math.min(done, segments));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-12 text-muted">{label}</span>
        <span className="mono text-12 font-medium text-ink">
          {filled} of {segments}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={`h-2 flex-1 ${i < filled ? "bg-ok" : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}