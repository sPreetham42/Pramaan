import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useData, useAction } from "../lib/hooks";
import { useRole } from "../AppShell";
import { navigate } from "../router";
import DemoControls from "../components/DemoControls";
import TrendChart from "../components/TrendChart";
import { CompareBars, StepBar, type CompareRow } from "../components/charts";
import {
  Button,
  DefList,
  Notice,
  Section,
  StatusMark,
  fieldCls,
  fmtDate,
  fmtMoney,
  micro,
  opText,
  shortHash,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { Challenge, PilotDetail } from "../types";

/* ------------------------------------------------------------------ *
 * Stage model: the whole journey as an ordered list of gates.
 * ------------------------------------------------------------------ */

const JOURNEY_DEFS: {
  key: string;
  label: string;
  blurb: string;
  anchor: string;
  done: (d: Dones) => boolean;
}[] = [
  { key: "challenge", label: "Challenge", blurb: "Problem, KPI target, and eligibility rules published.", anchor: "challenge", done: (d) => d.challenge },
  { key: "discovery", label: "Discovery & evaluation", blurb: "Applicants screened and scored against the published rules.", anchor: "applicants", done: (d) => d.discovery && d.screening && d.evaluation },
  { key: "selection", label: "Selection", blurb: "The strongest applicant is chosen for a pilot.", anchor: "applicants", done: (d) => d.selection },
  { key: "protocol", label: "Locked criteria", blurb: "Success criteria approved and sealed before any outcome.", anchor: "protocol", done: (d) => d.protocol && d.approval && d.seal },
  { key: "run", label: "Pilot run", blurb: "The intervention runs and weekly samples are recorded.", anchor: "run", done: (d) => d.run && d.measurement },
  { key: "evidence", label: "Evidence verified", blurb: "Every artifact is verified against its recorded hash.", anchor: "evidence", done: (d) => d.verification },
  { key: "validation", label: "Validation", blurb: "An independent validator signs off on the result.", anchor: "validation", done: (d) => d.validation },
  { key: "verdict", label: "Verdict & record", blurb: "MET or NOT MET, then a reusable Verified Pilot Record.", anchor: "verdict", done: (d) => d.verdict && d.record },
];

interface Dones {
  challenge: boolean; discovery: boolean; screening: boolean; evaluation: boolean;
  selection: boolean; protocol: boolean; approval: boolean; seal: boolean;
  run: boolean; measurement: boolean; verification: boolean; validation: boolean;
  verdict: boolean; record: boolean;
}

function computeDones(pilot: PilotDetail | null, hasApps: boolean): Dones {
  const status = pilot?.status;
  const protocols = pilot?.protocols ?? [];
  const evidenceOk =
    pilot != null &&
    pilot.evidence.length > 0 &&
    pilot.evidence.every((e) => e.latest_check?.ok === true);
  return {
    challenge: true,
    discovery: hasApps,
    screening: hasApps,
    evaluation: hasApps,
    selection: pilot != null,
    protocol: protocols.length > 0,
    approval: protocols.some((pr) => pr.status === "APPROVED" || pr.status === "SEALED"),
    seal: pilot?.sealed_protocol != null,
    run: pilot?.started_at != null && status !== "SELECTED" && status !== "SEALED",
    measurement: status === "COMPLETED" || status === "VERDICTED",
    verification: evidenceOk,
    validation: (pilot?.validations ?? []).some((v) => v.status === "APPROVED"),
    verdict: pilot?.verdict != null,
    record: pilot?.vpr != null,
  };
}

type Stage = "done" | "current" | "todo";

function stageTone(s: Stage): "ok" | "current" | "neutral" {
  if (s === "done") return "ok";
  if (s === "current") return "current";
  return "neutral";
}

function journeyStages(dones: Dones): { key: string; label: string; state: Stage }[] {
  let currentFound = false;
  return JOURNEY_DEFS.map((d) => {
    const done = d.done(dones);
    if (done) return { key: d.key, label: d.label, state: "done" as Stage };
    if (!currentFound) {
      currentFound = true;
      return { key: d.key, label: d.label, state: "current" as Stage };
    }
    return { key: d.key, label: d.label, state: "todo" as Stage };
  });
}

/**
 * One journey step. Collapsed it is a one-line summary of what the step
 * proves; expanded it shows the full section. The page leads with the
 * outcome (verdict) for completed pilots and collapses the rest.
 */
function JourneyStep({
  id,
  kicker,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <div id={id} className="border-t border-line pt-6">
        <button type="button" onClick={onToggle} aria-expanded={false} className="w-full text-left">
          <span className={`${micro} mb-1 block`}>{kicker}</span>
          <span className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-16 font-semibold text-ink">{title}</span>
            <span className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-line bg-surface px-3.5 py-2 text-13 font-medium text-ink">
              Expand step <span aria-hidden="true">{"\u203A"}</span>
            </span>
          </span>
          <span className="mt-1 block text-13 leading-relaxed text-muted">{summary}</span>
        </button>
      </div>
    );
  }
  return (
    <div id={id}>
      <div className="flex justify-end">
        <Button tone="secondary" size="sm" onClick={onToggle}>
          Collapse step
        </Button>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function JourneyPage({ challengeId, pilotId }: { challengeId?: number; pilotId?: number }) {
  const { role } = useRole();

  const pilotRemote = useData<PilotDetail | null>(
    pilotId ? `pilot-${pilotId}` : null,
    async () => (pilotId ? api.pilots.get(pilotId) : null),
  );
  const resolvedChallengeId = challengeId ?? pilotRemote.data?.challenge.id ?? null;
  const challengeRemote = useData<Challenge | null>(
    resolvedChallengeId ? `challenge-${resolvedChallengeId}` : null,
    async () => (resolvedChallengeId ? api.challenges.get(resolvedChallengeId) : null),
  );

  const pilot = pilotRemote.data;
  const challenge = challengeRemote.data;
  const hasApps = (challenge?.applications?.length ?? 0) > 0;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (expanded.size === 0 && challenge) {
      const idx = journeyStages(computeDones(pilot, hasApps)).findIndex((s) => s.state === "current");
      const initial = pilot?.verdict ? "verdict" : idx >= 0 ? JOURNEY_DEFS[idx].anchor : "verdict";
      setExpanded(new Set([initial]));
    }
  }, [challenge, pilot, hasApps, expanded.size]);

  if (!challenge) {
    if (challengeRemote.loading || pilotRemote.loading) {
      return <p className="text-13 text-muted">Loading the journey...</p>;
    }
    return (
      <p className="text-13 text-danger">
        {challengeRemote.error ?? pilotRemote.error ?? "Challenge not found."}
      </p>
    );
  }

  const apps = challenge.applications ?? [];
  const dones = computeDones(pilot, hasApps);
  const stages = journeyStages(dones);
  const currentIdx = stages.findIndex((s) => s.state === "current");
  const currentStage = currentIdx >= 0 ? JOURNEY_DEFS[currentIdx] : null;

  const sealed = pilot?.sealed_protocol;
  const approvedValidation = (pilot?.validations ?? []).find((v) => v.status === "APPROVED");
  const selectedApp = apps.find((a) => a.status === "SELECTED");
  const sampleValues = (pilot?.measurements ?? []).map((m) => m.value);
  const allEvidenceOk =
    pilot != null && pilot.evidence.length > 0 && pilot.evidence.every((e) => e.latest_check?.ok === true);

  const summaries = {
    challenge: `KPI target ${opText(challenge.kpi.target_operator)} ${challenge.kpi.target_value} ${challenge.kpi.unit} against a ${challenge.kpi.baseline_value} ${challenge.kpi.unit} baseline; eligibility and evidence rules published with the problem.`,
    applicants: apps.length
      ? `${apps.length} applicants screened and scored on published criteria${selectedApp ? `; ${selectedApp.startup.name} selected` : ""}.`
      : "This challenge entered through proof reuse, so no competitive application round ran here.",
    plan: pilot ? `${pilot.milestones.length} milestones with staged payments; ${pilot.risks.length} named risks with mitigations, agreed before the run.` : "",
    protocol: sealed
      ? `Locked ${fmtDate(sealed.sealed_at)} (v${sealed.version}) before the pilot started; target ${opText(sealed.target_operator)} ${sealed.target_value} ${sealed.unit}.`
      : pilot?.current_protocol
        ? "Drafted from the challenge KPI; awaiting approval and seal."
        : "Success criteria are defined and sealed before any result is known.",
    run: sampleValues.length
      ? `Weekly samples: ${sampleValues.join(" \u2192 ")} ${pilot?.measurements[0]?.unit ?? ""}.`
      : "No samples yet; the pilot runs only against locked criteria.",
    evidence: pilot ? `${pilot.evidence.length} artifacts, ${allEvidenceOk ? "all hash-verified" : "verification pending"}.` : "",
    validation: approvedValidation
      ? `Signed off by ${approvedValidation.validator_name} on ${fmtDate(approvedValidation.decided_at)}.`
      : "Awaiting independent sign-off after the measurement window closes.",
    verdict: pilot?.verdict
      ? `${pilot.verdict.outcome}: observed ${pilot.verdict.observed_value} ${pilot.verdict.unit} vs target ${opText(pilot.verdict.target_operator)} ${pilot.verdict.target_value} ${pilot.verdict.unit}${pilot.vpr ? `; ${pilot.vpr.reference} issued` : ""}.`
      : "Not issued yet: it needs a closed pilot, verified evidence, and approved validation.",
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const goGate = (def: (typeof JOURNEY_DEFS)[number]) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(def.anchor);
      return next;
    });
    requestAnimationFrame(() => goAnchor(def.anchor));
  };

  const refreshAll = () => {
    pilotRemote.refresh();
    challengeRemote.refresh();
  };

  return (
    <div className="space-y-8">
      {/* Journey header */}
      <div className="border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <p className={`${micro} text-accent`}>{challenge.department.name}</p>
            <h1 className="mt-1 text-24 font-semibold tracking-tight">{challenge.title}</h1>
          </div>
          <div className="flex flex-col items-end gap-2 text-right text-12 text-muted">
            <span className="border border-line bg-surface px-2 py-1 font-medium text-ink">
              {pilot ? `Pilot ${pilot.status.replace(/_/g, " ")}` : "Challenge open"}
            </span>
            {pilot?.vpr && (
              <Button tone="plain" onClick={() => navigate(`/records/${pilot.vpr!.id}`)}>
                Open {pilot.vpr.reference}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
          {JOURNEY_DEFS.map((def, i) => {
            const st = stages[i];
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => goGate(def)}
                className="-my-1 py-2 pr-2 text-left hover:underline"
                title={def.blurb}
              >
                <StatusMark tone={stageTone(st.state)} label={`${String(i + 1).padStart(2, "0")} ${def.label}`} />
              </button>
            );
          })}
        </div>
        {currentStage && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-l-2 border-accent bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className={`${micro} text-accent`}>Next up</p>
              <p className="mt-0.5 text-14">
                <span className="font-semibold">{currentStage.label}.</span>{" "}
                <span className="text-muted">{currentStage.blurb}</span>
              </p>
            </div>
            <Button tone="primary" onClick={() => goGate(currentStage)}>
              Go to this step
            </Button>
          </div>
        )}
        {!currentStage && (
          <Notice tone="ok" className="mt-5">
            Journey complete: the Verified Pilot Record is issued and reusable by
            other departments.
          </Notice>
        )}
      </div>

      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------ narrative */}
        <div className="min-w-0 space-y-6">
          <JourneyStep
            id="challenge"
            kicker="01"
            title="The government problem"
            summary={summaries.challenge}
            open={expanded.has("challenge")}
            onToggle={() => toggle("challenge")}
          >
            <ChallengeSection challenge={challenge} />
          </JourneyStep>
          <JourneyStep
            id="applicants"
            kicker="02"
            title="Competitive selection"
            summary={summaries.applicants}
            open={expanded.has("applicants")}
            onToggle={() => toggle("applicants")}
          >
            <ApplicantsSection
              challenge={challenge}
              pilot={pilot}
              role={role}
              onSelected={() => {
                refreshAll();
                window.location.reload();
              }}
            />
          </JourneyStep>
          {pilot && (
            <JourneyStep
              id="plan"
              kicker="03"
              title="The pilot plan"
              summary={summaries.plan}
              open={expanded.has("plan")}
              onToggle={() => toggle("plan")}
            >
              <PlanSection pilot={pilot} />
            </JourneyStep>
          )}
          {pilot && (
            <JourneyStep
              id="protocol"
              kicker="04"
              title="Evaluation protocol"
              summary={summaries.protocol}
              open={expanded.has("protocol")}
              onToggle={() => toggle("protocol")}
            >
              <ProtocolSection pilot={pilot} role={role} onChanged={refreshAll} />
            </JourneyStep>
          )}
          {pilot && (
            <JourneyStep
              id="run"
              kicker="05"
              title="Pilot execution and measured results"
              summary={summaries.run}
              open={expanded.has("run")}
              onToggle={() => toggle("run")}
            >
              <RunSection pilot={pilot} role={role} onChanged={refreshAll} />
            </JourneyStep>
          )}
          {pilot && (
            <JourneyStep
              id="evidence"
              kicker="06"
              title="Evidence and integrity"
              summary={summaries.evidence}
              open={expanded.has("evidence")}
              onToggle={() => toggle("evidence")}
            >
              <EvidenceSection pilot={pilot} role={role} onChanged={refreshAll} />
            </JourneyStep>
          )}
          {pilot && (
            <JourneyStep
              id="validation"
              kicker="07"
              title="Independent validation"
              summary={summaries.validation}
              open={expanded.has("validation")}
              onToggle={() => toggle("validation")}
            >
              <ValidationSection pilot={pilot} role={role} onChanged={refreshAll} />
            </JourneyStep>
          )}
          {pilot && (
            <JourneyStep
              id="verdict"
              kicker="08"
              title="Deterministic verdict and verified record"
              summary={summaries.verdict}
              open={expanded.has("verdict")}
              onToggle={() => toggle("verdict")}
            >
              <VerdictSection pilot={pilot} role={role} onChanged={refreshAll} />
            </JourneyStep>
          )}
        </div>

        {/* ------------------------------------------------ side rail */}
        <aside className="xl:sticky xl:top-6">
          <DemoControls pilot={pilot} onMutated={refreshAll} />
        </aside>
      </div>
    </div>
  );
}

