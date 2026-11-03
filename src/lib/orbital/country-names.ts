/**
 * Spanish display names for the Natural Earth (countries-110m) English names used by the place index.
 * Uses `Intl.DisplayNames` (en → ISO alpha-2 → es) plus overrides for Natural Earth abbreviations.
 */
const OVERRIDES: Readonly<Record<string, string>> = {
  "United States of America": "Estados Unidos",
  "Dem. Rep. Congo": "República Democrática del Congo",
  Congo: "República del Congo",
  "Central African Rep.": "República Centroafricana",
  "S. Sudan": "Sudán del Sur",
  "Bosnia and Herz.": "Bosnia y Herzegovina",
  "Dominican Rep.": "República Dominicana",
  "Eq. Guinea": "Guinea Ecuatorial",
  "Solomon Is.": "Islas Salomón",
  "W. Sahara": "Sáhara Occidental",
  "N. Cyprus": "Chipre del Norte",
  "Côte d'Ivoire": "Costa de Marfil",
  eSwatini: "Esuatini",
  "Fr. S. Antarctic Lands": "Tierras Australes Francesas",
  "Falkland Is.": "Islas Malvinas",
  Somaliland: "Somalilandia",
  Kosovo: "Kosovo",
  Taiwan: "Taiwán",
  Palestine: "Palestina",
  "North Macedonia": "Macedonia del Norte",
  Macedonia: "Macedonia del Norte",
  Czechia: "Chequia",
  "Timor-Leste": "Timor Oriental",
  Antarctica: "Antártida",
};

let table: Map<string, string> | null = null;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function buildTable(): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return map;
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  const es = new Intl.DisplayNames(["es"], { type: "region" });
  const A = 65;
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      let english: string | undefined;
      try {
        english = en.of(code);
      } catch {
        continue;
      }
      if (!english || english === code) continue;
      const spanish = es.of(code);
      if (spanish && spanish !== code) map.set(normalize(english), spanish);
    }
  }
  return map;
}

/** Spanish name of a Natural Earth country name; falls back to the original. */
export function countryNameEs(name: string): string {
  const override = OVERRIDES[name];
  if (override) return override;
  table ??= buildTable();
  return table.get(normalize(name)) ?? name;
}
