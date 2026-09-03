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
  fmtDate,
  opText,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";

export default function RecordsPage() {
  const vprs = useData("vprs", () => api.vprs.list());

  return (
    <div>
      <PageHeader
        eyebrow="Reusable proof"
        title="Verified Pilot Records"
        description="The reusable output of a pilot: who was tested, against which sealed criteria, with what evidence and what verdict. Another department can build a decision on this record."
      />
      <div className="mt-6">
        <DataState loading={vprs.loading} error={vprs.error}>
          {!vprs.data || vprs.data.vprs.length === 0 ? (
            <EmptyState
              title="No verified records yet"
              body="A Verified Pilot Record is issued after a pilot closes, its evidence verifies, and an independent validator signs off."
            />
          ) : (
            <TableFrame>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Record</th>
                    <th className={thCls}>Department</th>
                    <th className={thCls}>Startup</th>
                    <th className={thCls}>Challenge</th>
                    <th className={thCls}>Result</th>
                    <th className={thCls}>Issued</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {vprs.data.vprs.map((v) => (
                    <tr key={v.id}>
                      <td className={`${tdCls} mono`}>{v.reference}</td>
                      <td className={tdCls}>{v.department_name}</td>
                      <td className={tdCls}>{v.startup}</td>
                      <td className={`${tdCls} max-w-[280px] text-muted`}>{v.challenge}</td>
                      <td className={tdCls}>
                        <StatusMark
                          tone={v.outcome === "MET" ? "ok" : "danger"}
                          label={v.outcome}
                          meta={`${v.observed_value} ${v.unit}, target ${opText("lte")} ${v.target_value} ${v.unit}`}
                        />
                      </td>
                      <td className={tdCls}>{fmtDate(v.issued_at)}</td>
                      <td className={tdCls}>
                        <Button onClick={() => navigate(`/records/${v.id}`)}>Open record</Button>
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
