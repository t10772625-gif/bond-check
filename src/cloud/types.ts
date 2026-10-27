import type { Bond } from '../types';

export interface CloudUser {
  id: string;
  email?: string;
  user_metadata?: { name?: string };
}
export interface CloudSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: CloudUser;
}
export type DrawStatus =
  | 'pending'
  | 'ok'
  | 'ok_manual'
  | 'needs_review'
  | 'needs_ocr'
  | 'incomplete'
  | 'failed'
  | 'superseded';
export interface CloudDraw {
  id: string;
  denomination: number;
  draw_date: string;
  draw_no: number | null;
  status: DrawStatus;
  accepted_file_id: string | null;
  accepted_sha256?: string | null;
  decision_note?: string | null;
  parsed_counts: { first?: number; second?: number; third?: number };
  issues: string[];
  warnings: string[];
  suspects: {
    token: string;
    candidate: string | null;
    tier: string;
    line: number;
  }[];
}
export interface DrawFile {
  sha256?: string | null;
  id: string;
  draw_id: string;
  url: string;
  kind: string;
  label: string;
  parse_status: string;
  issues: string[] | null;
}
export interface PipelineStatus {
  total: number;
  verified: number;
  attention: number;
  pending_jobs: number;
  failed_jobs: number;
  missing_sources: number;
  unacknowledged: number;
  heartbeat: {
    last_beat: string | null;
    last_discovery_ok: string | null;
    last_ingest_ok: string | null;
    last_device_sync: string | null;
  };
  events: {
    at: string;
    kind: string;
    message: string;
    level: string;
    draw_id: string | null;
  }[];
}
export interface CloudSnapshot {
  bonds: Bond[];
  trash: Bond[];
  draws: CloudDraw[];
  files: DrawFile[];
  status: PipelineStatus;
  fetchedAt: string;
}
export interface BondDraft {
  n: string;
  d: number;
  date: string;
  series?: string;
  note: string;
  holder: string;
}
