/** Minimal hand-rolled trend chart: measured samples against the sealed
 * target and the department baseline. No chart library, no decoration. */

const W = 640;
const H = 240;
const PAD = { top: 16, right: 18, bottom: 30, left: 46 };

/* Chart inks resolve from the design tokens at runtime. */
const INK = {
  grid: "var(--color-line)",
  axis: "var(--color-muted)",
  baseline: "var(--color-warn)",
  target: "var(--color-accent)",
  series: "var(--color-ink)",
};

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * mag;
    if (candidate >= v) return candidate;
  }
  return v;
}

export default function TrendChart({
  labels,
  values,
  unit,
  target,
  baseline,
  showResult,
}: {
  labels: string[];
  values: number[];
  unit: string;
  target?: number | null;
  baseline?: number | null;
  showResult?: { value: number; met: boolean } | null;
}) {
  const maxValue = niceCeil(Math.max(...values, target ?? 0, baseline ?? 0) * 1.12);
  const minValue = 0;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) =>
    PAD.top + innerH - ((v - minValue) / (maxValue - minValue)) * innerH;

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const guideLine = (level: number, stroke: string, dash: string) => (
    <line
      x1={PAD.left}
      y1={y(level)}
      x2={W - PAD.right}
      y2={y(level)}
      stroke={stroke}
      strokeWidth={1.25}
      strokeDasharray={dash}
    />
  );

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Weekly measured values against the sealed target"
        className="w-full"
      >
        {[0.25, 0.5, 0.75].map((f) => {
          const v = maxValue * f;
          return (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke={INK.grid}
                strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize="10"                fill={INK.axis}>
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {baseline != null && (
          <g>
            {guideLine(baseline, INK.baseline, "6 4")}
            <text
              x={W - PAD.right - 2}
              y={y(baseline) - 5}
              textAnchor="end"
              fontSize="10"
              fill={INK.baseline}
            >
              baseline {baseline} {unit}
            </text>
          </g>
        )}
        {target != null && (
          <g>
            {guideLine(target, INK.target, "2 4")}
            <text
              x={PAD.left + 2}
              y={y(target) - 5}
              fontSize="10"
              fill={INK.target}
            >
              target {target} {unit}
            </text>
          </g>
        )}
        {values.length > 1 && (
          <polyline points={points} fill="none" stroke={INK.series} strokeWidth={1.75} />
        )}
        {values.map((v, i) => (
          <g key={labels[i]}>
            <circle cx={x(i)} cy={y(v)} r={3.4} fill={INK.series} />
            <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="10.5" fontWeight={600}>
              {v}
            </text>
          </g>
        ))}
        {labels.map((label, i) => (
          <text
            key={label}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill={INK.axis}
          >
            {label}
          </text>
        ))}
      </svg>
      {showResult && (
        <p className="mt-2 text-13">
          <span className={showResult.met ? "font-semibold text-ok" : "font-semibold text-danger"}>
            {showResult.met ? "MET" : "NOT MET"}
          </span>
          <span className="text-muted">
            : observed {showResult.value} {unit} against the sealed target. Calculated
            from stored samples; not a formal verdict.
          </span>
        </p>
      )}
    </div>
  );
}
