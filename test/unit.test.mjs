import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, stations, latest, aqIndex } from "../dist/gios.js";
import { pollenLevel, eaqiLabel } from "../dist/forecast.js";

test("distance, pollen levels and EAQI labels", () => {
  const d = distanceKm({ lat: 52.2297, lon: 21.0122 }, { lat: 50.0647, lon: 19.945 });
  assert.ok(Math.abs(d - 252) < 3, String(d));
  assert.equal(pollenLevel("birch_pollen", 0.2), "brak");
  assert.equal(pollenLevel("birch_pollen", 50), "średnie");
  assert.equal(pollenLevel("grass_pollen", 80), "wysokie");
  assert.equal(eaqiLabel(15), "dobra");
  assert.equal(eaqiLabel(62), "zła");
});

test("GIOŚ JSON-LD parsing (stations, hourly data, index)", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    let body;
    if (u.includes("/station/findAll")) body = { "@context": {}, "Lista stacji pomiarowych": [{ "Identyfikator stacji": 1, "Kod stacji": "X", "Nazwa stacji": "Kraków, Aleja", "WGS84 φ N": "50.05", "WGS84 λ E": "19.92", "Nazwa miasta": "Kraków", Gmina: "Kraków", Powiat: "Kraków", Województwo: "MAŁOPOLSKIE", Ulica: "Al. 1" }], totalPages: 1 };
    else if (u.includes("/data/getData/")) body = { "Lista danych pomiarowych": [{ Data: "2026-10-22 22:00:00", Wartość: null }, { Data: "2026-10-22 21:00:00", Wartość: 20 }, ...Array.from({ length: 21 }, (_, i) => ({ Data: `2026-10-22 ${String(20 - i).padStart(2, "0")}:00:00`, Wartość: 10 }))] };
    else if (u.includes("/aqindex/")) body = { AqIndex: { "Data wykonania obliczeń indeksu": "2026-10-22 22:20:00", "Wartość indeksu": 1, "Nazwa kategorii indeksu": "Dobry", "Wartość indeksu dla wskaźnika PM10": 1, "Nazwa kategorii indeksu dla wskażnika PM10": "Dobry" } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/ld+json" } });
  };
  try {
    const s = await stations();
    assert.equal(s[0].city, "Kraków");
    assert.equal(s[0].lat, 50.05);
    const r = await latest(123);
    assert.equal(r.last.value, 20);
    assert.ok(r.mean24 > 10 && r.mean24 < 11);
    const ix = await aqIndex(1);
    assert.equal(ix.category, "Dobry");
    assert.equal(ix.byPollutant.PM10.category, "Dobry");
  } finally {
    globalThis.fetch = real;
  }
});
