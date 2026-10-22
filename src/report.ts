import { config, log, UserError } from "./config.js";
import { geocode } from "./geocode.js";
import { aqIndex, distanceKm, latest, sensors, stations, warnings, type Station } from "./gios.js";
import { eaqiLabel, forecast, pollenLevel, POLLEN_PL } from "./forecast.js";

const ORDER = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO", "C6H6"];
const UNIT: Record<string, string> = { CO: "µg/m³", default: "µg/m³" };
/** reference values (µg/m³): 24 h PM10 limit 50; information / alarm levels 100 / 150 (24 h mean); WHO 2021 24 h guidelines */
const NOTE: Record<string, string> = {
  PM10: "norma dobowa 50, poziom informowania 100, alarmowy 150 (średnia 24 h); WHO: 45",
  "PM2.5": "WHO: 15 (średnia 24 h)",
  NO2: "norma godzinowa 200; WHO: 25 (24 h)",
  O3: "poziom informowania 180, alarmowy 240 (1 h)",
  SO2: "norma godzinowa 350",
};
const fmt = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(".", ","));
const km = (v: number) => `${v < 10 ? v.toFixed(1).replace(".", ",") : Math.round(v)} km`;

function norm(s: string) {
  return s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "");
}

async function locate(place: string): Promise<{ label: string; lat: number; lon: number }> {
  try {
    const p = (await geocode(place))[0];
    return { label: p.label, lat: p.lat, lon: p.lon };
  } catch (e) {
    // fall back to a station town name
    const all = await stations();
    const q = norm(place.split(",")[0].trim());
    const s = all.find((x) => norm(x.city) === q) ?? all.find((x) => norm(x.name).startsWith(q));
    if (s) return { label: s.city, lat: s.lat, lon: s.lon };
    if (e instanceof UserError) throw new UserError(`Nie znaleziono miejsca "${place}". Podaj miejscowość, adres („Kraków, Długa 5”) albo „lat,lon”.`);
    throw e;
  }
}

async function stationBlock(s: Station, dist: number, full: boolean): Promise<string[]> {
  const [idx, sens] = await Promise.all([aqIndex(s.id), sensors(s.id).catch(() => [])]);
  const wanted = sens.filter((x) => ORDER.includes(x.code)).sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
  const vals = await Promise.all(wanted.map(async (x) => ({ x, r: await latest(x.id).catch(() => ({})) as Awaited<ReturnType<typeof latest>> })));
  const L: string[] = [];
  L.push(`${s.name} (${km(dist)} od wskazanego miejsca${s.street ? `, ${s.street}` : ""}) – indeks jakości powietrza: ${idx?.category ?? "brak"}${idx?.computed ? ` (obliczony ${idx.computed.slice(8, 10)}.${idx.computed.slice(5, 7)} ${idx.computed.slice(11, 16)})` : ""}`);
  const parts: string[] = [];
  for (const { x, r } of vals) {
    if (!r.last) continue;
    const cat = idx?.byPollutant[x.code]?.category;
    parts.push(`${x.code} ${fmt(r.last.value)} ${UNIT[x.code] ?? UNIT.default}${r.mean24 !== undefined && (x.code === "PM10" || x.code === "PM2.5") ? ` (śr. 24 h ${fmt(r.mean24)})` : ""}${cat ? ` – ${cat.toLowerCase()}` : ""} [${r.last.date.slice(11, 16)}]`);
  }
  if (parts.length) L.push(`  ${parts.join(" · ")}`);
  else L.push("  brak bieżących pomiarów");
  if (full) {
    const present = vals.filter((v) => v.r.last && NOTE[v.x.code]).map((v) => `${v.x.code}: ${NOTE[v.x.code]}`);
    if (present.length) L.push(`  Odniesienie (µg/m³): ${present.join("; ")}`);
  }
  return L;
}

