import { api } from "../api/client";
import { useData } from "../lib/hooks";
import { navigate } from "../router";
import { useRole } from "../AppShell";
import {
  Button,
  DataState,
  DefList,
  EmptyState,
  PageHeader,
  Section,
  StatusMark,
  fmtDate,
  micro,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { StatusTone } from "../components/ui";

function appStatus(status: string): { label: string; tone: StatusTone } {
  if (status === "SELECTED") return { label: "Selected for pilot", tone: "ok" };
  if (status === "INELIGIBLE") return { label: "Screened out", tone: "danger" };
  if (status === "NOT_SELECTED") return { label: "Not selected", tone: "neutral" };
  return { label: "Under review", tone: "current" };
}

export default function StartupDetailPage({ id }: { id: number }) {
  const { role } = useRole();
  const detail = useData(`startup-${id}`, () => api.startups.get(id));
  const isFounderView = role === "startup";

  if (detail.error || (!detail.data && !detail.loading)) {
    return (
      <div className="mt-8">
        <DataState loading={false} error={detail.error} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="mt-8">
        <DataState loading={true} error={null} />
      </div>
    );
  }

  const { startup, applications, pilots } = detail.data;

  return (
    <div>
      <PageHeader
        eyebrow={`${startup.sector} \u00b7 ${startup.city}`}
        title={startup.name}
        description={startup.tagline}
        actions={
          pilots.length > 0 ? (
            <Button onClick={() => navigate(`/pilots/${pilots[0].id}`)}>Open the pilot</Button>
          ) : undefined
        }
      />

      <div className="mt-8 space-y-10">
        {isFounderView && (
          <Section
            kicker="Founder view"
            title="What the founder knows at every step"
            subtitle="Published criteria before applying, transparent screening and scoring, visible pilot milestones, and a reusable record afterwards."
          >
            <ol className="space-y-2.5 text-13 text-ink">
              {[
                "Read the problem, the KPI target, the eligibility rules, and the scoring dimensions before applying.",
                "Track the application from submission through screening and expert evaluation.",
                "See the pilot protocol, milestones, and the evidence required before the pilot starts.",
                "Watch measurements and validation progress live.",
                "Receive a Verified Pilot Record after a successful outcome.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className={`${micro} pt-0.5 text-accent`}>{String(i + 1).padStart(2, "0")}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section kicker="Profile" title="Company">
          <DefList
            columns={3}
            rows={[
              ["Name", startup.name],
              ["Sector", startup.sector],
              ["City", startup.city],
              ["Wins", String(pilots.length > 0 ? 1 : 0)],
              ["Verified records", applications.some((a) => a.status === "SELECTED") ? "1 issued after pilot success" : "None"],
              ["Description", startup.description],
            ]}
          />
        </Section>

        <Section
          kicker="Applications"
          title="Applications and their evaluation trail"
          subtitle="Eligibility checks and expert scores with visible reasons, exactly as the department recorded them."
        >
          {applications.length === 0 ? (
            <EmptyState
              title="No applications yet"
              body="Applications appear here once the startup applies to a published challenge."
            />
          ) : (
            <div className="space-y-8">
              {applications.map((a) => {
                const st = appStatus(a.status);
                return (
                  <div key={a.id} className="border border-line bg-surface">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                      <div>
                        <p className="text-14 font-semibold">{a.challenge_title}</p>
                        <p className="text-12 text-muted">
                          {a.department} &middot; submitted {fmtDate(a.submitted_on)}
                        </p>
                      </div>
                      <StatusMark label={st.label} tone={st.tone} />
                    </div>
                    <div className="space-y-5 px-4 py-4">
                      {a.eligibility.checks.length > 0 && (
                        <div>
                          <p className={`${micro} mb-2`}>Eligibility screening</p>
                          <div className="overflow-x-auto">
                            <table className={tableCls}>
                              <tbody>
                                {a.eligibility.checks.map((c) => (
                                  <tr key={c.check}>
                                    <td className={tdCls}>{c.check}</td>
                                    <td className={`${tdCls} w-32`}>
                                      <StatusMark
                                        tone={c.met ? "ok" : "danger"}
                                        label={c.met ? "Met" : "Not met"}
                                      />
                                    </td>
                                    <td className={`${tdCls} max-w-[420px] text-muted`}>{c.detail}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {a.evaluations.length > 0 && (
                        <div>
                          <p className={`${micro} mb-2`}>Expert evaluation</p>
                          <div className="overflow-x-auto">
                            <table className={tableCls}>
                              <thead>
                                <tr>
                                  <th className={thCls}>Evaluator</th>
                                  <th className={thCls}>Dimension</th>
                                  <th className={thCls}>Score</th>
                                  <th className={thCls}>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {a.evaluations.map((e) =>
                                  e.dimensions.map((d) => (
                                    <tr key={`${e.id}-${d.dimension}`}>
                                      <td className={tdCls}>{e.evaluator_name}</td>
                                      <td className={tdCls}>{d.dimension}</td>
                                      <td className={`${tdCls} mono`}>{d.score.toFixed(1)} / 5</td>
                                      <td className={`${tdCls} max-w-[420px] text-muted`}>{d.note}</td>
                                    </tr>
                                  )),
                                )}
                              </tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-12 text-muted">
                            <span className="font-medium text-ink">Panel summary: </span>
                            {a.evaluations.map((e) => e.summary).join(" ")}
                          </p>
                        </div>
                      )}
                      {a.evaluations.length === 0 && a.status === "INELIGIBLE" && (
                        <p className="text-13 text-muted">
                          Screened out against the published eligibility criteria, so no
                          expert evaluation was recorded.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {pilots.length > 0 && (
          <Section kicker="Pilots" title="Pilot history">
            <div className="overflow-x-auto border border-line bg-surface">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Pilot</th>
                    <th className={thCls}>Challenge</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {pilots.map((p) => (
                    <tr key={p.id}>
                      <td className={`${tdCls} mono`}>Pilot #{p.id}</td>
                      <td className={tdCls}>{p.challenge}</td>
                      <td className={tdCls}>{p.status.replace("_", " ")}</td>
                      <td className={tdCls}>
                        <Button tone="plain" onClick={() => navigate(`/pilots/${p.id}`)}>
                          Open journey
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
