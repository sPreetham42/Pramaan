/** Shared API types mirroring the backend serializers. */

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

export type Role = "government" | "startup" | "validator";

export interface Department {
  id: number;
  name: string;
  short_name: string;
  description: string;
}

export interface Startup {
  id: number;
  name: string;
  tagline: string;
  description: string;
  sector: string;
  city: string;
}

export interface Kpi {
  metric: string;
  baseline_value: number;
  target_value: number;
  target_operator: string;
  unit: string;
}

export interface Criterion {
  label?: string;
  requirement: string;
  check?: string;
}

export interface EvidenceRequirement {
  label: string;
  requirement: string;
}

export interface EligibilityCheck {
  check: string;
  met: boolean;
  detail: string;
}

export interface Eligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
  screened_on?: string | null;
}

export interface EvaluationDimension {
  dimension: string;
  score: number;
  note: string;
}

export interface Evaluation {
  id: number;
  evaluator_name: string;
  evaluator_role: string;
  score: number;
  dimensions: EvaluationDimension[];
  summary: string;
  evaluated_on: string | null;
}

export interface Application {
  id: number;
  status: string;
  proposal: string;
  submitted_on: string | null;
  eligibility: Eligibility;
  evaluations: Evaluation[];
  startup: Startup;
}

export interface PilotBrief {
  id: number;
  status: string;
  startup: string;
  startup_id: number;
  challenge: string;
  department: string;
  protocol_status: string | null;
  created_at: string | null;
}

export interface Challenge {
  id: number;
  status: string;
  title: string;
  problem: string;
  expected_outcome: string;
  kpi: Kpi;
  duration_days: number;
  eligibility_criteria: Criterion[];
  evaluation_dimensions: string[];
  pilot_expectations: string;
  evidence_requirements: EvidenceRequirement[];
  tags: string[];
  department: Department;
  created_at: string | null;
  pilots: PilotBrief[];
  applications?: Application[];
  reuse_discovery?: DiscoveryItem[];
  reuse_decisions?: ReuseDecisionOut[];
}

export interface Protocol {
  id: number;
  version: number;
  status: string;
  metric: string;
  target_operator: string;
  target_value: number;
  unit: string;
  baseline_value: number;
  duration_days: number;
  sample_interval: string;
  measurement_method: string;
  success_rule: string;
  content_hash: string | null;
  sealed_by: string | null;
  sealed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Milestone {
  seq: number;
  title: string;
  description: string;
  amount: string;
  currency: string;
  status: string;
  payment_status: string;
  note: string;
}

export interface Risk {
  id: number;
  category: string;
  description: string;
  mitigation: string;
  status: string;
}

export interface Measurement {
  id: number;
  label: string;
  value: number;
  unit: string;
  source: string;
  recorded_on: string | null;
}

export interface EvidenceCheck {
  id: number;
  ok: boolean;
  method: string;
  note: string;
  checked_at: string | null;
}

export interface Evidence {
  id: number;
  kind: string;
  title: string;
  description: string;
  source: string;
  occurred_on: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  storage_backend: string;
  uploaded_at: string | null;
  measurement_id: number | null;
  measurement_label?: string | null;
  latest_check: EvidenceCheck | null;
  checks: EvidenceCheck[];
}

export interface ValidationRecord {
  id: number;
  validator_name: string;
  status: string;
  notes: string;
  decided_at: string | null;
  created_at: string | null;
}

export interface AuditEvent {
  id: number;
  kind: string;
  summary: string;
  actor: string;
  occurred_at: string | null;
  content_hash: string;
  prev_hash: string | null;
}

export interface Verdict {
  id: number;
  protocol_version: number;
  metric: string;
  target_operator: string;
  target_value: number;
  unit: string;
  observed_value: number;
  sample_count: number;
  method: string;
  outcome: string;
  issued_by: string;
  issued_at: string | null;
}

export interface ScaleDecision {
  outcome: string;
  basis: string;
  decided_by: string;
  decided_at: string | null;
}

export interface VprBrief {
  id: number;
  reference: string;
  status: string;
  summary: string;
  issued_at: string | null;
}

export interface Result {
  protocol_version: number;
  metric: string;
  target_operator: string;
  target: number;
  unit: string;
  sample_count: number;
  observed_value: number;
  met: boolean;
  method: string;
}

export interface PilotDetail {
  id: number;
  status: string;
  scope: string;
  started_at: string | null;
  completed_at: string | null;
  challenge: Challenge;
  startup: Startup;
  protocols: Protocol[];
  current_protocol: Protocol | null;
  sealed_protocol: Protocol | null;
  milestones: Milestone[];
  risks: Risk[];
  measurements: Measurement[];
  evidence: Evidence[];
  validations: ValidationRecord[];
  audit: AuditEvent[];
  verdict?: Verdict;
  vpr?: VprBrief;
  scale?: ScaleDecision;
  result?: Result;
}

export interface DiscoveryItem {
  vpr_id: number;
  reference: string;
  issued_at: string | null;
  source_department: string;
  source_challenge: string;
  startup: string;
  startup_id: number;
  metric: string;
  target_operator: string;
  target_value: number;
  unit: string;
  observed_value: number;
  outcome: string;
  shared_tags: string[];
  evidence_count: number;
  evidence_verified: boolean;
  validated_by: string | null;
}

export interface ReuseDecisionOut {
  id: number;
  action: string;
  rationale: string;
  decided_by: string;
  decided_at: string | null;
  vpr_id: number;
  vpr_reference: string | null;
  confirmatory_pilot_id: number | null;
}

export interface TemplateDoc {
  slug: string;
  title: string;
  purpose: string;
  content: string;
}

export interface VprSummary {
  id: number;
  reference: string;
  status: string;
  summary: string;
  issued_at: string | null;
  startup: string;
  department: string;
  department_name: string;
  challenge: string;
  outcome: string;
  observed_value: number;
  target_value: number;
  unit: string;
}

export interface VprDetail {
  id: number;
  reference: string;
  status: string;
  summary: string;
  issued_at: string | null;
  department: Department;
  challenge: { id: number; title: string; problem: string };
  startup: Startup;
  application: Application | null;
  pilot: {
    id: number;
    status: string;
    scope: string;
    started_at: string | null;
    completed_at: string | null;
  };
  protocol: Protocol | null;
  verdict: Verdict;
  scale: ScaleDecision | null;
  milestones: Milestone[];
  measurements: Measurement[];
  evidence: Evidence[];
  validation: { validator_name: string | null; notes: string; decided_at: string | null };
  audit: AuditEvent[];
}

export interface EvidenceRow extends Evidence {
  pilot_id: number;
  pilot_status: string;
  challenge: string;
  department: string;
  startup: string;
}

export interface StartupApplication {
  id: number;
  status: string;
  proposal: string;
  submitted_on: string | null;
  eligibility: Eligibility;
  evaluations: Evaluation[];
  startup: Startup;
  challenge_id: number;
  challenge_title: string;
  challenge_status: string;
  department: string;
}

export interface StartupListItem extends Startup {
  applications: {
    id: number;
    challenge_id: number;
    challenge: string;
    department: string;
    status: string;
    submitted_on: string | null;
  }[];
  wins: number;
}

export interface DemoState {
  demo_mode: boolean;
  default_milestone: string;
  milestones: string[];
}

export interface AuditVerifyResult {
  ok: boolean;
  count: number;
  issues: string[];
}
