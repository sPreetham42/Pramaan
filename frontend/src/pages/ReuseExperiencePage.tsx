import { useState } from "react";
import { api } from "../api/client";
import { useAction, useData } from "../lib/hooks";
import { useRole } from "../AppShell";
import { navigate } from "../router";
import {
  Button,
  DataState,
  DefList,
  Notice,
  PageHeader,
  Section,
  StatusMark,
  fieldCls,
  fmtDate,
  micro,
  opText,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";

export default function ReuseExperiencePage({ id }: { id: number }) {
  const { role } = useRole();
  const challenge = useData(`reuse-challenge-${id}`, () => api.challenges.get(id));
  const [action, setAction] = useState<"REUSE_EVIDENCE" | "CONFIRMATORY_PILOT">("REUSE_EVIDENCE");
  const [rationale, setRationale] = useState("");
  const decideAction = useAction();

  if (challenge.error || (!challenge.data && !challenge.loading)) {
    return (
      <div className="mt-8">
        <DataState loading={false} error={challenge.error} />
      </div>
    );
  }
  if (!challenge.data) {
    return (
      <div className="mt-8">
        <DataState loading={true} error={null} />
      </div>
    );
  }

  const c = challenge.data;
  const discovery = c.reuse_discovery ?? [];
  const decisions = c.reuse_decisions ?? [];
  const decided = decisions[0];
  const isGov = role === "government";
  const kpi = c.kpi;

  const stateMark = decided
    ? { label: "Decision recorded", tone: "ok" as const }
    : c.status === "IN_PILOT"
      ? { label: "Confirmatory pilot running", tone: "current" as const }
      : { label: "Discovery open", tone: "neutral" as const };

  return (
    <div>
      <PageHeader
        eyebrow={c.department.name}
        title={c.title}
        description={c.problem}
        meta={
          <>
            <span>
              Current baseline <strong className="text-ink">{kpi.baseline_value} {kpi.unit}</strong>
            </span>
            <span>
              Wants to reach{" "}
              <strong className="text-ink">
                {opText(kpi.target_operator)} {kpi.target_value} {kpi.unit}
              </strong>
            </span>
            <StatusMark label={stateMark.label} tone={stateMark.tone} />
          </>
        }
      />

      <div className="mt-8 space-y-10">
        {decided ? (
          <Section
            kicker="Decision recorded"
            title={
              decided.action === "REUSE_EVIDENCE"
                ? "Verified evidence accepted for this decision"
                : "Confirmatory pilot created"
            }
          >
            <div className="space-y-4">
              <DefList
                columns={2}
                rows={[
                  ["Source record", decided.vpr_reference ?? ""],
                  ["Rationale", decided.rationale || "No rationale recorded."],
                  ["Recorded by", decided.decided_by],
                  ["Recorded at", fmtDate(decided.decided_at)],
                ]}
              />
              {decided.confirmatory_pilot_id && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-13 text-muted">
                    A confirmatory pilot now runs against criteria inherited from
                    the verified record.
                  </p>
                  <Button onClick={() => navigate(`/pilots/${decided.confirmatory_pilot_id}`)}>
                    Open the confirmatory pilot
                  </Button>
                </div>
              )}
              <Notice tone="warn">
                Reusing the evidence supports this department's decision. It does
                not automatically authorize procurement or commit any budget:
                PRAMAAN supplies verified evidence, the department decides.
              </Notice>
            </div>
          </Section>
        ) : (
          <Section
            kicker="Prove once, reuse the proof"
            title="Verified evidence waiting to be reused"
            subtitle="PRAMAAN searched verified pilot records from other departments for criteria that match this challenge. One record came back."
          >
            {discovery.length === 0 ? (
              <p className="text-13 text-muted">
                No verified records matched this challenge yet.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="overflow-x-auto border border-line bg-surface">
                  <table className={tableCls}>
                    <thead>
                      <tr>
                        <th className={thCls}>Verified record</th>
                        <th className={thCls}>Source</th>
                        <th className={thCls}>What was tested</th>
                        <th className={thCls}>Result</th>
                        <th className={thCls}>Matched criteria</th>
                        <th className={thCls}>Proof</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discovery.map((d) => (
                        <tr key={d.vpr_id}>
                          <td className={`${tdCls} mono`}>
                            <button
                              className="text-left text-accent hover:underline"
                              onClick={() => navigate(`/records/${d.vpr_id}`)}
                            >
                              {d.reference}
                            </button>
                            <p className="text-muted">issued {fmtDate(d.issued_at)}</p>
                          </td>
                          <td className={tdCls}>
                            <p className="font-medium">{d.source_department}</p>
                            <p className="max-w-[260px] text-muted">{d.source_challenge}</p>
                          </td>
                          <td className={`${tdCls} max-w-[240px]`}>
                            {d.metric}: {opText(d.target_operator)} {d.target_value} {d.unit}
                            <p className="text-muted">by {d.startup}</p>
                          </td>
                          <td className={tdCls}>
                            <StatusMark tone="ok" label={d.outcome} />
                            <p className="text-muted">
                              observed {d.observed_value} {d.unit}
                            </p>
                          </td>
                          <td className={tdCls}>
                            {d.shared_tags.map((t) => (
                              <span key={t} className="mr-1.5 text-12 text-muted">
                                {t.replace(/_/g, " ")}
                              </span>
                            ))}
                          </td>
                          <td className={tdCls}>
                            <StatusMark
                              tone={d.evidence_verified ? "ok" : "neutral"}
                              label={d.evidence_verified ? "Evidence verified" : "Not verified"}
                            />
                            <p className="text-muted">
                              {d.evidence_count} artifacts
                              {d.validated_by ? `, validated by ${d.validated_by}` : ""}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {isGov && (
                  <div className="border border-line bg-surface p-5">
                    <p className={`${micro} mb-3`}>Department decision</p>
                    <p className="mb-4 max-w-3xl text-13 leading-relaxed text-muted">
                      This department can accept the verified evidence as proof of
                      capability for this challenge, or run a short confirmatory
                      pilot that re-measures the KPI at its own sites against the
                      same criteria. Both leave the procurement decision with the
                      department.
                    </p>
                    <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
                      <label className="flex cursor-pointer items-start gap-2 text-13">
                        <input
                          type="radio"
                          name="reuse-action"
                          checked={action === "REUSE_EVIDENCE"}
                          onChange={() => setAction("REUSE_EVIDENCE")}
                          className="accent-accent"
                        />
                        <span>
                          <span className="font-semibold text-ink">Reuse verified evidence</span>
                          <span className="block text-muted">
                            Accept the verified record as the evidence base for this
                            decision. Fastest path; no new pilot.
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-13">
                        <input
                          type="radio"
                          name="reuse-action"
                          checked={action === "CONFIRMATORY_PILOT"}
                          onChange={() => setAction("CONFIRMATORY_PILOT")}
                          className="accent-accent"
                        />
                        <span>
                          <span className="font-semibold text-ink">Run a confirmatory pilot</span>
                          <span className="block text-muted">
                            Re-measure at this department's sites over two weeks
                            with criteria inherited from the verified record.
                          </span>
                        </span>
                      </label>
                    </div>
                    <label className="mb-4 block">
                      <span className={`${micro} mb-1 block`}>Rationale (shown in the decision record)</span>
                      <textarea
                        rows={2}
                        className={`${fieldCls} max-w-2xl`}
                        value={rationale}
                        placeholder="Why this evidence fits the department's challenge"
                        onChange={(e) => setRationale(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        busy={decideAction.busy}
                        onClick={async () => {
                          const ok = await decideAction.run(() =>
                            api.challenges.reuseDecision(
                              c.id,
                              discovery[0].vpr_id,
                              action,
                              rationale || "Accepted for decision support based on matched criteria.",
                              `${c.department.short_name} evaluation cell`,
                            ),
                          );
                          if (ok) challenge.refresh();
                        }}
                      >
                        {action === "REUSE_EVIDENCE" ? "Accept verified evidence" : "Start confirmatory pilot"}
                      </Button>
                      {decideAction.error && <Notice tone="fail">{decideAction.error}</Notice>}
                    </div>
                  </div>
                )}

                {!isGov && (
                  <p className="text-12 text-muted">
                    Recording the reuse decision requires the Government role.
                  </p>
                )}
              </div>
            )}
          </Section>
        )}

        {decided && discovery.length > 0 && (
          <Section kicker="Source proof" title="The record behind this decision">
            <div className="overflow-x-auto border border-line bg-surface">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Record</th>
                    <th className={thCls}>Startup</th>
                    <th className={thCls}>Source department</th>
                    <th className={thCls}>Result</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {discovery.map((d) => (
                    <tr key={d.vpr_id}>
                      <td className={`${tdCls} mono`}>{d.reference}</td>
                      <td className={tdCls}>{d.startup}</td>
                      <td className={tdCls}>{d.source_department}</td>
                      <td className={tdCls}>
                        <StatusMark tone="ok" label={d.outcome} meta={`${d.observed_value} ${d.unit}`} />
                      </td>
                      <td className={tdCls}>
                        <Button tone="plain" onClick={() => navigate(`/records/${d.vpr_id}`)}>
                          Inspect the proof
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
