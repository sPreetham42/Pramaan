import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ApiHealth } from "../types";

type Status =
  | { kind: "loading" }
  | { kind: "ok"; health: ApiHealth }
  | { kind: "error"; message: string };

/** Fetches GET /health once on mount to demonstrate frontend-backend wiring. */
export default function BackendStatus() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((health) => {
        if (!cancelled) setStatus({ kind: "ok", health });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <p className="text-sm text-slate-500" aria-live="polite">
        Checking backend&hellip;
      </p>
    );
  }

  if (status.kind === "error") {
    return (
      <p className="text-sm text-red-600" aria-live="polite">
        Backend unreachable ({status.message})
      </p>
    );
  }

  const { health } = status;
  return (
    <p className="text-sm text-slate-600" aria-live="polite">
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />
      Backend connected &middot; database {health.checks.database} &middot;
      storage {health.checks.storage}
    </p>
  );
}