function goAnchor(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------------ *
 * Section 1: the challenge
 * ------------------------------------------------------------------ */

function ChallengeSection({ challenge }: { challenge: Challenge }) {
  const kpi = challenge.kpi;
  return (
    <Section kicker="01" title="The government problem">
      <div className="space-y-5">
        <DefList
          columns={2}
          rows={[
            ["Problem", challenge.problem],
            ["Expected outcome", challenge.expected_outcome],
            ["KPI to demonstrate", `${kpi.metric} (current baseline ${kpi.baseline_value} ${kpi.unit})`],
            ["Pilot target", `${opText(kpi.target_operator)} ${kpi.target_value} ${kpi.unit} within ${challenge.duration_days} days`],
          ]}
        />
        {challenge.evidence_requirements.length > 0 && (
          <div>
            <p className={`${micro} mb-2`}>Evidence required during the pilot</p>
            <ul className="space-y-1 text-13">
              {challenge.evidence_requirements.map((e) => (
                <li key={e.label} className="flex gap-2">
                  <span className="font-medium text-ink">{e.label}:</span>
                  <span className="text-muted">{e.requirement}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p className={`${micro} mb-2`}>Standard structure</p>
          <p className="max-w-3xl text-13 leading-relaxed text-muted">
            The department does not start from a blank page: the problem
            statement, evaluation criteria, pilot expectations, and the
            procurement pathway below are the standard structure every
            published challenge follows.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 2: applicants, screening, evaluation, selection
 * ------------------------------------------------------------------ */

function ApplicantsSection({
  challenge,
  pilot,
  role,
  onSelected,
}: {
  challenge: Challenge;
  pilot: PilotDetail | null;
  role: string;
  onSelected: () => void;
}) {
  const selectAction = useAction();
  const [scopeText, setScopeText] = useState("");
  const applications = challenge.applications ?? [];
  const canSelect = pilot == null && role === "government";

  if (applications.length === 0) {
    return (
      <Section
        kicker="02"
        title="Applicants"
        subtitle="This challenge entered through proof reuse, so no competitive application round ran here."
      >
        <p className="text-13 text-muted">
          {pilot
            ? `${pilot.startup.name} is running under criteria inherited from a Verified Pilot Record.`
            : "No applications."}
        </p>
      </Section>
    );
  }

  return (
    <Section
      kicker="02"
      title="Competitive selection: three startups, one transparent record"
      subtitle="Eligibility screening and expert evaluation with visible reasons. Selection happens here, on evidence, before any pilot runs."
      action={
        applications.some((a) => a.status === "SELECTED") ? (
          <span className="text-12 font-medium text-ok">
            Selection recorded
          </span>
        ) : null
      }
    >
      {selectAction.error && (
        <div className="mb-4">
          <Notice tone="fail">{selectAction.error}</Notice>
        </div>
      )}
      <div className="overflow-x-auto border border-line">
        <div className="overflow-x-auto">
          <table className={tableCls}>
          <thead>
            <tr>
              <th className={thCls}>Startup</th>
              <th className={thCls}>Eligibility</th>
              <th className={thCls}>Evaluation</th>
              <th className={thCls}>Decision</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const best = a.evaluations.length
                ? Math.max(...a.evaluations.map((e) => e.score))
                : null;
              const selected = a.status === "SELECTED";
              return (
                <tr key={a.id} className={selected ? "bg-ok-bg/60" : undefined}>
                  <td className={`${tdCls} min-w-[220px]`}>
                    <p className="font-semibold">
                      {a.startup.name}
                      {selected && <span className="ml-2 text-11 font-medium uppercase text-ok">Selected</span>}
                    </p>
                    <p className="max-w-[320px] text-muted">{a.startup.tagline}</p>
                  </td>
                  <td className={tdCls}>
                    {a.eligibility.eligible ? (
                      <StatusMark tone="ok" label="Eligible" />
                    ) : (
                      <StatusMark tone="danger" label="Not eligible" />
                    )}
                    <div className="mt-1 max-w-[240px] text-12 leading-snug text-muted">
                      {a.eligibility.checks.filter((c) => !c.met).map((c) => c.check).join("; ") ||
                        (a.eligibility.checks.length ? "All published checks met" : "Not screened")}
                    </div>
                  </td>
                  <td className={tdCls}>
                    {best != null ? (
                      <>
                        <span className="mono font-semibold">{best.toFixed(1)}</span>
                        <span className="text-muted"> / 5 best panel score</span>
                        <p className="text-12 text-muted">{a.evaluations.length} panel evaluation(s)</p>
                      </>
                    ) : (
                      <span className="text-muted">No evaluation (not eligible)</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {a.status === "SELECTED" ? (
                      <StatusMark tone="ok" label="Selected for pilot" />
                    ) : a.status === "NOT_SELECTED" ? (
                      <StatusMark tone="neutral" label="Not selected after comparison" />
                    ) : a.status === "INELIGIBLE" ? (
                      <StatusMark tone="danger" label="Screened out" />
                    ) : (
                      <StatusMark tone="current" label="Under review" />
                    )}
                  </td>
                  <td className={tdCls}>
                    {canSelect && a.eligibility.eligible && best != null && (
                      <div className="min-w-[260px]">
                        {!scopeText && (
                          <p className="mb-1.5 text-12 text-muted">
                            Select to run the pilot. Criteria are drafted next and sealed before the run.
                          </p>
                        )}
                        <input
                          className={`${fieldCls} mb-2`}
                          placeholder="Pilot scope (e.g. two hospitals, four weeks)"
                          value={scopeText}
                          onChange={(e) => setScopeText(e.target.value)}
                        />
                        <Button
                          busy={selectAction.busy}
                          onClick={async () => {
                            const ok = await selectAction.run(() =>
                              api.challenges.selectPilot(challenge.id, a.startup.id, scopeText || undefined),
                            );
                            if (ok) onSelected();
                          }}
                        >
                          Select {a.startup.name.split(" ")[0]} for pilot
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
          </div>
      </div>

      <div className="mt-6">
        <p className={`${micro} mb-3`}>Open any applicant for full screening and scoring detail</p>
        <div className="space-y-2">
          {applications.map((a) => (
            <details key={a.id} className="border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-2.5 text-13 font-medium">
                {a.startup.name}: eligibility checks and per-dimension scores
              </summary>
              <div className="space-y-4 border-t border-line px-4 py-4">
                <div>
                  <p className={`${micro} mb-2`}>Eligibility</p>
                  <div className="overflow-x-auto">
          <table className={tableCls}>
                    <tbody>
                      {a.eligibility.checks.map((c) => (
                        <tr key={c.check}>
                          <td className={tdCls}>{c.check}</td>
                          <td className={`${tdCls} w-24`}>
                            <StatusMark tone={c.met ? "ok" : "danger"} label={c.met ? "Met" : "Not met"} />
                          </td>
                          <td className={`${tdCls} text-muted`}>{c.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
          </div>
                </div>
                {a.evaluations.map((e) => (
                  <div key={e.id}>
                    <p className={`${micro} mb-2`}>
                      {e.evaluator_name} &middot; {e.evaluator_role} &middot; overall {e.score.toFixed(1)} / 5
                    </p>
                    <div className="overflow-x-auto">
          <table className={tableCls}>
                      <thead>
                        <tr>
                          <th className={thCls}>Dimension</th>
                          <th className={thCls}>Score</th>
                          <th className={thCls}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.dimensions.map((d) => (
                          <tr key={d.dimension}>
                            <td className={tdCls}>{d.dimension}</td>
                            <td className={`${tdCls} mono`}>{d.score.toFixed(1)} / 5</td>
                            <td className={`${tdCls} max-w-[480px] text-muted`}>{d.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
          </div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 3: pilot plan (milestones and risks)
 * ------------------------------------------------------------------ */

function PlanSection({ pilot }: { pilot: PilotDetail }) {
  return (
    <Section
      kicker="03"
      title="The pilot plan"
      subtitle="Milestone-based execution with staged payments, plus named risks with mitigations. All of this is agreed before the pilot runs."
    >
      <div className="space-y-8">
        <div>
          <p className={`${micro} mb-3`}>Scope</p>
          <p className="max-w-3xl text-13 leading-relaxed">{pilot.scope}</p>
        </div>
        <div>
          <p className={`${micro} mb-3`}>Milestones and payment plan</p>
          <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Milestone</th>
                <th className={thCls}>Covers</th>
                <th className={thCls}>Value</th>
                <th className={thCls}>Progress</th>
                <th className={thCls}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {pilot.milestones.map((m) => (
                <tr key={m.seq}>
                  <td className={`${tdCls} font-medium`}>{m.seq}. {m.title}</td>
                  <td className={`${tdCls} max-w-[340px] text-muted`}>{m.description}</td>
                  <td className={`${tdCls} mono`}>{fmtMoney(m.amount)}</td>
                  <td className={tdCls}>
                    {m.status === "COMPLETED" ? (
                      <StatusMark tone="ok" label="Completed" />
                    ) : (
                      <StatusMark tone="neutral" label="Pending" />
                    )}
                  </td>
                  <td className={tdCls}>
                    {m.payment_status === "RELEASED" ? (
                      <StatusMark tone="ok" label="Released" />
                    ) : m.payment_status === "PAYMENT_ELIGIBLE" ? (
                      <StatusMark tone="warn" label="Eligible" />
                    ) : (
                      <StatusMark tone="neutral" label="Pending" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-12 text-muted">
            Payments become eligible as milestones complete and are released
            against independent validation (and, for the final milestone, the
            verdict). Prototype representation of milestone-based contracting.
          </p>
          <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
            <StepBar
              segments={pilot.milestones.length}
              done={pilot.milestones.filter((m) => m.status === "COMPLETED").length}
              label="Milestones completed"
            />
            <StepBar
              segments={pilot.milestones.length}
              done={pilot.milestones.filter((m) => m.payment_status === "RELEASED").length}
              label="Payments released"
            />
          </div>
        </div>
        <div>
          <p className={`${micro} mb-3`}>Risk register</p>
          <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Risk</th>
                <th className={thCls}>Description</th>
                <th className={thCls}>Mitigation</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pilot.risks.map((r) => (
                <tr key={r.id}>
                  <td className={`${tdCls} font-medium`}>{r.category}</td>
                  <td className={`${tdCls} max-w-[300px] text-muted`}>{r.description}</td>
                  <td className={`${tdCls} max-w-[340px] text-muted`}>{r.mitigation}</td>
                  <td className={tdCls}>
                    {r.status === "MITIGATED" ? (
                      <StatusMark tone="ok" label="Mitigated" />
                    ) : r.status === "MONITORED" ? (
                      <StatusMark tone="warn" label="Monitored" />
                    ) : (
                      <StatusMark tone="danger" label="Identified" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 4: protocol lifecycle (the lock)
 * ------------------------------------------------------------------ */

function ProtocolSection({
  pilot,
  role,
  onChanged,
}: {
  pilot: PilotDetail;
  role: string;
  onChanged: () => void;
}) {
  const approveAction = useAction();
  const sealAction = useAction();
  const saveAction = useAction();
  const protocol = pilot.current_protocol ?? null;
  const sealed = pilot.sealed_protocol;
  const isGov = role === "government";
  const [form, setForm] = useState({
    metric: protocol?.metric ?? "",
    target_operator: protocol?.target_operator ?? "lte",
    target_value: protocol?.target_value ?? 25,
    unit: protocol?.unit ?? "minutes",
    duration_days: protocol?.duration_days ?? 28,
    sample_interval: protocol?.sample_interval ?? "weekly",
    measurement_method: protocol?.measurement_method ?? "",
  });

  const showForm = isGov && pilot.status === "SELECTED" && !sealed && protocol?.status !== "APPROVED";
  const canApprove = isGov && pilot.status === "SELECTED" && protocol?.status === "DRAFT" && !sealed;
  const canSeal = isGov && pilot.status === "SELECTED" && protocol?.status === "APPROVED" && !sealed;

  const lockReason =
    pilot.status === "SEALED"
      ? "Sealed before the pilot started. The backend refuses every edit; any new criteria requires a new protocol version."
      : pilot.status !== "SELECTED"
        ? "Criteria are locked from this stage onward."
        : protocol?.status === "APPROVED"
          ? "Approved by the department. Editing is closed until sealed; any change requires a new version."
          : null;

  return (
    <Section
      kicker="04"
      title="Evaluation protocol: criteria committed before the outcome"
      subtitle="DRAFT to APPROVED to SEALED. Once sealed, this page and the server show the same locked values, and no edit is accepted."
    >
      {sealed ? (
        <div className="space-y-4">
          <Notice tone="ok">
            <span className="font-semibold">Criteria locked before the pilot.</span>{" "}
            Protocol v{sealed.version} was sealed {fmtDate(sealed.sealed_at)} by{" "}
            {sealed.sealed_by}. Content hash{" "}
            <span className="mono">{shortHash(sealed.content_hash, 18)}</span>
          </Notice>
          <CriteriaTable title="Sealed criteria" protocol={sealed} />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-13">
            {(["DRAFT", "APPROVED", "SEALED"] as const).map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span
                  className={`border px-2 py-1 font-medium ${
                    protocol?.status === s
                      ? "border-accent bg-surface text-accent"
                      : s === "DRAFT"
                        ? "border-line text-muted"
                        : "border-line text-muted"
                  }`}
                >
                  {s}
                </span>
                {s !== "SEALED" && <span className="text-line">{"\u2192"}</span>}
              </span>
            ))}
            <span className="ml-3 text-muted">
              {protocol?.status === "DRAFT"
                ? "Drafting. The values shown here are the server state."
                : protocol?.status === "APPROVED"
                  ? "Approved and awaiting the seal."
                  : "No criteria drafted yet."}
            </span>
          </div>

          {protocol && <CriteriaTable title="Current criteria" protocol={protocol} />}
          {!protocol && (
            <p className="text-13 text-muted">
              Define the success criteria below. They default to the challenge KPI.
            </p>
          )}

          {showForm && (
            <div className="mt-5 border border-line bg-surface p-4">
              <p className={`${micro} mb-3`}>Draft criteria (editable until approval)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Metric" wide>
                  <input
                    className={fieldCls}
                    value={form.metric}
                    onChange={(e) => setForm({ ...form, metric: e.target.value })}
                  />
                </Field>
                <Field label="Operator">
                  <select
                    className={`${fieldCls} cursor-pointer`}
                    value={form.target_operator}
                    onChange={(e) => setForm({ ...form, target_operator: e.target.value })}
                  >
                    <option value="lte">{"\u2264"} (at most)</option>
                    <option value="lt">{"\u003c"} (less than)</option>
                    <option value="gte">{"\u2265"} (at least)</option>
                    <option value="gt">{"\u003e"} (greater than)</option>
                  </select>
                </Field>
                <Field label="Target value">
                  <input
                    type="number"
                    className={fieldCls}
                    value={form.target_value}
                    onChange={(e) => setForm({ ...form, target_value: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Unit">
                  <input
                    className={fieldCls}
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </Field>
                <Field label="Duration (days)">
                  <input
                    type="number"
                    className={fieldCls}
                    value={form.duration_days}
                    onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Sample interval">
                  <input
                    className={fieldCls}
                    value={form.sample_interval}
                    onChange={(e) => setForm({ ...form, sample_interval: e.target.value })}
                  />
                </Field>
                <Field label="Measurement method" wide>
                  <textarea
                    className={fieldCls}
                    rows={2}
                    value={form.measurement_method}
                    onChange={(e) => setForm({ ...form, measurement_method: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  busy={saveAction.busy}
                  onClick={async () => {
                    const ok = await saveAction.run(() =>
                      api.pilots.saveProtocol(pilot.id, {
                        ...form,
                        target_value: Number(form.target_value),
                        duration_days: Number(form.duration_days),
                      }),
                    );
                    if (ok) onChanged();
                  }}
                >
                  Save draft
                </Button>
                {saveAction.error && <Notice tone="fail">{saveAction.error}</Notice>}
              </div>
            </div>
          )}

          {lockReason && <Notice tone="info" className="mt-4">{lockReason}</Notice>}

          <div className="mt-5 flex flex-wrap gap-3">
            {canApprove && (
              <Button
                busy={approveAction.busy}
                onClick={async () => {
                  if (await approveAction.run(() => api.pilots.approveProtocol(pilot.id))) onChanged();
                }}
              >
                Approve criteria
              </Button>
            )}
            {canSeal && (
              <Button
                tone="primary"
                busy={sealAction.busy}
                onClick={async () => {
                  if (await sealAction.run(() => api.pilots.sealProtocol(pilot.id))) onChanged();
                }}
              >
                Seal criteria (lock before pilot)
              </Button>
            )}
            {!isGov && <p className="self-center text-12 text-muted">Action requires the Government role.</p>}
          </div>
          {(approveAction.error || sealAction.error) && (
            <div className="mt-3">
              <Notice tone="fail">{approveAction.error ?? sealAction.error}</Notice>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function CriteriaTable({ title, protocol }: { title: string; protocol: NonNullable<PilotDetail["current_protocol"]> }) {
  return (
    <div>
      <p className={`${micro} mb-2`}>{title}</p>
      <div className="overflow-x-auto">
          <table className={tableCls}>
        <tbody>
          <tr>
            <td className={tdCls}>Metric</td>
            <td className={`${tdCls} font-medium`}>{protocol.metric}</td>
            <td className={tdCls}>Target</td>
            <td className={`${tdCls} font-medium`}>
              {opText(protocol.target_operator)} {protocol.target_value} {protocol.unit}
            </td>
          </tr>
          <tr>
            <td className={tdCls}>Baseline</td>
            <td className={`${tdCls} font-medium`}>{protocol.baseline_value} {protocol.unit}</td>
            <td className={tdCls}>Window</td>
            <td className={`${tdCls} font-medium`}>{protocol.duration_days} days, {protocol.sample_interval}</td>
          </tr>
          <tr>
            <td className={tdCls}>Method</td>
            <td className={`${tdCls} text-muted`} colSpan={3}>{protocol.measurement_method}</td>
          </tr>
          <tr>
            <td className={tdCls}>Success rule</td>
            <td className={`${tdCls} text-muted`} colSpan={3}>{protocol.success_rule}</td>
          </tr>
          {protocol.content_hash && (
            <tr>
              <td className={tdCls}>Content hash</td>
              <td className={`${tdCls} mono`} colSpan={3}>{protocol.content_hash}</td>
            </tr>
          )}
        </tbody>
      </table>
          </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2 lg:col-span-4" : undefined}>
      <span className={`${micro} mb-1 block`}>{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Section 5: run and measurements
 * ------------------------------------------------------------------ */

function RunSection({
  pilot,
  role,
  onChanged,
}: {
  pilot: PilotDetail;
  role: string;
  onChanged: () => void;
}) {
  const startAction = useAction();
  const closeAction = useAction();
  const isGov = role === "government";
  const sealed = pilot.sealed_protocol;
  const running = pilot.status === "RUNNING";
  const completed = pilot.status === "COMPLETED" || pilot.status === "VERDICTED";
  const canStart = isGov && pilot.status === "SEALED" && sealed != null;
  const canClose = isGov && pilot.status === "RUNNING" && pilot.measurements.length > 0;

  const compareRows: CompareRow[] = [
    { label: "Baseline", value: pilot.challenge.kpi.baseline_value, tone: "neutral" },
    { label: "Target", value: sealed?.target_value ?? pilot.challenge.kpi.target_value, tone: "accent" },
  ];
  if (pilot.result) {
    compareRows.push({
      label: "Observed",
      value: pilot.result.observed_value,
      tone: pilot.result.met ? "ok" : "danger",
    });
  }

  return (
    <Section
      kicker="05"
      title="Pilot execution and measured results"
      subtitle="Weekly samples against the sealed target. The result shown here is always calculated from the stored measurements, never typed in."
    >
      {pilot.status === "SELECTED" || pilot.status === "SEALED" ? (
        <div className="space-y-4">
          <Notice tone="info">
            {sealed
              ? "The criteria are sealed and the pilot is ready to start at the pilot sites."
              : "Seal the evaluation protocol first; the pilot can only start against locked criteria."}
          </Notice>
          {canStart && (
            <Button
              tone="primary"
              busy={startAction.busy}
              onClick={async () => {
                if (await startAction.run(() => api.pilots.start(pilot.id))) onChanged();
              }}
            >
              Start the pilot
            </Button>
          )}
          {!isGov && <p className="text-12 text-muted">Starting requires the Government role.</p>}
          {startAction.error && <Notice tone="fail">{startAction.error}</Notice>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-13 text-ink">
              Status:{" "}
              <span className="font-semibold">{pilot.status.replace(/_/g, " ")}</span>
              {pilot.started_at && (
                <span className="text-muted"> &middot; started {fmtDate(pilot.started_at)}</span>
              )}
              {completed && pilot.completed_at && (
                <span className="text-muted"> &middot; closed {fmtDate(pilot.completed_at)}</span>
              )}
            </p>
            {canClose && (
              <Button
                tone="primary"
                busy={closeAction.busy}
                onClick={async () => {
                  if (await closeAction.run(() => api.pilots.close(pilot.id))) onChanged();
                }}
              >
                Close measurement window
              </Button>
            )}
            {closeAction.error && <Notice tone="fail">{closeAction.error}</Notice>}
          </div>

          {pilot.measurements.length > 0 ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className={`${micro} mb-3`}>Weekly samples against the sealed target</p>
                  <TrendChart
                    labels={pilot.measurements.map((m) => m.label)}
                    values={pilot.measurements.map((m) => m.value)}
                    unit={pilot.measurements[0].unit}
                    target={sealed?.target_value ?? pilot.challenge.kpi.target_value}
                    baseline={pilot.challenge.kpi.baseline_value}
                    showResult={
                      completed && pilot.result
                        ? { value: pilot.result.observed_value, met: pilot.result.met }
                        : pilot.result && running
                          ? { value: pilot.result.observed_value, met: pilot.result.met }
                          : null
                    }
                  />
                </div>
                <div>
                  <p className={`${micro} mb-3`}>Baseline, target, observed</p>
                  <CompareBars rows={compareRows} unit={pilot.measurements[0].unit} />
                </div>
              </div>
              <div className="overflow-x-auto">
          <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Period</th>
                    <th className={thCls}>Value</th>
                    <th className={thCls}>Recorded</th>
                    <th className={thCls}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {pilot.measurements.map((m) => (
                    <tr key={m.id}>
                      <td className={tdCls}>{m.label}</td>
                      <td className={`${tdCls} mono font-medium`}>{m.value} {m.unit}</td>
                      <td className={tdCls}>{fmtDate(m.recorded_on)}</td>
                      <td className={`${tdCls} max-w-[340px] text-muted`}>{m.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
              {running && (
                <p className="text-12 text-muted">
                  The measurement window is open. Weekly samples arrive from the
                  pilot sites; use the demo telemetry control to advance weeks.
                </p>
              )}
            </>
          ) : running ? (
            <Notice tone="info">
              The pilot is running. Weekly measurements have not yet arrived
              from the pilot sites. Use the demo telemetry control to sync the
              first week.
            </Notice>
          ) : (
            <p className="text-13 text-muted">No measurements recorded.</p>
          )}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 6: evidence
 * ------------------------------------------------------------------ */

function EvidenceSection({
  pilot,
  role,
  onChanged,
}: {
  pilot: PilotDetail;
  role: string;
  onChanged: () => void;
}) {
  const verifyAllAction = useAction();
  const uploadAction = useAction();
  const isGov = role === "government";
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ title: "", kind: "ops_report", source: "", description: "" });
  const verdictIssued = pilot.verdict != null;
  const canUpload = isGov && !verdictIssued && (pilot.status === "RUNNING" || pilot.status === "COMPLETED");
  const allOk = pilot.evidence.length > 0 && pilot.evidence.every((e) => e.latest_check?.ok === true);

  return (
    <Section
      kicker="06"
      title="Evidence and integrity"
      subtitle="Each artifact stores its bytes and its server-computed SHA-256. Verify recomputes the hash over the stored bytes. If an artifact is altered, verification fails."
    >
      {pilot.evidence.length === 0 ? (
        <Notice tone="info">
          No evidence artifacts yet. Evidence can be uploaded while the pilot
          runs or after the window closes, but before a verdict.
        </Notice>
      ) : (
        <div className="overflow-x-auto border border-line">
          <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th className={thCls}>Artifact</th>
                <th className={thCls}>Week</th>
                <th className={thCls}>Source</th>
                <th className={thCls}>SHA-256</th>
                <th className={thCls}>Storage</th>
                <th className={thCls}>Integrity</th>
              </tr>
            </thead>
            <tbody>
              {pilot.evidence.map((e) => (
                <tr key={e.id}>
                  <td className={tdCls}>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-muted">{e.filename}</p>
                  </td>
                  <td className={tdCls}>{e.measurement_label ?? fmtDate(e.occurred_on)}</td>
                  <td className={`${tdCls} max-w-[200px] text-muted`}>{e.source}</td>
                  <td className={`${tdCls} mono`}>{shortHash(e.sha256, 14)}</td>
                  <td className={`${tdCls} mono`}>{e.storage_backend === "minio" ? "MinIO" : "local demo"}</td>
                  <td className={tdCls}>
                    {e.latest_check ? (
                      <StatusMark
                        tone={e.latest_check.ok ? "ok" : "danger"}
                        label={e.latest_check.ok ? "Verified" : "Failed"}
                        meta={fmtDate(e.latest_check.checked_at)}
                      />
                    ) : (
                      <span className="text-muted">Unchecked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {pilot.evidence.length > 0 && (
          <Button
            tone={allOk ? "plain" : "primary"}
            busy={verifyAllAction.busy}
            onClick={async () => {
              const ok = await verifyAllAction.run(async () => {
                for (const e of pilot.evidence) {
                  await api.evidence.verify(e.id);
                }
              });
              if (ok) onChanged();
            }}
          >
            Verify all artifacts
          </Button>
        )}
        {pilot.evidence.length > 0 && !verdictIssued && (
          <Button
            tone="danger"
            busy={uploadAction.busy}
            onClick={() => setUploading((u) => !u)}
          >
            {uploading ? "Close upload" : "Upload evidence"}
          </Button>
        )}
        {!allOk && pilot.evidence.length > 0 && (
          <p className="self-center text-13 text-danger">
            At least one artifact failed verification. Validation and the verdict
            are withheld until every artifact verifies.
          </p>
        )}
      </div>
      {verifyAllAction.error && <div className="mt-3"><Notice tone="fail">{verifyAllAction.error}</Notice></div>}

      {canUpload && uploading && (
        <div className="mt-4 border border-line bg-surface p-4">
          <p className={`${micro} mb-3`}>Upload an evidence artifact</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input className={fieldCls}
                value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            </Field>
            <Field label="Source system">
              <input className={fieldCls}
                value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className={`${fieldCls} cursor-pointer`}
                value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })}>
                <option value="ops_report">Operations report</option>
                <option value="sampling_log">Sampling log</option>
                <option value="report">Report</option>
              </select>
            </Field>
            <Field label="File">
              <input type="file" className="w-full cursor-pointer text-13" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Description" wide>
              <input className={fieldCls}
                value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              busy={uploadAction.busy}
              disabled={!file}
              onClick={async () => {
                if (!file) return;
                const ok = await uploadAction.run(() =>
                  api.evidence.upload(pilot.id, file, meta),
                );
                if (ok) {
                  setFile(null);
                  setMeta({ title: "", kind: "ops_report", source: "", description: "" });
                  setUploading(false);
                  onChanged();
                }
              }}
            >
              Upload and hash
            </Button>
            <span className="text-12 text-muted">
              Bytes are stored and SHA-256 is computed server-side at upload.
            </span>
          </div>
          {uploadAction.error && <div className="mt-3"><Notice tone="fail">{uploadAction.error}</Notice></div>}
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 7: human validation
 * ------------------------------------------------------------------ */

function ValidationSection({
  pilot,
  role,
  onChanged,
}: {
  pilot: PilotDetail;
  role: string;
  onChanged: () => void;
}) {
  const requestAction = useAction();
  const approveAction = useAction();
  const isValidator = role === "validator";
  const approved = pilot.validations.find((v) => v.status === "APPROVED");
  const pending = pilot.validations.find((v) => v.status === "PENDING");
  const [validatorName, setValidatorName] = useState("Dr. Anita Rao (Independent Evaluator)");
  const [notes, setNotes] = useState("");

  const evidenceVerified = pilot.evidence.length > 0 &&
    pilot.evidence.every((e) => e.latest_check?.ok === true);
  const canRequest =
    isValidator && pilot.status === "COMPLETED" && !approved && !pending;
  const canApprove = isValidator && pending != null && evidenceVerified;

  return (
    <Section
      kicker="07"
      title="Independent validation"
      subtitle="Two separate steps: the system verifies hashes and computes results, then a human validator reviews and signs off. A verdict cannot exist without both."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border border-line bg-surface px-4 py-4">
          <p className={`${micro} mb-2`}>System verification (automated)</p>
          <DefList
            columns={1}
            rows={[
              [
                "Evidence integrity",
                pilot.evidence.length === 0
                  ? "No artifacts yet"
                  : evidenceVerified
                    ? "All artifacts pass hash verification"
                    : "Not all artifacts verify",
              ],
              [
                "Sealed criteria",
                pilot.sealed_protocol ? `Present, v${pilot.sealed_protocol.version}` : "Not sealed",
              ],
              [
                "Calculated result",
                pilot.result
                  ? `${pilot.result.observed_value} ${pilot.result.unit}, ${pilot.result.met ? "within target" : "outside target"}`
                  : "Not available yet",
              ],
            ]}
          />
        </div>
        <div className="border border-line bg-surface px-4 py-4">
          <p className={`${micro} mb-2`}>Human validation (independent)</p>
          {approved ? (
            <div className="space-y-2">
              <StatusMark tone="ok" label={`Signed off by ${approved.validator_name}`} />
              <p className="text-13 text-muted">
                {approved.notes || "No statement recorded."}
              </p>
              <p className="text-12 text-muted">
                Decided {fmtDate(approved.decided_at)}. Sign-off is separate from
                automated verification.
              </p>
            </div>
          ) : pilot.status !== "COMPLETED" ? (
            <p className="text-13 text-muted">
              Validation opens after the measurement window closes.
            </p>
          ) : (
            <div className="space-y-3">
              {!pending && (
                <>
                  <p className="text-13 text-muted">
                    The validator reviews the sealed protocol, measurements, and
                    evidence before signing.
                  </p>
                  <Field label="Validator name">
                    <input
                      className={fieldCls}
                      value={validatorName}
                      onChange={(e) => setValidatorName(e.target.value)}
                    />
                  </Field>
                </>
              )}
              {pending && (
                <>
                  <p className="text-13 text-muted">
                    Review opened for {pending.validator_name}.
                  </p>
                  <Field label="Statement">
                    <textarea
                      rows={3}
                      className={fieldCls}
                      value={notes}
                      placeholder="What was cross-checked and what was confirmed"
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Field>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {canRequest && (
                  <Button
                    tone="primary"
                    busy={requestAction.busy}
                    onClick={async () => {
                      if (
                        await requestAction.run(() =>
                          api.pilots.openValidation(pilot.id, validatorName),
                        )
                      )
                        onChanged();
                    }}
                  >
                    Start validation review
                  </Button>
                )}
                {canApprove && (
                  <Button
                    busy={approveAction.busy}
                    onClick={async () => {
                      if (
                        await approveAction.run(() =>
                          api.pilots.approveValidation(pilot.id, notes || "Approved after review."),
                        )
                      )
                        onChanged();
                    }}
                  >
                    Approve and sign off
                  </Button>
                )}
                {pending && !canApprove && !evidenceVerified && (
                  <p className="self-center text-12 text-danger">
                    Evidence integrity is not confirmed; sign-off is withheld.
                  </p>
                )}
              </div>
              {(requestAction.error || approveAction.error) && (
                <Notice tone="fail">{requestAction.error ?? approveAction.error}</Notice>
              )}
              {!isValidator && (
                <p className="text-12 text-muted">
                  Switch the demo role to Validator to act on this section.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Section 8: verdict and verified record
 * ------------------------------------------------------------------ */

function VerdictSection({
  pilot,
  role,
  onChanged,
}: {
  pilot: PilotDetail;
  role: string;
  onChanged: () => void;
}) {
  const verdictAction = useAction();
  const isGov = role === "government";
  const sealed = pilot.sealed_protocol;
  const validationOk = (pilot.validations ?? []).some((v) => v.status === "APPROVED");
  const evidenceOk =
    pilot.evidence.length > 0 && pilot.evidence.every((e) => e.latest_check?.ok === true);
  const ready = pilot.status === "COMPLETED" && validationOk && evidenceOk;

  const blockers: string[] = [];
  if (pilot.status !== "COMPLETED" && !pilot.verdict) blockers.push("The pilot must be completed (measurement window closed).");
  if (sealed == null && !pilot.verdict) blockers.push("The evaluation protocol must be sealed.");
  if (pilot.status === "COMPLETED" && pilot.measurements.length === 0) blockers.push("At least one measurement is required.");
  if (pilot.status === "COMPLETED" && !evidenceOk) blockers.push("Every evidence artifact must verify.");
  if (pilot.status === "COMPLETED" && !validationOk) blockers.push("Independent human validation must be approved.");

  return (
    <Section
      kicker="08"
      title="Deterministic verdict and verified record"
      subtitle="The verdict is calculated from the stored measurements against the sealed protocol, after verification and validation. It is issued once and never re-issued."
    >
      {pilot.verdict ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-stretch gap-4">
            <div
              className={`min-w-[240px] border border-line px-5 py-4 ${
                pilot.verdict.outcome === "MET" ? "bg-ok-bg" : "bg-danger-bg"
              }`}
            >
              <p
                className={`${micro} mb-2 ${
                  pilot.verdict.outcome === "MET" ? "text-ok" : "text-danger"
                }`}
              >
                Verdict
              </p>
              <p className="text-24 font-bold tracking-tight text-ink">
                {pilot.verdict.outcome}
              </p>
              <p className="mt-2 text-13">
                Observed {pilot.verdict.observed_value} {pilot.verdict.unit} against{" "}
                {opText(pilot.verdict.target_operator)} {pilot.verdict.target_value}{" "}
                {pilot.verdict.unit}
              </p>
            </div>
            <div className="min-w-[280px] flex-1 border border-line px-5 py-4">
              <p className={`${micro} mb-2`}>Calculation and issuance</p>
              <p className="text-13 leading-relaxed">{pilot.verdict.method}</p>
              <p className="mt-2 text-12 text-muted">
                Issued {fmtDate(pilot.verdict.issued_at)} by {pilot.verdict.issued_by}.
                Protocol v{pilot.verdict.protocol_version}. Immutable after issue.
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <p className={`${micro} mb-3`}>Baseline, target, observed</p>
            <CompareBars
              unit={pilot.verdict.unit}
              rows={[
                { label: "Baseline", value: pilot.challenge.kpi.baseline_value, tone: "neutral" },
                { label: "Target", value: pilot.verdict.target_value, tone: "accent" },
                {
                  label: "Observed",
                  value: pilot.verdict.observed_value,
                  tone: pilot.verdict.outcome === "MET" ? "ok" : "danger",
                },
              ]}
            />
          </div>

          {pilot.scale && (
            <div className="border border-line bg-paper px-4 py-3">
              <p className={`${micro} mb-1`}>Scale recommendation recorded</p>
              <p className="text-13 leading-relaxed">{pilot.scale.basis}</p>
            </div>
          )}

          {pilot.vpr ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-surface px-5 py-4">
              <div>
                <p className={`${micro} mb-1`}>Verified Pilot Record</p>
                <p className="mono text-16 font-semibold">{pilot.vpr.reference}</p>
                <p className="text-12 text-muted">
                  Issued {fmtDate(pilot.vpr.issued_at)}. Reusable by other departments.
                </p>
              </div>
              <Button onClick={() => navigate(`/records/${pilot.vpr!.id}`)}>
                Open the record
              </Button>
            </div>
          ) : (
            <p className="text-13 text-muted">Record issued with the verdict.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {pilot.result && (
            <Notice tone="info">
              Calculated result so far: observed average{" "}
              <span className="font-semibold">{pilot.result.observed_value} {pilot.result.unit}</span>{" "}
              against {opText(pilot.result.target_operator)} {pilot.result.target}{" "}
              {pilot.result.unit} over {pilot.result.sample_count} samples.{" "}
              {pilot.result.met ? "Currently within target." : "Currently outside target."}{" "}
              This is not a verdict until issued.
            </Notice>
          )}
          {blockers.length > 0 && (
            <Notice tone="warn">
              <p className="font-semibold">The verdict cannot be issued yet:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Notice>
          )}
          {ready && isGov && (
            <div className="flex items-center gap-3 border border-line bg-surface px-4 py-3">
              <p className="text-13 text-muted">
                Validation approved and evidence verified. Issuing computes the
                outcome from the stored measurements and freezes it.
              </p>
              <Button
                tone="primary"
                busy={verdictAction.busy}
                onClick={async () => {
                  if (
                    await verdictAction.run(() =>
                      api.pilots.issueVerdict(pilot.id, "Health and Family Welfare Department"),
                    )
                  )
                    onChanged();
                }}
              >
                Issue deterministic verdict
              </Button>
            </div>
          )}
          {ready && !isGov && (
            <p className="text-12 text-muted">
              Ready to issue. Switch the demo role to Government to act.
            </p>
          )}
          {verdictAction.error && <Notice tone="fail">{verdictAction.error}</Notice>}
        </div>
      )}
    </Section>
  );
}
