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
  opText,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { StatusTone } from "../components/ui";

function stateOf(c: {
  status: string;
  pilots: { status: string }[];
}): { label: string; tone: StatusTone } {
  const pilot = c.pilots[0];
  if (c.status === "OPEN") return { label: "Open for applications", tone: "current" };
  if (c.status === "IN_PILOT") return { label: "Pilot running", tone: "current" };
  if (pilot?.status === "VERDICTED") return { label: "Pilot complete", tone: "ok" };
  return { label: "Completed", tone: "neutral" };
}

export default function ChallengesPage() {
  const challenges = useData("challenges", () => api.challenges.list());

  return (
    <div>
      <PageHeader
        eyebrow="Government"
        title="Challenges"
        description="Published problems with published criteria. Applicants see the rules before they apply; departments compare candidates on evidence."
      />
      <div className="mt-6">
        <DataState loading={challenges.loading} error={challenges.error}>
          {!challenges.data || challenges.data.challenges.length === 0 ? (
            <EmptyState
              title="No challenges published yet"
              body="A challenge is the starting point of the journey: a problem, a KPI target, eligibility rules, and evaluation criteria."
            />
          ) : (
            <TableFrame>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Department</th>
                    <th className={thCls}>Challenge</th>
                    <th className={thCls}>KPI</th>
                    <th className={thCls}>Target</th>
                    <th className={thCls}>Status</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.data.challenges.map((c) => {
                    const target = `${opText(c.kpi.target_operator)} ${c.kpi.target_value} ${c.kpi.unit}`;
                    const pilot = c.pilots[0];
                    const state = stateOf(c);
                    return (
                      <tr key={c.id}>
                        <td className={tdCls}>
                          <p className="font-semibold">{c.department.short_name}</p>
                          <p className="text-muted">{c.department.name}</p>
                        </td>
                        <td className={`${tdCls} max-w-[340px]`}>{c.title}</td>
                        <td className={`${tdCls} max-w-[220px] text-muted`}>{c.kpi.metric}</td>
                        <td className={`${tdCls} mono`}>{target}</td>
                        <td className={tdCls}>
                          <StatusMark label={state.label} tone={state.tone} />
                        </td>
                        <td className={tdCls}>
                          <Button
                            tone="plain"
                            onClick={() =>
                              navigate(c.id === 1 && pilot ? `/pilots/${pilot.id}` : `/challenges/${c.id}`)
                            }
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableFrame>
          )}
        </DataState>
      </div>
    </div>
  );
}
