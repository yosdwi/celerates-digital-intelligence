export type Run = {
  id: string;
  state: string;
  step: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};
export type Opportunity = {
  id: string;
  title: string;
  customer: string;
  owner: string;
  stage: string;
  status: string;
  timeline: string;
  notes: string;
  latest_run?: Run | null;
  document_count?: number;
  clarification_count?: number;
  completeness?: number;
};
export type ArtifactContent = {
  summary: string;
  rows: Record<string, string>[];
};
export type Artifact = {
  id: string;
  kind: string;
  title: string;
  content: ArtifactContent;
  version: number;
  review_state: string;
  reviewed_by: string | null;
  provenance: {
    type: string;
    id: string;
    name: string;
    sha256?: string;
    observed_at?: string;
  }[];
  generation: {
    provider: string;
    content_mode: string;
    prompt_version: string;
  };
};
export type DocumentRecord = {
  id: string;
  name: string;
  state: string;
  error: string | null;
  parser: string | null;
  sha256: string;
  size_bytes: number;
  source_url: string | null;
};
export type EventRecord = {
  id: number;
  type: string;
  message: string;
  actor: string;
  created_at: string;
};
export type Detail = {
  opportunity: Opportunity;
  run: Run | null;
  artifacts: Artifact[];
  documents: DocumentRecord[];
  events: EventRecord[];
};
export type ExceptionRecord = {
  id: string;
  title: string;
  object: string;
  age_days: number;
  invoice_value: number;
  owner: string;
  state: string;
  severity: string;
  blocker: string;
  impact: string;
  next_action: string;
  evidence: string;
  history: string[];
  escalation: string;
};
export type CaseRecord = {
  id: string;
  requester: string;
  category: string;
  question: string;
  status: string;
  pic: string;
  route: string;
  context: string;
  evidence: string;
  policy: string;
  draft: string;
  next_action: string;
};
export type Support = {
  exceptions: ExceptionRecord[];
  cases: CaseRecord[];
  metrics: {
    active_opportunities: number;
    open_exceptions: number;
    pending_invoice_value: number;
    service_cases: number;
  };
  briefs: {
    id: string;
    what: string;
    why: string;
    owner: string;
    action: string;
    evidence: string;
  }[];
};
