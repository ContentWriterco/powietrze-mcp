import { config } from "./config.js";

export interface DayForecast {
  date: string;
  pm10?: number;
  pm25?: number;
  eaqi?: number;
  pollen: Record<string, number>;
}

const POLLEN = ["alder_pollen", "birch_pollen", "grass_pollen", "mugwort_pollen", "olive_pollen", "ragweed_pollen"];
export const POLLEN_PL: Record<string, string> = {
  alder_pollen: "olsza",
  birch_pollen: "brzoza",
  grass_pollen: "trawy",
  mugwort_pollen: "bylica",
  olive_pollen: "oliwka",
  ragweed_pollen: "ambrozja",
};
/** rough concentration thresholds (grains/m³) for low / moderate / high */
const POLLEN_LEVELS: Record<string, [number, number]> = {
  alder_pollen: [10, 100],
  birch_pollen: [10, 100],
  olive_pollen: [10, 100],
  grass_pollen: [5, 50],
  mugwort_pollen: [5, 30],
  ragweed_pollen: [5, 30],
};
export function pollenLevel(kind: string, v: number): string {
  const [lo, hi] = POLLEN_LEVELS[kind] ?? [10, 100];
  return v < 1 ? "brak" : v < lo ? "niskie" : v < hi ? "średnie" : "wysokie";
}

const cache = new Map<string, { t: number; v: DayForecast[] }>();

/** CAMS (Copernicus) air-quality and pollen forecast for the next days, via Open-Meteo. */
export async function forecast(lat: number, lon: number, days = 3): Promise<DayForecast[]> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 3600_000) return hit.v;
  const u = new URL(config.forecastUrl);
  u.searchParams.set("latitude", lat.toFixed(4));
  u.searchParams.set("longitude", lon.toFixed(4));
  u.searchParams.set("hourly", ["pm10", "pm2_5", "european_aqi", ...POLLEN].join(","));
  u.searchParams.set("forecast_days", String(days));
  u.searchParams.set("timezone", "Europe/Warsaw");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  let j: { hourly?: Record<string, (number | null)[] | string[]> };
  try {
    const res = await fetch(u, { signal: ac.signal, headers: { "user-agent": config.userAgent } });
    if (!res.ok) throw new Error(`forecast HTTP ${res.status}`);
    j = (await res.json()) as typeof j;
  } finally {
    clearTimeout(t);
  }
  const h = j.hourly ?? {};
  const times = (h.time as string[]) ?? [];
  const byDay = new Map<string, DayForecast>();
  const now = new Date(Date.now() - 3600_000).toISOString().slice(0, 13);
  times.forEach((tm, i) => {
    const d = tm.slice(0, 10);
    const f = byDay.get(d) ?? byDay.set(d, { date: d, pollen: {} }).get(d)!;
    if (tm.slice(0, 13) < now && d === times[0].slice(0, 10)) return; // past hours of today
    const max = (k: keyof DayForecast, src: string) => {
      const v = (h[src] as (number | null)[] | undefined)?.[i];
      if (typeof v === "number") (f as unknown as Record<string, number>)[k] = Math.max((f as unknown as Record<string, number>)[k] ?? 0, v);
    };
    max("pm10", "pm10");
    max("pm25", "pm2_5");
    max("eaqi", "european_aqi");
    for (const p of POLLEN) {
      const v = (h[p] as (number | null)[] | undefined)?.[i];
      if (typeof v === "number") f.pollen[p] = Math.max(f.pollen[p] ?? 0, v);
    }
  });
  const v = [...byDay.values()];
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return v;
}

export function eaqiLabel(v: number): string {
  return v <= 20 ? "dobra" : v <= 40 ? "umiarkowana" : v <= 60 ? "średnia" : v <= 80 ? "zła" : v <= 100 ? "bardzo zła" : "skrajnie zła";
}
