import { useState } from "react";
import { api } from "../api/client";
import { useAction, useData } from "../lib/hooks";
import { navigate } from "../router";
import {
  Button,
  DataState,
  EmptyState,
  Notice,
  PageHeader,
  StatusMark,
  TableFrame,
  fmtDate,
  shortHash,
  tableCls,
  tdCls,
  thCls,
} from "../components/ui";
import type { StatusTone } from "../components/ui";

export default function EvidencePage() {
  const list = useData("evidence", () => api.evidence.list());
  const verifyAction = useAction();
  const [result, setResult] = useState<Record<number, { ok: boolean; note: string }>>({});

  const verify = async (id: number) => {
    const ok = await verifyAction.run(async () => {
      const check = await api.evidence.verify(id);
      setResult((r) => ({ ...r, [id]: { ok: check.ok, note: check.note } }));
    });
    if (ok) list.refresh();
  };

  const anyFailed = Object.values(result).some((r) => !r.ok);

  return (
    <div>
      <PageHeader
        eyebrow="Pilot artifacts"
        title="Evidence"
        description="Every artifact stores its bytes, its server-computed SHA-256, and its provenance. Verification recomputes the hash over the stored bytes, so a change is detected, not claimed away."
      />
      <div className="mt-6 space-y-4">
        {verifyAction.error && <Notice tone="fail">{verifyAction.error}</Notice>}

        <DataState loading={list.loading} error={list.error}>
          {!list.data || list.data.evidence.length === 0 ? (
            <EmptyState
              title="No evidence recorded yet"
              body="Artifacts appear here as pilot weeks are sampled and files are uploaded."
            />
          ) : (
            <TableFrame>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Artifact</th>
                    <th className={thCls}>Pilot</th>
                    <th className={thCls}>Source</th>
                    <th className={thCls}>Recorded</th>
                    <th className={thCls}>SHA-256</th>
                    <th className={thCls}>Storage</th>
                    <th className={thCls}>Integrity</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.evidence.map((e) => {
                    const row = result[e.id];
                    const latestOk = row ? row.ok : (e.latest_check?.ok ?? null);
                    let integrity: { label: string; tone: StatusTone; meta?: string } = {
                      label: "Not checked",
                      tone: "neutral",
                    };
                    if (row) {
                      integrity = row.ok
                        ? { label: "Verification passed", tone: "ok" }
                        : { label: "Integrity failure", tone: "danger" };
                    } else if (latestOk === true) {
                      integrity = { label: "Verified", tone: "ok" };
                    } else if (latestOk === false) {
                      integrity = { label: "Verification failed", tone: "danger" };
                    }
                    return (
                      <tr key={e.id}>
                        <td className={tdCls}>
                          <p className="font-semibold">{e.title}</p>
                          <p className="text-muted">{e.filename}</p>
                        </td>
                        <td className={tdCls}>
                          <button
                            className="text-left text-accent hover:underline"
                            onClick={() => navigate(`/pilots/${e.pilot_id}`)}
                          >
                            {e.department} / {e.startup}
                          </button>
                          <p className="text-muted">{e.kind.replace("_", " ")}</p>
                        </td>
                        <td className={`${tdCls} max-w-[220px] text-muted`}>{e.source}</td>
                        <td className={tdCls}>{fmtDate(e.occurred_on)}</td>
                        <td className={`${tdCls} mono`}>{shortHash(e.sha256, 16)}</td>
                        <td className={`${tdCls} mono`}>
                          {e.storage_backend === "minio" ? "MinIO" : "local demo"}
                        </td>
                        <td className={tdCls}>
                          <StatusMark label={integrity.label} tone={integrity.tone} />
                        </td>
                        <td className={tdCls}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button tone="plain" busy={verifyAction.busy} onClick={() => verify(e.id)}>
                              Verify
                            </Button>
                            <a
                              className="inline-flex items-center px-2 py-1 text-13 text-accent hover:text-accent-strong hover:underline"
                              href={api.evidence.downloadUrl(e.id)}
                            >
                              Download
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableFrame>
          )}

          {anyFailed && (
            <Notice tone="fail">
              A verification failed. The stored bytes no longer match the
              recorded hash. Try it from the journey demo controls: tampering
              alters the artifact and this check detects it.
            </Notice>
          )}
        </DataState>
      </div>
    </div>
  );
}
