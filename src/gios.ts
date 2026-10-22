import { config, log } from "./config.js";

export interface Station {
  id: number;
  code: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  commune: string;
  county: string;
  voivodeship: string;
  street: string;
}
export interface Sensor {
  id: number;
  stationId: number;
  name: string;
  /** PM10, PM2.5, NO2, O3, SO2, CO, C6H6 ... */
  code: string;
}
export interface Reading {
  value: number;
  date: string;
}
export interface AqIndex {
  computed: string;
  value: number | null;
  category: string | null;
  /** per pollutant: code -> category */
  byPollutant: Record<string, { value: number | null; category: string | null; date: string | null }>;
}

const cache = new Map<string, { t: number; v: unknown }>();
let inflight = 0;
const queue: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= 4) await new Promise<void>((r) => queue.push(r));
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    queue.shift()?.();
  }
}

async function get<T>(path: string, ttlSec: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.v as T;
  const v = await slot(async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20_000);
    try {
      const res = await fetch(config.giosUrl + path, { signal: ac.signal, headers: { accept: "application/ld+json", "user-agent": config.userAgent } });
      if (!res.ok) throw new Error(`GIOŚ HTTP ${res.status} (${path.split("?")[0]})`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  });
  cache.set(path, { t: Date.now(), v });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return v;
}

/** JSON-LD responses keep the payload under a Polish label – take the first array/object that is not @context/meta/links. */
function payload(j: Record<string, unknown>): unknown {
  for (const [k, v] of Object.entries(j)) if (!k.startsWith("@") && !["meta", "links", "totalPages"].includes(k)) return v;
  return undefined;
}

export async function stations(): Promise<Station[]> {
  const out: Station[] = [];
  for (let page = 0; page < 5; page++) {
    const j = await get<Record<string, unknown>>(`/station/findAll?size=500&page=${page}`, 12 * 3600);
    const list = (payload(j) as Record<string, string | number>[]) ?? [];
    for (const s of list)
      out.push({
        id: Number(s["Identyfikator stacji"]),
        code: String(s["Kod stacji"] ?? ""),
        name: String(s["Nazwa stacji"] ?? ""),
        lat: Number(s["WGS84 φ N"]),
        lon: Number(s["WGS84 λ E"]),
        city: String(s["Nazwa miasta"] ?? ""),
        commune: String(s["Gmina"] ?? ""),
        county: String(s["Powiat"] ?? ""),
        voivodeship: String(s["Województwo"] ?? ""),
        street: String(s["Ulica"] ?? ""),
      });
    const total = Number(j.totalPages ?? 1);
    if (page + 1 >= total || list.length < 500) break;
  }
  return out.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

export async function sensors(stationId: number): Promise<Sensor[]> {
  const j = await get<Record<string, unknown>>(`/station/sensors/${stationId}?size=100`, 24 * 3600);
  return ((payload(j) as Record<string, string | number>[]) ?? []).map((s) => ({
    id: Number(s["Identyfikator stanowiska"]),
    stationId,
    name: String(s["Wskaźnik"] ?? ""),
    code: String(s["Wskaźnik - kod"] ?? s["Wskaźnik - wzór"] ?? ""),
  }));
}

/** Last non-empty hourly value (and the 24 h mean when there are enough hours). */
export async function latest(sensorId: number): Promise<{ last?: Reading; mean24?: number }> {
  const j = await get<Record<string, unknown>>(`/data/getData/${sensorId}?size=48`, 15 * 60);
  const rows = ((payload(j) as Record<string, string | number | null>[]) ?? [])
    .map((r) => ({ date: String(r["Data"] ?? ""), value: r["Wartość"] === null || r["Wartość"] === undefined ? NaN : Number(r["Wartość"]) }))
    .filter((r) => r.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const ok = rows.filter((r) => Number.isFinite(r.value));
  const last = ok[0];
  let mean24: number | undefined;
  if (last) {
    const from = new Date(new Date(last.date.replace(" ", "T") + "Z").getTime() - 24 * 3600_000).toISOString().slice(0, 13);
    const win = ok.filter((r) => r.date.replace(" ", "T").slice(0, 13) > from);
    if (win.length >= 18) mean24 = win.reduce((a, r) => a + r.value, 0) / win.length;
  }
  return { last, mean24 };
}

export async function aqIndex(stationId: number): Promise<AqIndex | null> {
  try {
    const j = await get<Record<string, unknown>>(`/aqindex/getIndex/${stationId}`, 15 * 60);
    const a = payload(j) as Record<string, string | number | null>;
    if (!a) return null;
    const byPollutant: AqIndex["byPollutant"] = {};
    for (const code of ["SO2", "NO2", "PM10", "PM2.5", "O3"]) {
      const v = a[`Wartość indeksu dla wskaźnika ${code}`];
      const c = a[`Nazwa kategorii indeksu dla wskażnika ${code}`] ?? a[`Nazwa kategorii indeksu dla wskaźnika ${code}`];
      const d = a[`Data danych źródłowych, z których policzono wartość indeksu dla wskaźnika ${code}`];
      if (v !== null && v !== undefined) byPollutant[code] = { value: Number(v), category: c ? String(c) : null, date: d ? String(d) : null };
    }
    return {
      computed: String(a["Data wykonania obliczeń indeksu"] ?? ""),
      value: a["Wartość indeksu"] === null || a["Wartość indeksu"] === undefined ? null : Number(a["Wartość indeksu"]),
      category: a["Nazwa kategorii indeksu"] ? String(a["Nazwa kategorii indeksu"]) : null,
      byPollutant,
    };
  } catch (e) {
    log("warn", `aqindex ${stationId}: ${(e as Error).message}`);
    return null;
  }
}

/** Current smog alerts / information levels published by GIOŚ (free-form records). */
export async function warnings(): Promise<Record<string, unknown>[]> {
  const j = await get<unknown>(`/levels/getWarnings`, 15 * 60);
  if (Array.isArray(j)) return j as Record<string, unknown>[];
  const p = payload(j as Record<string, unknown>);
  return Array.isArray(p) ? (p as Record<string, unknown>[]) : [];
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