export async function airQuality(a: { place: string; forecast?: boolean; stations?: number }): Promise<string> {
  const where = await locate(a.place);
  const all = await stations();
  const near = all
    .map((s) => ({ s, d: distanceKm(where, s) }))
    .sort((x, y) => x.d - y.d)
    .filter((x, i) => i === 0 || x.d <= 25)
    .slice(0, Math.max(1, Math.min(5, a.stations ?? 3)));
  const L: string[] = [`Jakość powietrza – ${where.label} (${where.lat.toFixed(4)}, ${where.lon.toFixed(4)})`, ""];
  if (!near.length) L.push("Brak stacji GIOŚ.");
  else {
    if (near[0].d > 25) L.push(`Uwaga: najbliższa stacja GIOŚ jest ${km(near[0].d)} stąd – pomiary mogą nie oddawać lokalnych warunków.`);
    L.push("Pomiary stacji GIOŚ (Państwowy Monitoring Środowiska, wartości godzinowe):");
    const blocks = await Promise.all(near.map((n, i) => stationBlock(n.s, n.d, i === 0)));
    for (const b of blocks) L.push(...b.map((l) => "  " + l));
  }
  // smog alerts in this voivodeship
  try {
    const w = await warnings();
    const voiv = near[0]?.s.voivodeship?.toLowerCase();
    const mine = w.filter((x) => !voiv || JSON.stringify(x).toLowerCase().includes(voiv));
    L.push("", mine.length ? `Ostrzeżenia GIOŚ (${voiv}):` : `Ostrzeżenia smogowe GIOŚ dla woj. ${voiv ?? "?"}: brak aktualnych.`);
    for (const x of mine.slice(0, 5)) L.push(`  - ${Object.entries(x).filter(([k, v]) => v && !k.startsWith("@")).map(([k, v]) => `${k}: ${String(v).slice(0, 160)}`).join(" | ")}`);
  } catch (e) {
    log("warn", `warnings: ${(e as Error).message}`);
  }
  if (a.forecast !== false && config.forecast) {
    try {
      const f = await forecast(where.lat, where.lon, 3);
      L.push("", "Prognoza (model CAMS – Copernicus, przez Open-Meteo; to model, nie pomiar):");
      const DAY = ["dziś", "jutro", "pojutrze"];
      f.forEach((d, i) => {
        if (d.pm10 === undefined && d.pm25 === undefined) return;
        const pol = Object.entries(d.pollen)
          .filter(([, v]) => v >= 1)
          .sort((x, y) => y[1] - x[1])
          .map(([k, v]) => `${POLLEN_PL[k] ?? k} ${pollenLevel(k, v)} (${Math.round(v)})`);
        L.push(
          `  ${DAY[i] ?? d.date} (${d.date.slice(8, 10)}.${d.date.slice(5, 7)}): maks. PM2.5 ${d.pm25 !== undefined ? fmt(d.pm25) : "–"}, PM10 ${d.pm10 !== undefined ? fmt(d.pm10) : "–"} µg/m³${d.eaqi !== undefined ? ` · europejski indeks: ${eaqiLabel(d.eaqi)} (${Math.round(d.eaqi)})` : ""} · pyłki: ${pol.length ? pol.join(", ") : "brak istotnych"}`,
        );
      });
    } catch (e) {
      log("warn", `forecast: ${(e as Error).message}`);
    }
  }
  L.push(
    "",
    "Indeks GIOŚ: bardzo dobry / dobry / umiarkowany / dostateczny / zły / bardzo zły. Przy złym i bardzo złym ogranicz aktywność na zewnątrz (szczególnie dzieci, seniorzy, osoby z chorobami serca i płuc).",
    "Źródła: Główny Inspektorat Ochrony Środowiska – Państwowy Monitoring Środowiska (api.gios.gov.pl; dane bieżące są niezweryfikowane); prognoza i pyłki: Copernicus Atmosphere Monitoring Service (CAMS) przez Open-Meteo (CC BY 4.0); adresy: GUGiK.",
  );
  return L.join("\n");
}

export async function findStations(a: { query: string }): Promise<string> {
  const all = await stations();
  const q = norm(a.query);
  const hits = all.filter((s) => [s.city, s.name, s.commune, s.county, s.voivodeship].some((v) => norm(v).includes(q)));
  if (!hits.length) return `Nie znaleziono stacji GIOŚ dla "${a.query}". Spróbuj nazwy miasta, gminy, powiatu albo województwa.`;
  return [`Stacje pomiarowe GIOŚ (${hits.length}):`, ...hits.slice(0, 40).map((s) => `- ${s.name} · ${s.city}, gm. ${s.commune}, pow. ${s.county}, ${s.voivodeship.toLowerCase()} · ${s.lat.toFixed(4)},${s.lon.toFixed(4)} · id ${s.id}`)].join("\n");
}
