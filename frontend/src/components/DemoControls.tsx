import { useState } from "react";
import { api } from "../api/client";
import { useAction, useData } from "../lib/hooks";
import type { DemoState, PilotDetail } from "../types";
import { navigate } from "../router";
import { Button, Notice, fieldCls } from "./ui";

/**
 * Explicit presentation tools for the SIH demo. These are not product
 * features: milestone resets replay the scenario, "sync week" produces the
 * deterministic telemetry a running pilot would receive from site systems,
 * and "tamper" flips one byte of an artifact to demonstrate integrity
 * detection. The API refuses all of these when demo mode is off.
 */
export default function DemoControls({
  pilot,
  onMutated,
}: {
  pilot?: PilotDetail | null;
  onMutated?: () => void;
}) {
  const demo = useData<DemoState | null>("demo-state", async () => {
    try {
      return await api.demo.state();
    } catch {
      return null;
    }
  });
  const [milestone, setMilestone] = useState<string>("PROTOCOL_DRAFT");
  const [tamperId, setTamperId] = useState<number | null>(null);
  const resetAction = useAction();
  const syncAction = useAction();
  const tamperAction = useAction();

  if (demo.data === null) return null;

  const canSync = pilot?.status === "RUNNING";
  const canTamper =
    pilot != null && pilot.verdict == null && pilot.evidence.length > 0;
  const tamperTarget = pilot?.evidence.find((e) => e.id === tamperId) ?? null;

  const reset = async () => {
    const ok = await resetAction.run(() => api.demo.reset(milestone));
    if (ok) {
      // Full reload: every page refetches cleanly from the reset scenario.
      navigate("/challenges/1");
      window.location.reload();
    }
  };

  return (
    <div className="border border-ink bg-paper">
      <div className="border-b border-ink bg-ink px-4 py-2">
        <p className="text-11 font-semibold uppercase tracking-[0.14em] text-paper">
          Demo controls
        </p>
        <p className="text-11 text-paper/70">
          Presentation tools for the SIH prototype. Not part of the product workflow.
        </p>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div>
          <p className="mb-1.5 text-12 font-semibold text-ink">
            Reset scenario to a stage
          </p>
          <div className="flex gap-2">
            <select
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
              className={`${fieldCls} min-w-0 flex-1 cursor-pointer`}
            >
              {(demo.data.milestones ?? []).map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <Button tone="primary" busy={resetAction.busy} onClick={reset}>
              Reset
            </Button>
          </div>
          <p className="mt-1.5 text-11 leading-relaxed text-muted">
            Wipes the demo dataset and replays the real workflow to the chosen
            stage. Use PROTOCOL_DRAFT to run the live approval and seal sequence.
          </p>
          {resetAction.error && (
            <div className="mt-2">
              <Notice tone="fail">{resetAction.error}</Notice>
            </div>
          )}
        </div>

        {pilot && (
          <div className="border-t border-line pt-3">
            <p className="mb-1.5 text-12 font-semibold text-ink">
              Pilot telemetry
            </p>
            {canSync ? (
              <>
                <Button
                  tone="primary"
                  busy={syncAction.busy}
                  onClick={async () => {
                    const ok = await syncAction.run(() =>
                      api.demo.syncWeek(pilot.id),
                    );
                    if (ok) onMutated?.();
                  }}
                >
                  Sync next demo week
                </Button>
                <p className="mt-1.5 text-11 leading-relaxed text-muted">
                  Records the next scheduled weekly sample plus its evidence
                  artifact. Four weeks close the measurement window.
                </p>
              </>
            ) : (
              <p className="text-12 text-muted">
                Available while the pilot is running.
              </p>
            )}
            {syncAction.error && (
              <div className="mt-2">
                <Notice tone="fail">{syncAction.error}</Notice>
              </div>
            )}
          </div>
        )}

        {pilot && pilot.evidence.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="mb-1.5 text-12 font-semibold text-ink">
              Tamper demonstration
            </p>
            <div className="flex gap-2">
              <select
                value={tamperTarget?.id ?? pilot.evidence[0].id}
                onChange={(e) => setTamperId(Number(e.target.value))}
                className={`${fieldCls} min-w-0 flex-1 cursor-pointer`}
              >
                {pilot.evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              <Button
                tone="danger"
                disabled={!canTamper}
                busy={tamperAction.busy}
                onClick={async () => {
                  const target =
                    tamperTarget ?? pilot.evidence.find((e) => e.id === tamperId);
                  if (!target) return;
                  const ok = await tamperAction.run(() =>
                    api.demo.tamper(target.id),
                  );
                  if (ok) onMutated?.();
                }}
              >
                Tamper
              </Button>
            </div>
            <p className="mt-1.5 text-11 leading-relaxed text-muted">
              Flips one byte of the stored artifact. Re-run evidence
              verification to watch the hash mismatch surface. Blocked once a
              verdict is issued.
            </p>
            {tamperAction.error && (
              <div className="mt-2">
                <Notice tone="fail">{tamperAction.error}</Notice>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
