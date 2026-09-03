import type { ApiHealth } from "../types";

/**
 * Centralised API client.
 *
 * Base URL comes from VITE_API_BASE_URL (see .env.example). Empty means the
 * same origin — in Docker nginx proxies /api and /health to the backend; in
 * local development the Vite server proxies them (vite.config.ts).
 *
 * Future module developers add domain groups here, e.g.:
 *
 *   export const api = { ..., challenges: { list: ..., get: ... } }
 *
 * and keep raw fetch() calls out of components.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (body.detail) message = String(body.detail);
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  /** GET /health — backend liveness plus PostgreSQL/MinIO status. */
  health: () => request<ApiHealth>("/health"),
};
