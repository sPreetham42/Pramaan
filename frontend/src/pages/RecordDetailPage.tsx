import { api } from "../api/client";
import { useAction, useData } from "../lib/hooks";
import { navigate } from "../router";
import {
  Button,
  DataState,
  DefList,
  Notice,
  Section,
  StatusMark,
  fmtDate,
  h2Cls,
  micro,
  opText,
  shortHash,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { AuditVerifyResult } from "../types";
import { CompareBars, StepBar } from "../components/charts";
import { useState, type ReactNode } from "react";

/**
 * Collapsible record section: a one-line summary when closed, the full
 * traceability tables when opened. Keeps the record readable at a glance.
 */
function Fold({
  kicker,
  title,
  summary,
  children,
}: {
  kicker: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="border-t border-line pt-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="w-full text-left"
        >
          <span className={`${micro} mb-1 block`}>{kicker}</span>
          <span className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-16 font-semibold text-ink">{title}</span>
            <span className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-line bg-surface px-3.5 py-2 text-13 font-medium text-ink">
              Expand <span aria-hidden="true">{"\u203A"}</span>
            </span>
          </span>
          <span className="mt-1 block text-13 leading-relaxed text-muted">{summary}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-line pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className={`${micro} mb-1`}>{kicker}</p>
          <h2 className={h2Cls}>{title}</h2>
        </div>
        <Button tone="secondary" size="sm" onClick={() => setOpen(false)}>
          Collapse
        </Button>
      </div>
      {children}
    </div>
  );
}

export default function RecordDetailPage({ id }: { id: number }) {
  const detail = useData(`vpr-${id}`, () => api.vprs.get(id));
  const chainAction = useAction();
  const [chain, setChain] = useState<AuditVerifyResult | null>(null);

  if (detail.error || (!detail.data && !detail.loading)) {
    return (
      <div className="mx-auto mt-8 max-w-[60rem]">
        <DataState loading={false} error={detail.error} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="mx-auto mt-8 max-w-[60rem]">
        <DataState loading={true} error={null} />
      </div>
    );
  }

  const vpr = detail.data;
  const verdict = vpr.verdict;
  const protocol = vpr.protocol;

  const runChain = async () => {
    const ok = await chainAction.run(async () => {
      const result = await api.vprs.auditVerify(id);
      setChain(result);
    });
    if (!ok) setChain(null);
  };

  const observedOk = verdict.outcome === "MET";

  return (
    <div className="mx-auto max-w-[60rem]">
      {/* Document header */}
      <div className="border-2 border-ink bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink bg-paper px-6 py-4">
          <div>
            <p className={`${micro} text-accent`}>Verified Pilot Record</p>
            <h1 className="mono mt-1 text-20 font-semibold tracking-wide">{vpr.reference}</h1>
          </div>
          <div className="text-right text-12 text-muted">
            <p>Issued {fmtDate(vpr.issued_at)}</p>
            <StatusMark label="Active" tone="ok" meta="reusable" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 px-6 py-4">
          <Button onClick={() => navigate(`/pilots/${vpr.pilot.id}`)}>Open pilot journey</Button>
          <Button tone="plain" onClick={() => navigate("/challenges/2")}>
            See reuse in another department
          </Button>
        </div>
        <p className="border-t border-line px-6 py-5 text-14 leading-relaxed">{vpr.summary}</p>
      </div>

      <div className="mt-8 space-y-10">
        {/* 1. What was tested */}
        <Section kicker="01" title="What was tested">
          <DefList
            rows={[
              ["Department", `${vpr.department.name}`],
              ["Challenge", vpr.challenge.title],
              ["Problem", vpr.challenge.problem],
              ["Startup", vpr.startup.name],
              ["Pilot scope", vpr.pilot.scope],
              ["Window", protocol ? `${protocol.duration_days} days, sampled ${protocol.sample_interval}` : "n/a"],
            ]}
          />
        </Section>

        {/* 2. Competitive route */}
        <Fold
          kicker="02"
          title="How this startup was chosen"
          summary={
            vpr.application
              ? `${vpr.application.eligibility.checks.length} eligibility checks and ${vpr.application.evaluations.length} panel evaluations, each with visible reasons.`
              : "Selected through a departmental reuse decision."
          }
        >
          {vpr.application ? (
            <div className="space-y-5">
              <div>
                <p className={`${micro} mb-2`}>Eligibility screening</p>
                <div className="overflow-x-auto">
                  <table className={tableCls}>
                    <tbody>
                      {vpr.application.eligibility.checks.map((c) => (
                        <tr key={c.check}>
                          <td className={tdCls}>{c.check}</td>
                          <td className={`${tdCls} w-36`}>
                            <StatusMark
                              tone={c.met ? "ok" : "danger"}
                              label={c.met ? "Met" : "Not met"}
                            />
                          </td>
                          <td className={`${tdCls} text-muted`}>{c.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className={`${micro} mb-2`}>Expert evaluation panel</p>
                <div className="overflow-x-auto">
                  <table className={tableCls}>
                    <thead>
                      <tr>
                        <th className={thCls}>Evaluator</th>
                        <th className={thCls}>Role</th>
                        <th className={thCls}>Overall score</th>
                        <th className={thCls}>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vpr.application.evaluations.map((e) => (
                        <tr key={e.id}>
                          <td className={tdCls}>{e.evaluator_name}</td>
                          <td className={tdCls}>{e.evaluator_role}</td>
                          <td className={`${tdCls} mono`}>{e.score.toFixed(1)} / 5</td>
                          <td className={`${tdCls} max-w-[420px] text-muted`}>{e.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-13 text-muted">
              Selected through a departmental reuse decision (see the receiving
              department record).
            </p>
        )}
      </Fold>

      {/* 3. Sealed criteria */}
        <Section
          kicker="03"
          title="The criteria that were locked before the pilot"
          subtitle="These values were sealed on the record below before any measurement existed. They cannot be edited afterwards."
        >
          {protocol && (
            <div className="space-y-4">
              <DefList
                columns={3}
                rows={[
                  ["Metric", protocol.metric],
                  ["Target", `${opText(protocol.target_operator)} ${protocol.target_value} ${protocol.unit}`],
                  ["Baseline at seal", `${protocol.baseline_value} ${protocol.unit}`],
                  ["Version", `v${protocol.version}`],
                  ["Sample interval", protocol.sample_interval],
                  ["Measurement method", protocol.measurement_method],
                ]}
              />
              <div className="border border-line bg-paper px-4 py-3">
                <p className={`${micro} mb-1`}>Seal record</p>
                <p className="text-13">
                  Content SHA-256 <span className="mono">{protocol.content_hash}</span>
                </p>
                <p className="text-12 text-muted">
                  Sealed {fmtDate(protocol.sealed_at)} by {protocol.sealed_by}
                </p>
                <p className="mt-1.5 text-13">{protocol.success_rule}</p>
              </div>
            </div>
          )}
        </Section>

        {/* 4. Milestones and payments */}
        <Section kicker="04" title="Milestone plan and payment status">
          <div className="overflow-x-auto border border-line bg-surface">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Milestone</th>
                  <th className={thCls}>What it covers</th>
                  <th className={thCls}>Value</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Payment</th>
                </tr>
              </thead>
              <tbody>
                {vpr.milestones.map((m) => (
                  <tr key={m.seq}>
                    <td className={tdCls}>{m.seq}. {m.title}</td>
                    <td className={`${tdCls} max-w-[340px] text-muted`}>{m.description}</td>
                    <td className={`${tdCls} mono`}>{"\u20B9"}{m.amount}</td>
                    <td className={tdCls}>
                      {m.status === "COMPLETED" ? (
                        <StatusMark label="Completed" tone="ok" />
                      ) : (
                        <StatusMark label="Pending" tone="neutral" />
                      )}
                    </td>
                    <td className={tdCls}>
                      {m.payment_status === "RELEASED" ? (
                        <StatusMark label="Released" tone="ok" />
                      ) : m.payment_status === "PAYMENT_ELIGIBLE" ? (
                        <StatusMark label="Eligible" tone="warn" />
                      ) : (
                        <StatusMark label="Pending" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
            <StepBar
              segments={vpr.milestones.length}
              done={vpr.milestones.filter((m) => m.status === "COMPLETED").length}
              label="Milestones completed"
            />
            <StepBar
              segments={vpr.milestones.length}
              done={vpr.milestones.filter((m) => m.payment_status === "RELEASED").length}
              label="Payments released"
            />
          </div>
        </Section>

        {/* 5. Measurements and verdict */}
        <Section kicker="05" title="Measured result and verdict">
          <div className="overflow-x-auto border border-line bg-surface">
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
                {vpr.measurements.map((m) => (
                  <tr key={m.id}>
                    <td className={tdCls}>{m.label}</td>
                    <td className={`${tdCls} mono`}>{m.value} {m.unit}</td>
                    <td className={tdCls}>{fmtDate(m.recorded_on)}</td>
                    <td className={`${tdCls} max-w-[300px] text-muted`}>{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap items-stretch gap-4">
            <div
              className={`min-w-[260px] border border-line px-5 py-4 ${
                observedOk ? "bg-ok-bg" : "bg-danger-bg"
              }`}
            >
              <p className={`${micro} mb-2 ${observedOk ? "text-ok" : "text-danger"}`}>
                Deterministic verdict
              </p>
              <p className="text-24 font-bold tracking-tight text-ink">{verdict.outcome}</p>
              <p className="mt-2 text-13">
                Observed {verdict.observed_value} {verdict.unit} against target{" "}
                {opText(verdict.target_operator)} {verdict.target_value} {verdict.unit}
                (protocol v{verdict.protocol_version})
              </p>
            </div>
            <div className="min-w-[280px] flex-1 border border-line px-5 py-4">
              <p className={`${micro} mb-2`}>Calculation basis</p>
              <p className="text-13 leading-relaxed">{verdict.method}</p>
              <p className="mt-2 text-12 text-muted">
                Issued {fmtDate(verdict.issued_at)} by {verdict.issued_by}. A verdict
                is issued once and is not modified or re-issued.
              </p>
            </div>
          </div>
          {protocol && (
            <div className="mt-5 max-w-md">
              <p className={`${micro} mb-3`}>Baseline, target, observed</p>
              <CompareBars
                unit={verdict.unit}
                rows={[
                  { label: "Baseline", value: protocol.baseline_value, tone: "neutral" },
                  { label: "Target", value: verdict.target_value, tone: "accent" },
                  {
                    label: "Observed",
                    value: verdict.observed_value,
                    tone: observedOk ? "ok" : "danger",
                  },
                ]}
              />
            </div>
          )}
        </Section>

        {/* 6. Evidence */}
        <Section kicker="06" title="Evidence behind the result">
          <div className="overflow-x-auto border border-line bg-surface">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Artifact</th>
                  <th className={thCls}>Period</th>
                  <th className={thCls}>Source</th>
                  <th className={thCls}>SHA-256</th>
                  <th className={thCls}>Integrity check</th>
                </tr>
              </thead>
              <tbody>
                {vpr.evidence.map((e) => (
                  <tr key={e.id}>
                    <td className={tdCls}>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-muted">{e.filename}</p>
                    </td>
                    <td className={tdCls}>{e.measurement_label ?? fmtDate(e.occurred_on)}</td>
                    <td className={`${tdCls} max-w-[220px] text-muted`}>{e.source}</td>
                    <td className={`${tdCls} mono`}>{shortHash(e.sha256, 16)}</td>
                    <td className={tdCls}>
                      {e.latest_check ? (
                        <StatusMark
                          tone={e.latest_check.ok ? "ok" : "danger"}
                          label={e.latest_check.ok ? "Hash verified" : "Failed"}
                          meta={fmtDate(e.latest_check.checked_at)}
                        />
                      ) : (
                        <StatusMark label="Unchecked" tone="neutral" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 max-w-md">
            <StepBar
              segments={vpr.evidence.length}
              done={vpr.evidence.filter((e) => e.latest_check?.ok === true).length}
              label="Artifacts hash-verified"
            />
          </div>
          <p className="mt-3 text-12 text-muted">
            Storage: {vpr.evidence.some((e) => e.storage_backend === "minio")
              ? "MinIO object storage"
              : "local demo storage directory"}. Hashes are computed server-side
            from the stored bytes at upload; the integrity check recomputes and
            compares them.
          </p>
        </Section>

        {/* 7. Validation */}
        <Section kicker="07" title="Independent human validation">
          <DefList
            rows={[
              ["Validator", vpr.validation.validator_name ?? "None"],
              ["Signed off", vpr.validation.decided_at ? fmtDate(vpr.validation.decided_at) : "Not yet"],
              ["Statement", vpr.validation.notes || "No statement recorded"],
            ]}
          />
        </Section>

        {/* 8. Scale recommendation */}
        <Section kicker="08" title="Scale decision support">
          {vpr.scale ? (
            <div className="space-y-3">
              <p className="text-14 font-semibold">
                {vpr.scale.outcome === "SCALE_UP_RECOMMENDED"
                  ? "Scale-up recommended"
                  : vpr.scale.outcome === "CONFIRMATORY_RECOMMENDED"
                    ? "Confirmatory pilot recommended"
                    : "Scale-up not recommended"}
              </p>
              <p className="max-w-3xl text-13 leading-relaxed">{vpr.scale.basis}</p>
              <Notice tone="info">
                This is a recommendation recorded by the department. PRAMAAN never
                awards procurement: the decision and the authority remain with the
                government.
              </Notice>
            </div>
          ) : (
            <p className="text-13 text-muted">No scale decision recorded.</p>
          )}
        </Section>

        {/* 9. Audit trail */}
        <Fold
          kicker="09"
          title="Audit trail"
          summary="Every workflow event is chained in SHA-256; expand to verify the chain end to end."
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {api.staticMode ? (
              <p className="text-13 text-muted">
                Chain verification runs in the live demo.
              </p>
            ) : (
              <Button tone="plain" busy={chainAction.busy} onClick={runChain}>
                Verify chain
              </Button>
            )}
            {chain &&
              (chain.ok ? (
                <StatusMark
                  tone="ok"
                  label="Chain intact"
                  meta={`${chain.count} events verified`}
                />
              ) : (
                <StatusMark
                  tone="danger"
                  label="Chain broken"
                  meta={chain.issues.join(", ")}
                />
              ))}
          </div>
          <div className="max-h-[360px] overflow-auto border border-line bg-surface">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Event</th>
                  <th className={thCls}>Kind</th>
                  <th className={thCls}>Actor</th>
                  <th className={thCls}>Recorded</th>
                  <th className={thCls}>Hash</th>
                </tr>
              </thead>
              <tbody>
                {vpr.audit.map((a) => (
                  <tr key={a.id}>
                    <td className={`${tdCls} max-w-[340px]`}>{a.summary}</td>
                    <td className={tdCls}>{a.kind}</td>
                    <td className={tdCls}>{a.actor}</td>
                    <td className={tdCls}>{fmtDate(a.occurred_at)}</td>
                    <td className={`${tdCls} mono`}>{shortHash(a.content_hash, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Fold>

        <Notice tone="warn">
          Demonstration record built on simulated case-study data. No real
          government pilot was run, no real procurement is authorized by this
          document, and this prototype does not implement production
          authentication or nationwide evidence infrastructure.
        </Notice>
      </div>
    </div>
  );
}
