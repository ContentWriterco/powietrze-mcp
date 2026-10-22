import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { UserError, log } from "./config.js";
import { airQuality, findStations } from "./report.js";
import { VERSION } from "./version.js";
import { usage, classify } from "./usage.js";

type Text = { content: { type: "text"; text: string }[]; isError?: boolean };

async function run(tool: string, fn: () => Promise<string>): Promise<Text> {
  const t0 = performance.now();
  let res: Text;
  let userErr = false;
  try {
    res = { content: [{ type: "text", text: await fn() }] };
  } catch (e) {
    userErr = e instanceof UserError;
    const msg = userErr ? (e as Error).message : `Internal error: ${(e as Error).message}`;
    if (!userErr) log("error", (e as Error).stack);
    res = { content: [{ type: "text", text: msg }], isError: true };
  }
  if (usage.enabled) {
    const text = res.content[0].text;
    void usage.tool(tool, /^Nie znaleziono/.test(text) ? "not_found" : classify(text, !!res.isError, userErr), performance.now() - t0);
  }
  return res;
}

export const INSTRUCTIONS = `Air quality in Poland: live hourly measurements of the official GIOŚ monitoring network (PM2.5, PM10, NO2, O3, SO2) with the Polish air quality index, smog warnings, and a 3-day CAMS (Copernicus) forecast of particulate matter and pollen.
Use air_quality with a town, an address ("Kraków, Długa 5") or "lat,lon" – it picks the nearest stations. Use air_stations to list stations in a town, county or voivodeship.
Say which station and hour the numbers come from, that current data are unverified, and that the forecast and pollen are model estimates. For bad or very bad air, advise limiting outdoor activity, especially for children, seniors and people with heart or lung disease. Answer in the user's language.`;

export function createServer(): McpServer {
  const server = new McpServer({ name: "powietrze-mcp", version: VERSION }, { instructions: INSTRUCTIONS });
  const ro = { readOnlyHint: true, openWorldHint: true } as const;
  server.registerTool(
    "air_quality",
    {
      title: "Air quality now and forecast (Poland)",
      description:
        "Current air quality near a place in Poland from the nearest official GIOŚ stations: Polish air quality index, latest hourly PM2.5, PM10, NO2, O3, SO2 (+24 h means for dust), reference limits, active smog warnings for the voivodeship, and a 3-day forecast of PM and pollen (birch, alder, grass, mugwort, ragweed) from Copernicus CAMS. place: town, address or 'lat,lon'.",
      inputSchema: {
        place: z.string().describe("Town, address or 'lat,lon' in Poland"),
        forecast: z.boolean().optional().describe("Include the CAMS forecast and pollen (default true)"),
        stations: z.number().int().min(1).max(5).optional().describe("How many nearby stations (default 3, within 25 km)"),
      },
      annotations: ro,
    },
    async (a) => run("air_quality", () => airQuality({ place: a.place, forecast: a.forecast, stations: a.stations })),
  );
  server.registerTool(
    "air_stations",
    {
      title: "GIOŚ monitoring stations",
      description: "List official air monitoring stations (GIOŚ) in a town, commune, county or voivodeship, with coordinates.",
      inputSchema: { query: z.string().describe("Town, commune, county or voivodeship name") },
      annotations: ro,
    },
    async (a) => run("air_stations", () => findStations({ query: a.query })),
  );
  server.registerTool(
    "data_sources",
    { title: "Data sources", description: "Where the data comes from and caveats.", inputSchema: {}, annotations: ro },
    async () =>
      run("data_sources", async () =>
        [
          "Pomiary: Główny Inspektorat Ochrony Środowiska – Państwowy Monitoring Środowiska, API https://api.gios.gov.pl/pjp-api (dane bieżące, niezweryfikowane; ok. 290 stacji).",
          "Indeks jakości powietrza: GIOŚ (bardzo dobry … bardzo zły), liczony co godzinę dla stacji.",
          "Prognoza PM i pyłków: Copernicus Atmosphere Monitoring Service (CAMS), udostępniana przez Open-Meteo (CC BY 4.0). Model w siatce ok. 10 km – nie zastępuje pomiaru.",
          "Adresy: GUGiK (państwowy rejestr adresów).",
          `powietrze-mcp ${VERSION} · https://github.com/ContentWriterco/powietrze-mcp`,
        ].join("\n"),
      ),
  );
  return server;
}
