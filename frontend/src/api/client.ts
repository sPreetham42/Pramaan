import type {
  ApiHealth,
  AuditVerifyResult,
  Challenge,
  DemoState,
  Department,
  DiscoveryItem,
  Evidence,
  EvidenceRow,
  PilotBrief,
  PilotDetail,
  Protocol,
  ReuseDecisionOut,
  Startup,
  StartupApplication,
  StartupListItem,
  TemplateDoc,
  VprDetail,
  VprSummary,
} from "../types";
import demoSnapshot from "../static-data/demo.json";

/**
 * Centralised API client. All HTTP goes through here; components never call
 * fetch() directly. Paths are relative; nginx (Docker) or the Vite proxy
 * (local development) forwards /api and /health to the backend.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Static (GitHub Pages) mode: built with VITE_STATIC_DEMO=true, every GET
 * is answered from the committed snapshot of the seeded demo data and every
 * mutation is refused, so the hosted demo stays honest (read-only preview).
 */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";

const STATIC_ROUTES: Record<string, () => unknown> = {
  "/health": () => demoSnapshot.health,
  "/api/v1/challenges": () => demoSnapshot.challenges,
  "/api/v1/challenges/1": () => demoSnapshot.challengesById["1"],
  "/api/v1/challenges/2": () => demoSnapshot.challengesById["2"],
  "/api/v1/pilots/1": () => demoSnapshot.pilotsById["1"],
  "/api/v1/startups": () => demoSnapshot.startups,
  "/api/v1/startups/1": () => demoSnapshot.startupsById["1"],
  "/api/v1/startups/2": () => demoSnapshot.startupsById["2"],
  "/api/v1/startups/3": () => demoSnapshot.startupsById["3"],
  "/api/v1/evidence": () => demoSnapshot.evidence,
  "/api/v1/vprs": () => demoSnapshot.vprs,
  "/api/v1/vprs/1": () => demoSnapshot.vprsById["1"],
};

