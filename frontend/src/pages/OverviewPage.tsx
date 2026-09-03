import { api } from "../api/client";
import { useData } from "../lib/hooks";
import { useRole } from "../AppShell";
import { navigate } from "../router";
import {
  Button,
  DataState,
  DefList,
  PageHeader,
  Section,
  StatusMark,
  TableFrame,
  fmtDate,
  micro,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import { StepBar } from "../components/charts";

/* Rough position of a pilot on the 8-gate journey, for the progress bars. */
function pilotGates(status?: string): number {
  if (!status) return 0;
  if (status === "VERDICTED") return 8;
  if (status === "COMPLETED") return 7;
  if (status === "RUNNING") return 5;
  if (status === "SEALED") return 4;
  if (status === "SELECTED") return 3;
  return 2;
}

function reuseGates(status: string): number {
  if (status === "OPEN") return 1;
  if (status === "IN_PILOT") return 5;
  return 3;
}

const TRUST_RULES = [
  ["Evaluation rules are committed before the outcome", "The criteria a pilot must meet are sealed before any result is known, so the goal posts cannot move."],
  ["Evidence is traceable", "Every artifact is stored, hashed, and tied to a pilot, a week, and a source."],
  ["Verification and validation are separate", "Systems recompute hashes and results; a human validator signs off independently."],
  ["Verdicts are deterministic", "MET or NOT MET is calculated from stored measurements against the sealed target, never typed in."],
  ["Proof is reusable", "A Verified Pilot Record lets another department reuse the evidence or run a confirmatory pilot."],
];

export default function OverviewPage() {
  const { role } = useRole();
  const challenges = useData("challenges", () => api.challenges.list());
  const vprs = useData("vprs", () => api.vprs.list());
  const startups = useData("startups", () => api.startups.list());

  const roleHeading =
    role === "startup"
      ? "Startup founder workspace"
      : role === "validator"
        ? "Independent validator workspace"
        : "Government decision workspace";

  const roleIntro =
    role === "startup"
      ? "What a founder sees: published criteria before applying, a visible pilot, and a reusable verified record after success."
      : role === "validator"
        ? "Independent sign-off happens only after the pilot closes, measurements are sealed, and every evidence artifact verifies."
        : "One department runs a transparent competitive pilot. Another discovers its verified result. PRAMAAN supplies the evidence for the decision.";

  return (
    <div>
      <PageHeader
        eyebrow={roleHeading}
        title="Prove once. Reuse the proof."
        description={roleIntro}
      />

      <div className="mt-8 space-y-10">
        {role === "government" && (
          <DataState loading={challenges.loading} error={challenges.error}>
            {renderGovernment()}
          </DataState>
        )}

        {role === "startup" && renderStartup()}

        {role === "validator" && renderValidator()}

        <Section
          kicker="Trust model"
          title="Why the result is defensible"
          subtitle="PRAMAAN is not a claim system. These five properties are enforced by the workflow, and every screen in this demo shows their traces."
        >
          <ol className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
            {TRUST_RULES.map(([title, body], i) => (
              <li key={title} className="flex gap-4 border-l-2 border-line pl-4">
                <span className={`${micro} pt-0.5`}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-14 font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-13 leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );

  function renderGovernment() {
    const all = challenges.data?.challenges ?? [];
    const health = all.find((c) => c.id === 1);
    const reuse = all.find((c) => c.id === 2);
    const pilot = health?.pilots[0];
    const record = vprs.data?.vprs[0];

    return (
      <>
        <Section
          kicker="Departments"
          title="Government workspaces"
          subtitle="Two Karnataka departments at two moments of the same story: a completed, verified pilot and an open challenge waiting to reuse it."
        >
          <TableFrame>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Department</th>
                  <th className={thCls}>Challenge</th>
                  <th className={thCls}>KPI target</th>
                  <th className={thCls}>State</th>
                  <th className={thCls}>Action</th>
                </tr>
              </thead>
              <tbody>
                {health && (
                  <tr>
                    <td className={tdCls}>
                      <p className="font-semibold">{health.department.short_name}</p>
                      <p className="text-muted">{health.department.name}</p>
                    </td>
                    <td className={`${tdCls} max-w-[300px]`}>{health.title}</td>
                    <td className={`${tdCls} mono`}>
                      {health.kpi.target_operator === "lte" ? "\u2264" : ""}{" "}
                      {health.kpi.target_value} {health.kpi.unit}
                    </td>
                    <td className={tdCls}>
                      {pilot ? (
                        <StatusMark label="Pilot journey complete" tone="ok" />
                      ) : (
                        <StatusMark label="Applications open" tone="current" />
                      )}
                      {record && pilot && (
                        <p className="mt-1 text-12 text-muted">
                          Verdict MET, VPR {record.reference}
                        </p>
                      )}
                      {pilot && (
                        <div className="mt-2 max-w-[200px]">
                          <StepBar
                            segments={8}
                            done={pilotGates(pilot.status)}
                            label="Journey progress"
                          />
                        </div>
                      )}
                    </td>
                    <td className={tdCls}>
                      {pilot ? (
                        <Button onClick={() => navigate(`/pilots/${pilot.id}`)}>
                          Open journey
                        </Button>
                      ) : (
                        <Button onClick={() => navigate("/challenges/1")}>
                          Review applications
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
                {reuse && (
                  <tr>
                    <td className={tdCls}>
                      <p className="font-semibold">{reuse.department.short_name}</p>
                      <p className="text-muted">{reuse.department.name}</p>
                    </td>
                    <td className={`${tdCls} max-w-[300px]`}>{reuse.title}</td>
                    <td className={`${tdCls} mono`}>
                      {reuse.kpi.target_operator === "lte" ? "\u2264" : ""}{" "}
                      {reuse.kpi.target_value} {reuse.kpi.unit}
                    </td>
                    <td className={tdCls}>
                      {reuse.status === "OPEN" ? (
                        <StatusMark label="Discovery open" tone="neutral" />
                      ) : reuse.status === "IN_PILOT" ? (
                        <StatusMark label="Confirmatory pilot running" tone="current" />
                      ) : (
                        <StatusMark label="Evidence accepted" tone="ok" />
                      )}
                      <div className="mt-2 max-w-[200px]">
                        <StepBar
                          segments={8}
                          done={reuseGates(reuse.status)}
                          label="Journey progress"
                        />
                      </div>
                    </td>
                    <td className={tdCls}>
                      <Button onClick={() => navigate("/challenges/2")}>
                        {reuse.status === "OPEN" ? "Review proof" : "Open record"}
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>
        </Section>

        <Section
          kicker="Decisions that need attention"
          title="Where the process stands"
          subtitle="The route from government problem to reusable proof, at the current moment in the dataset."
        >
          <DefList
            columns={2}
            rows={[
              ["Challenge 1 (KHFW)", pilot ? `Competitive pilot complete. ${record ? `Verdict MET and ${record.reference} issued.` : "Verdict pending."}` : "Publishing and accepting applications."],
              ["Challenge 2 (Karnataka One)", reuse && reuse.status === "OPEN" ? "A verified record from KHFW matches this challenge. Decide to reuse the evidence or run a confirmatory pilot." : "Decision recorded. Open the challenge to see the outcome."],
              ["Payments", pilot ? "All milestone payments released against validation and verdict. See the pilot journey." : "No pilot yet."],
              ["What PRAMAAN does not do", "It never awards procurement. It supplies verified evidence so the department can."],
            ]}
          />
        </Section>
      </>
    );
  }

  function renderStartup() {
    const pravaah = startups.data?.startups.find((s) => s.name.includes("Pravaah"));
    const all = challenges.data?.challenges ?? [];
    const pilot = all.find((c) => c.id === 1)?.pilots[0];
    const record = vprs.data?.vprs[0];

    return (
      <Section
        kicker="Founder"
        title={`${pravaah?.name ?? "Pravaah Health Systems"} workspace`}
        subtitle={pravaah?.tagline}
      >
        <div className="space-y-6">
          <DefList
            columns={3}
            rows={[
              ["Application to KHFW challenge", "SELECTED after competitive evaluation"],
              ["Pilot status", pilot?.status === "VERDICTED" ? "Completed, verdict MET" : pilot?.status ?? "No pilot yet"],
              ["Verified Pilot Record", record ? `Issued ${fmtDate(record.issued_at)}, ${record.reference}` : "Not issued"],
            ]}
          />
          <p className="max-w-3xl text-13 leading-relaxed text-muted">
            The founder saw the eligibility rules, the scoring dimensions, and
            the pilot expectations before applying. During the pilot, weekly
            measurements and evidence were visible. The verified record now
            travels with the company to future government opportunities.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/startups/1")}>Open founder profile</Button>
            {pilot && (
              <Button tone="plain" onClick={() => navigate(`/pilots/${pilot.id}`)}>
                View pilot journey
              </Button>
            )}
            {record && (
              <Button tone="plain" onClick={() => navigate(`/records/${record.id}`)}>
                Open {record.reference}
              </Button>
            )}
          </div>
        </div>
      </Section>
    );
  }

  function renderValidator() {
    const all = challenges.data?.challenges ?? [];
    const pilot = all.find((c) => c.id === 1)?.pilots[0];
    const record = vprs.data?.vprs[0];

    return (
      <Section
        kicker="Independent validation"
        title="Validation queue"
        subtitle="Sign-off happens after the measurement window closes, against the sealed protocol, only when every artifact verifies."
      >
        <DefList
          columns={2}
          rows={[
            ["Pilot 1 (KHFW)", record ? `Validation complete by an independent evaluator. Verdict ${record.outcome}.` : "Awaiting validator sign-off; open the journey."],
            ["Evidence", "4 artifacts, each with a recorded SHA-256 and a passing integrity check."],
            ["Audit trail", "Every workflow event is chained. Open the Verified Pilot Record to verify the chain."],
          ]}
        />
        <div className="mt-4">
          {pilot && (
            <Button onClick={() => navigate(`/pilots/${pilot.id}`)}>
              Review validation state
            </Button>
          )}
        </div>
      </Section>
    );
  }
}
