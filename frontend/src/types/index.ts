/** Shared API types. Module developers add their domain types here. */

export type ComponentStatus = "ok" | "unavailable";

export interface HealthChecks {
  database: ComponentStatus;
  storage: ComponentStatus;
}

export interface ApiHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  checks: HealthChecks;
}