function staticLookup(path: string): unknown | undefined {
  return STATIC_ROUTES[path]?.();
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function messageFrom(body: unknown): string {
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const first = detail[0];
      if (first && typeof first === "object") {
        const msg = (first as { msg?: unknown }).msg;
        if (typeof msg === "string") return msg;
      }
    }
  }
  return "Request failed";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (STATIC_DEMO) {
    const method = (options?.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      throw new ApiError(
        "This static preview is read-only. Run the app locally (README) for the interactive demo.",
        405,
      );
    }
    const hit = staticLookup(path);
    if (hit !== undefined) {
      return new Promise<T>((resolve) => {
        setTimeout(() => resolve(hit as T), 120);
      });
    }
    throw new ApiError(`Static preview has no data for ${path}.`, 404);
  }
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      message = messageFrom(await response.json());
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonOptions(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export const api = {
  /** True when built for the GitHub Pages static preview. */
  staticMode: STATIC_DEMO,

  health: () => request<ApiHealth>("/health"),

  departments: {
    list: () => request<{ departments: Department[] }>("/api/v1/departments"),
  },

  challenges: {
    list: () => request<{ challenges: Challenge[] }>("/api/v1/challenges"),
    get: (id: number) => request<Challenge>(`/api/v1/challenges/${id}`),
    templates: (id: number) =>
      request<{ challenge_id: number; templates: TemplateDoc[] }>(
        `/api/v1/challenges/${id}/templates`,
      ),
    proof: (id: number) =>
      request<{ challenge_id: number; challenge_status: string; discovery: DiscoveryItem[] }>(
        `/api/v1/challenges/${id}/proof`,
      ),
    selectPilot: (challengeId: number, startupId: number, scope?: string) =>
      request<PilotDetail>(`/api/v1/challenges/${challengeId}/pilots`, {
        ...jsonOptions("POST", { startup_id: startupId, scope: scope ?? null }),
      }),
    reuseDecision: (
      challengeId: number,
      vprId: number,
      action: "REUSE_EVIDENCE" | "CONFIRMATORY_PILOT",
      rationale: string,
      decidedBy: string,
    ) =>
      request<{ decision: ReuseDecisionOut; challenge: Challenge }>(
        `/api/v1/challenges/${challengeId}/reuse-decision`,
        jsonOptions("POST", {
          vpr_id: vprId,
          action,
          rationale,
          decided_by: decidedBy,
        }),
      ),
  },

  startups: {
    list: () => request<{ startups: StartupListItem[] }>("/api/v1/startups"),
    get: (id: number) =>
      request<{ startup: Startup; applications: StartupApplication[]; pilots: PilotBrief[] }>(
        `/api/v1/startups/${id}`,
      ),
  },

  pilots: {
    list: () => request<{ pilots: PilotBrief[] }>("/api/v1/pilots"),
    get: (id: number) => request<PilotDetail>(`/api/v1/pilots/${id}`),
    result: (id: number) =>
      request<{ observed_value: number; met: boolean; sample_count: number }>(
        `/api/v1/pilots/${id}/result`,
      ),
    saveProtocol: (id: number, body: ProtocolDraftInput) =>
      request<{ protocol: Protocol }>(
        `/api/v1/pilots/${id}/protocol`,
        jsonOptions("PUT", body),
      ),
    approveProtocol: (id: number) =>
      request<{ status: string; protocol: Protocol }>(
        `/api/v1/pilots/${id}/protocol/approve`,
        jsonOptions("POST"),
      ),
    sealProtocol: (id: number) =>
      request<{ status: string; protocol: Protocol }>(
        `/api/v1/pilots/${id}/protocol/seal`,
        jsonOptions("POST"),
      ),
    newProtocolVersion: (id: number) =>
      request<{ protocol: Protocol }>(
        `/api/v1/pilots/${id}/protocol/versions`,
        jsonOptions("POST"),
      ),
    start: (id: number) =>
      request<{ status: string }>(`/api/v1/pilots/${id}/start`, jsonOptions("POST")),
    recordMeasurement: (id: number, body: MeasurementInput) =>
      request<{ measurement: { id: number } }>(
        `/api/v1/pilots/${id}/measurements`,
        jsonOptions("POST", body),
      ),
    close: (id: number) =>
      request<{ status: string }>(`/api/v1/pilots/${id}/close`, jsonOptions("POST")),
    openValidation: (id: number, validatorName: string) =>
      request<{ validation: { id: number; status: string } }>(
        `/api/v1/pilots/${id}/validation`,
        jsonOptions("POST", { validator_name: validatorName }),
      ),
    approveValidation: (id: number, notes: string) =>
      request<{ validation: { id: number; status: string } }>(
        `/api/v1/pilots/${id}/validation/approve`,
        jsonOptions("POST", { notes }),
      ),
    issueVerdict: (id: number, issuedBy: string) =>
      request<PilotDetail>(`/api/v1/pilots/${id}/verdict`, {
        ...jsonOptions("POST", { issued_by: issuedBy }),
      }),
  },

  evidence: {
    list: () => request<{ evidence: EvidenceRow[] }>("/api/v1/evidence"),
    get: (id: number) => request<Evidence>(`/api/v1/evidence/${id}`),
    verify: (id: number) =>
      request<{
        ok: boolean;
        recorded_hash: string;
        computed_hash: string | null;
        note: string;
        storage_backend: string;
        checked_at: string | null;
      }>(`/api/v1/evidence/${id}/verify`, jsonOptions("POST")),
    downloadUrl: (id: number) => `${BASE_URL}/api/v1/evidence/${id}/download`,
    upload: (
      pilotId: number,
      file: File,
      meta: { title: string; kind: string; description: string; source: string },
    ) => {
      const form = new FormData();
      form.append("file", file);
      form.append("title", meta.title);
      form.append("kind", meta.kind);
      form.append("description", meta.description);
      form.append("source", meta.source);
      return request<{ evidence: Evidence }>(`/api/v1/pilots/${pilotId}/evidence`, {
        method: "POST",
        body: form,
      });
    },
  },

  vprs: {
    list: () => request<{ vprs: VprSummary[] }>("/api/v1/vprs"),
    get: (id: number) => request<VprDetail>(`/api/v1/vprs/${id}`),
    auditVerify: (id: number) =>
      request<AuditVerifyResult>(`/api/v1/vprs/${id}/audit-verify`),
  },

  demo: {
    state: () => request<DemoState>("/api/v1/demo/state"),
    reset: (milestone: string) =>
      request<{ milestone: string; seeded: boolean }>(
        "/api/v1/demo/reset",
        jsonOptions("POST", { milestone }),
      ),
    syncWeek: (pilotId: number) =>
      request<{ pilot_status: string; closed: boolean }>(
        "/api/v1/demo/sync-week",
        jsonOptions("POST", { pilot_id: pilotId }),
      ),
    tamper: (evidenceId: number) =>
      request<{ altered: number; note: string }>(
        "/api/v1/demo/tamper",
        jsonOptions("POST", { evidence_id: evidenceId }),
      ),
  },
};

export interface ProtocolDraftInput {
  metric: string;
  target_operator: string;
  target_value: number;
  unit: string;
  duration_days: number;
  sample_interval: string;
  measurement_method: string;
  success_rule?: string;
}

export interface MeasurementInput {
  label: string;
  value: number;
  recorded_on: string;
  source: string;
}
