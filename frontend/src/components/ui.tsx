import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Shared style tokens (used by Table/rows so every table, divider and
 * label across the product reads identically).
 * ------------------------------------------------------------------ */

export const tableCls = "w-full border-collapse text-13 leading-snug";
export const thCls =
  "border-b border-line bg-paper/60 px-3 py-2 text-left text-11 font-medium uppercase tracking-[0.08em] text-muted";
export const tdCls = "border-b border-line px-3 py-2.5 align-top text-ink";
export const micro = "text-11 font-medium uppercase tracking-[0.12em] text-muted";
export const h2Cls = "text-20 font-semibold tracking-tight text-ink";

/* One shared field style: inputs, selects, and textareas read and behave
 * identically everywhere. Native cursor (not pointer) for typing fields;
 * selects add cursor-pointer at the call site. */
export const fieldCls =
  "w-full border border-line bg-surface px-3 py-2 text-13 text-ink placeholder:text-muted";

export const OPERATOR_TEXT: Record<string, string> = {
  lte: "\u2264",
  gte: "\u2265",
  lt: "<",
  gt: ">",
};

export function opText(op: string): string {
  return OPERATOR_TEXT[op] ?? op;
}

export function shortHash(value: string | null | undefined, length = 10): string {
  if (!value) return "";
  return value.slice(0, length);
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtMoney(raw: string | number): string {
  const n = typeof raw === "number" ? raw.toFixed(0) : raw;
  return `\u20B9${n}`;
}

/* ------------------------------------------------------------------ *
 * PageHeader: the one first block on every route page.
 * ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="border-b border-line pb-6">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-[760px]">
          {eyebrow && <p className={`mb-2 ${micro}`}>{eyebrow}</p>}
          <h1 className="text-24 font-semibold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-2 text-14 leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {meta && (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 text-13 text-muted">
          {meta}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */

type ButtonTone = "primary" | "secondary" | "danger" | "plain";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm text-13 font-medium transition-colors disabled:cursor-not-allowed";

const BTN_TONES: Record<ButtonTone, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong active:bg-accent-strong disabled:bg-line disabled:text-muted",
  secondary:
    "border border-line bg-surface text-ink hover:border-ink/40 active:bg-paper disabled:text-muted",
  danger:
    "border border-danger/30 bg-surface text-danger hover:bg-danger-bg active:bg-danger-bg disabled:text-muted",
  plain: "text-accent hover:text-accent-strong active:text-accent-strong disabled:text-muted",
};

const BTN_SIZES = {
  sm: "min-h-9 px-3.5 py-2",
  md: "min-h-10 px-4 py-2.5",
};

export function Button({
  tone = "primary",
  size = "md",
  disabled,
  busy,
  className = "",
  onClick,
  children,
  title,
}: {
  tone?: ButtonTone;
  size?: "sm" | "md";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      className={`${BTN_BASE} ${BTN_TONES[tone]} ${BTN_SIZES[size]} ${className}`}
    >
      {busy && (
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * StatusMark: label always, color never alone.
 * ------------------------------------------------------------------ */

export type StatusTone = "ok" | "warn" | "danger" | "neutral" | "current";

const STATUS_DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  neutral: "bg-line",
  current: "bg-accent",
};

const STATUS_LABEL: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-muted",
  current: "text-accent",
};

export function StatusMark({
  label,
  tone = "neutral",
  meta,
  className = "",
}: {
  label: string;
  tone?: StatusTone;
  meta?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-start gap-2 text-13 ${className}`}>
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 ${STATUS_DOT[tone]}`} />
      <span className={STATUS_LABEL[tone]}>
        {label}
        {meta && <span className="ml-2 text-muted">{meta}</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Notice
 * ------------------------------------------------------------------ */

export type NoticeTone = "ok" | "fail" | "warn" | "info";

const NOTICES: Record<NoticeTone, { bar: string; text: string }> = {
  ok: { bar: "bg-ok", text: "text-ink" },
  fail: { bar: "bg-danger", text: "text-danger" },
  warn: { bar: "bg-warn", text: "text-warn" },
  info: { bar: "bg-accent", text: "text-ink" },
};

export function Notice({
  tone = "info",
  title,
  children,
  actions,
  className = "",
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const style = NOTICES[tone];
  return (
    <div
      role={tone === "fail" ? "alert" : "status"}
      className={`flex gap-3 border border-line bg-surface px-4 py-3 text-13 leading-relaxed ${className}`}
    >
      <span aria-hidden className={`w-1 shrink-0 ${style.bar}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="mb-1 font-medium text-ink">{title}</p>}
        <div className={style.text}>{children}</div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Section
 * ------------------------------------------------------------------ */

export function Section({
  id,
  kicker,
  title,
  subtitle,
  action,
  children,
}: {
  id?: string;
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className={`mb-1 ${micro}`}>{kicker}</p>}
          <h2 className={h2Cls}>{title}</h2>
          {subtitle && (
            <p className="mt-1.5 max-w-3xl text-13 leading-relaxed text-muted">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Definition list
 * ------------------------------------------------------------------ */

export function DefList({
  rows,
  columns = 2,
}: {
  rows: [string, ReactNode][];
  columns?: 1 | 2 | 3;
}) {
  const cols =
    columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <dl className={`grid grid-cols-1 gap-x-8 gap-y-3 ${cols}`}>
      {rows.map(([key, value]) => (
        <div key={key} className="border-b border-line pb-2 last:border-b-0">
          <dt className={`${micro} mb-1`}>{key}</dt>
          <dd className="text-13 text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Data states: one loading / error / empty vocabulary everywhere.
 * ------------------------------------------------------------------ */

export function DataState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  if (loading) {
    return <p className="py-8 text-center text-13 text-muted" aria-busy="true">Loading...</p>;
  }
  if (error) {
    return (
      <Notice
        tone="fail"
        title="Could not load this view"
        actions={onRetry ? <Button tone="secondary" size="sm" onClick={onRetry}>Retry</Button> : undefined}
      >
        {error}
      </Notice>
    );
  }
  return <>{children}</>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-line bg-paper/50 px-6 py-10 text-center">
      <p className="text-14 font-medium text-ink">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-13 text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table frame: shared scroll wrapper for wide tables on list pages.
 * ------------------------------------------------------------------ */

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto border border-line bg-surface">{children}</div>;
}
