/**
 * Snapshot generator for the GitHub Pages static preview.
 *
 * Pulls every GET endpoint the frontend uses from a running backend and
 * writes them into frontend/src/static-data/demo.json. The static build
 * (VITE_STATIC_DEMO=true) serves this snapshot instead of the API, so the
 * hosted demo shows the seeded case study without a backend.
 *
 * Usage (backend must be running, e.g. `uvicorn app.main:app --port 8000`):
 *
 *   node frontend/scripts/generate-static-data.mjs
 *
 * Re-run whenever the seed scenario changes and commit the updated file.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_BASE ?? "http://127.0.0.1:8000";

async function get(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }
  return response.json();
}

const out = {};

out.health = await get("/health");
out.challenges = await get("/api/v1/challenges");

out.challengesById = {};
for (const c of out.challenges.challenges) {
  out.challengesById[String(c.id)] = await get(`/api/v1/challenges/${c.id}`);
}

out.pilotsById = {};
for (const c of out.challenges.challenges) {
  for (const p of c.pilots ?? []) {
    if (!out.pilotsById[String(p.id)]) {
      out.pilotsById[String(p.id)] = await get(`/api/v1/pilots/${p.id}`);
    }
  }
}

out.startups = await get("/api/v1/startups");
out.startupsById = {};
for (const s of out.startups.startups) {
  out.startupsById[String(s.id)] = await get(`/api/v1/startups/${s.id}`);
}

out.evidence = await get("/api/v1/evidence");

out.vprs = await get("/api/v1/vprs");
out.vprsById = {};
for (const v of out.vprs.vprs) {
  out.vprsById[String(v.id)] = await get(`/api/v1/vprs/${v.id}`);
}

const dest = resolve(dirname(fileURLToPath(import.meta.url)), "../src/static-data/demo.json");
mkdirSync(dirname(dest), { recursive: true });
const json = JSON.stringify(out, null, 2);
writeFileSync(dest, json);
console.log(`Snapshot written to ${dest} (${Buffer.byteLength(json)} bytes)`);