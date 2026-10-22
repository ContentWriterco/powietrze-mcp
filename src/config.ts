export const config = {
  giosUrl: process.env.POWIETRZE_GIOS_URL ?? "https://api.gios.gov.pl/pjp-api/v1/rest",
  forecastUrl: process.env.POWIETRZE_FORECAST_URL ?? "https://air-quality-api.open-meteo.com/v1/air-quality",
  uugUrl: process.env.POWIETRZE_UUG_URL ?? "https://services.gugik.gov.pl/uug/",
  /** set POWIETRZE_FORECAST=0 to disable the CAMS forecast / pollen (Open-Meteo) */
  forecast: process.env.POWIETRZE_FORECAST !== "0",
  log: process.env.POWIETRZE_LOG ?? "info",
  userAgent: "powietrze-mcp (+https://github.com/ContentWriterco/powietrze-mcp)",
};

export function log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]) {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  if (order[level] < (order[config.log as keyof typeof order] ?? 1)) return;
  console.error(`[powietrze-mcp] ${level}:`, ...args);
}

export class UserError extends Error {}
