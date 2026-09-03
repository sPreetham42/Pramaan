import { api } from "../api/client";
import { useData } from "../lib/hooks";
import { navigate } from "../router";
import {
  Button,
  DataState,
  EmptyState,
  PageHeader,
  StatusMark,
  TableFrame,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { StatusTone } from "../components/ui";

function appState(status: string): { label: string; tone: StatusTone } {
  if (status === "SELECTED") return { label: "Selected", tone: "ok" };
  if (status === "INELIGIBLE") return { label: "Ineligible", tone: "danger" };
  if (status === "NOT_SELECTED") return { label: "Not selected", tone: "neutral" };
  return { label: "Under review", tone: "current" };
}

export default function StartupsPage() {
  const startups = useData("startups", () => api.startups.list());

  return (
    <div>
      <PageHeader
        eyebrow="Applicants"
        title="Startups"
        description="Every applicant sees the published criteria and the same screening and scoring record the department sees."
      />
      <div className="mt-6">
        <DataState loading={startups.loading} error={startups.error}>
          {!startups.data || startups.data.startups.length === 0 ? (
            <EmptyState
              title="No startups in the registry yet"
              body="Startups join the registry by applying to a published challenge."
            />
          ) : (
            <TableFrame>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Startup</th>
                    <th className={thCls}>Sector</th>
                    <th className={thCls}>Applications</th>
                    <th className={thCls}>Wins</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {startups.data.startups.map((s) => (
                    <tr key={s.id}>
                      <td className={tdCls}>
                        <p className="font-semibold">{s.name}</p>
                        <p className="max-w-[380px] text-muted">{s.tagline}</p>
                      </td>
                      <td className={tdCls}>{s.sector}</td>
                      <td className={tdCls}>
                        {s.applications.length === 0 ? (
                          <span className="text-muted">None</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {s.applications.map((a) => {
                              const st = appState(a.status);
                              return (
                                <li key={a.id}>
                                  <StatusMark
                                    label={st.label}
                                    tone={st.tone}
                                    meta={a.department}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className={tdCls}>{s.wins}</td>
                      <td className={tdCls}>
                        <Button tone="plain" onClick={() => navigate(`/startups/${s.id}`)}>
                          Open profile
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}
        </DataState>
      </div>
    </div>
  );
}
