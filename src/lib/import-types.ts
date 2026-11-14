import type { SteamData } from "../types";

export type ImportOperationKind = "progress" | "schema" | "rarity";
export interface ImportOperation {
  appid: number;
  kind: ImportOperationKind;
}
export interface ProgressRow {
  api_name: string;
  name: string;
  description: string | null;
  unlocked: boolean;
  unlock_time: string | null;
}
export interface SchemaRow {
  api_name: string;
  name: string;
  description: string | null;
  icon: string | null;
  icon_gray: string | null;
}
export interface RarityRow {
  api_name: string;
  global_completion_rate_pct: number;
}
export type OperationSuccess = ImportOperation & {
  status: "success";
  data: ProgressRow[] | SchemaRow[] | RarityRow[];
};
export type OperationFailure = ImportOperation & {
  status: "error";
  code: string;
  message: string;
  retryable: boolean;
};
export interface ImportError {
  ok: false;
  code: string;
  message: string;
  attempts: number;
  retryAfterSeconds?: number;
}
export interface StartRequest {
  profile: string;
}
export interface StartResponse {
  ok: true;
  data: SteamData;
  token: string;
  expiresAt: string;
  attempts: number;
}
export interface BatchRequest {
  token: string;
  operations: ImportOperation[];
}
export interface BatchResponse {
  ok: true;
  results: (OperationSuccess | OperationFailure)[];
  attempts: number;
  paused: boolean;
  retryAfterSeconds?: number;
}
