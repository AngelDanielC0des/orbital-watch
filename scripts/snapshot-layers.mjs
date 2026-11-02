/**
 * Produces the bundled demo snapshots (pollution + fires) from a running dev/prod server.
 * Usage: SNAPSHOT_BASE=http://localhost:3200 node scripts/snapshot-layers.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.SNAPSHOT_BASE ?? "http://localhost:3200";
const MAX_BYTES = 400 * 1024;
const MAX_HOTSPOTS = 800;
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/sites/orbitalwatch/data");
const WEB_DIR = "/sites/orbitalwatch/data";
const date = new Date().toISOString().slice(0, 10);

async function fetchLive(route) {
  const res = await fetch(`${BASE}${route}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
  const body = await res.json();
  if (!res.ok || body?.ok !== true) throw new Error(`${route}: not ok (HTTP ${res.status})`);
  if (body.meta?.fallback !== false) throw new Error(`${route}: response is a fallback, refusing to snapshot it`);
  return body.data;
}

async function writeSnapshot(kind, data) {
  const file = `${kind}-snapshot-${date}.json`;
  const text = JSON.stringify(data);
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) throw new Error(`${file} is ${bytes} bytes (> ${MAX_BYTES})`);
  await writeFile(path.join(DATA_DIR, file), text);
  console.log(`${file}: ${(bytes / 1024).toFixed(1)} KB`);
  return { date, path: `${WEB_DIR}/${file}` };
}

try {
  await mkdir(DATA_DIR, { recursive: true });
  const pollution = await fetchLive("/api/orbital/pollution");
  const fires = await fetchLive("/api/orbital/fires?window=24h");
  if (Array.isArray(fires.hotspots)) fires.hotspots = fires.hotspots.slice(0, MAX_HOTSPOTS * 4);

  const manifestPath = path.join(DATA_DIR, "snapshots.json");
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    manifest = {};
  }
  manifest.pollution = await writeSnapshot("pollution", pollution);
  manifest.fires = await writeSnapshot("fires", fires);
  await writeFile(manifestPath, JSON.stringify(manifest));
  console.log(`snapshots.json updated (${date})`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}
