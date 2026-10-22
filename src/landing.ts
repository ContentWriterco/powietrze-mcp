import { VERSION } from "./version.js";

const REPO = "https://github.com/ContentWriterco/powietrze-mcp";

export function landingHtml(base: string, stats: boolean): string {
  const mcp = `${base}/mcp`;
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>powietrze-mcp – jakość powietrza, smog i pyłki w Polsce dla AI (serwer MCP)</title>
<meta name="description" content="Darmowy serwer MCP z bieżącymi pomiarami GIOŚ (PM2.5, PM10, NO2, O3), indeksem jakości powietrza, ostrzeżeniami smogowymi i prognozą pyłków. Zapytaj Claude albo ChatGPT, czy dziś warto wyjść pobiegać.">
<link rel="canonical" href="${base}/">
<meta property="og:title" content="Czy dziś można wyjść z dzieckiem na spacer? – jakość powietrza i pyłki dla Twojego asystenta AI">
<meta property="og:description" content="Pomiary GIOŚ, ostrzeżenia smogowe i prognoza CAMS (smog i pyłki) w Claude, ChatGPT i każdym kliencie MCP. Bez klucza API.">
<meta property="og:url" content="${base}/"><meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "powietrze-mcp",
    applicationCategory: "WeatherApplication",
    operatingSystem: "Any",
    softwareVersion: VERSION,
    description: "MCP server with live air quality in Poland (GIOŚ), smog warnings and CAMS pollen forecast.",
    url: `${base}/`,
    codeRepository: REPO,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    publisher: { "@type": "Organization", name: "Compabase (Content Writer sp. z o.o.)", url: "https://compabase.com" },
  })}</script>
<style>
:root{--bg:#fff;--fg:#1f2328;--mut:#59636e;--card:#f6f8fa;--bd:#d1d9e0;--acc:#1a7f37}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#9198a1;--card:#151b23;--bd:#3d444d;--acc:#3fb950}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:860px;margin:0 auto;padding:48px 16px 64px}h1{font-size:38px;line-height:1.15;margin:0 0 12px}h1 span{color:var(--acc)}h2{font-size:22px;margin:36px 0 12px}
p.lead{font-size:19px;color:var(--mut);margin:0 0 24px}.ep{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font:15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.ep code{flex:1;min-width:0;overflow-wrap:anywhere}button{font:600 14px inherit;font-family:inherit;padding:6px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);cursor:pointer}
pre{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:14px;overflow:auto;font-size:13.5px;line-height:1.5;white-space:pre-wrap}li{margin:6px 0}a{color:var(--acc)}.small{color:var(--mut);font-size:14px}
</style></head><body><main>
<h1><span>powietrze</span>-mcp</h1>
<p class="lead">Czy dziś da się oddychać? Bieżące pomiary smogu z państwowych stacji GIOŚ, indeks jakości powietrza, ostrzeżenia i prognoza pyłków na 3 dni – w Claude, ChatGPT, Cursorze i każdym kliencie MCP. Za darmo, bez klucza API.</p>
<div class="ep"><code id="u">${mcp}</code><button onclick="navigator.clipboard.writeText(document.getElementById('u').textContent);this.textContent='Skopiowano'">Kopiuj adres MCP</button></div>
<h2>Przykład</h2>
<pre>Ty:    Czy mogę dziś wieczorem pobiegać w Krakowie koło Rynku?
Agent: Teraz tak – stacja GIOŚ przy Al. Krasińskiego (0,8 km) pokazuje indeks „dobry”:
       PM2.5 15 µg/m³, PM10 21 µg/m³. Ale jutro model CAMS przewiduje wzrost PM2.5 do ok. 55 µg/m³
       (europejski indeks „zła”) – lepiej pobiegać dziś niż jutro.</pre>
<p class="small">Przykład na podstawie prawdziwych danych z 22.10.2026.</p>
<h2>Jak podłączyć</h2>
<ul>
<li><b>Claude</b>: Ustawienia → Connectors → <i>Add custom connector</i> → wklej adres powyżej.</li>
<li><b>ChatGPT</b>: Settings → Connectors (tryb deweloperski) → dodaj serwer MCP z tym adresem.</li>
<li><b>Claude Code</b>: <code>claude mcp add --transport http powietrze ${mcp}</code></li>
<li><b>Lokalnie</b>: <code>npx -y powietrze-mcp</code></li>
</ul>
<h2>Co potrafi</h2>
<ul>
<li><b>air_quality</b> – najbliższe stacje GIOŚ: indeks jakości powietrza, ostatnie pomiary PM2.5, PM10, NO2, O3, SO2 (z średnią dobową dla pyłów), normy, ostrzeżenia smogowe w województwie i prognoza na 3 dni (pyły i pyłki: brzoza, olsza, trawy, bylica, ambrozja).</li>
<li><b>air_stations</b> – lista stacji pomiarowych w mieście, powiecie lub województwie.</li>
<li><b>data_sources</b> – źródła i zastrzeżenia.</li>
</ul>
<p class="small">Dane: Główny Inspektorat Ochrony Środowiska – Państwowy Monitoring Środowiska (dane bieżące, niezweryfikowane); prognoza i pyłki: Copernicus CAMS przez Open-Meteo (CC BY 4.0). Open source (MIT): <a href="${REPO}">GitHub</a>${stats ? ` · <a href="/stats">statystyki użycia</a> (anonimowe)` : ""} · wersja ${VERSION} · hostowane pro publico bono przez <a href="https://compabase.com">Compabase</a>.</p>
<p class="small" lang="en"><b>English:</b> free MCP server with live air quality in Poland (official GIOŚ stations, Polish AQ index), smog warnings and a 3-day CAMS forecast of particulate matter and pollen. Endpoint: <code>${mcp}</code></p>
</main></body></html>`;
}
