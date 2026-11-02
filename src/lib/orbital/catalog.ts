import {
  Category,
  meanMotionRevPerDay,
  parseEpoch,
  type CategoryId,
  type GpRecord,
} from "./orbit-math";
import type { CatalogEntry } from "@/types/orbital";

/** Equatorial Earth radius used to turn perigee/apogee altitudes into a semi-major axis. */
const EQUATORIAL_RADIUS_KM = 6378.137;

/** Seeded 32-bit PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC timestamp for a calendar date, month 1-based. */
const utcDate = (year: number, month = 1, day = 1): number => Date.UTC(year, month - 1, day);

export interface SyntheticObjectSpec {
  name: string;
  category: CategoryId;
  country: string;
  launchMs: number;
  perigeeKm: number;
  apogeeKm: number;
  incDeg: number;
  raanDeg: number;
  argpDeg: number;
  maDeg: number;
}

export interface SyntheticShellSpec {
  planes: number;
  perPlane: number;
  altKm: number;
  incDeg: number;
  name: string;
  category: CategoryId;
  country: string;
  from: number;
  to: number;
  phasing?: number;
}

export interface SyntheticGenerator {
  entries: CatalogEntry[];
  add: (spec: SyntheticObjectSpec) => void;
  shell: (spec: SyntheticShellSpec) => void;
  range: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  gauss: () => number;
  weighted: <T>(table: readonly (readonly [T, number])[]) => T;
  rand: () => number;
}

/** Synthetic catalog builder with a seeded RNG. */
export function createSyntheticGenerator(referenceMs: number, seed = 20261030): SyntheticGenerator {
  const rand = mulberry32(seed);
  const range = (min: number, max: number): number => min + (max - min) * rand();
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const gauss = (): number => {
    const u1 = 1 - rand();
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const weighted = <T>(table: readonly (readonly [T, number])[]): T => {
    let roll = rand();
    for (const [value, weight] of table) if ((roll -= weight) <= 0) return value;
    return table[table.length - 1][0];
  };
  const epochIso = new Date(referenceMs).toISOString();
  const entries: CatalogEntry[] = [];
  let nextNorad = 1e4;
  const launchesPerYear = new Map<number, number>();

  function cosparId(launchMs: number): string {
    const year = new Date(launchMs).getUTCFullYear();
    const n = (launchesPerYear.get(year) ?? 0) + 1;
    launchesPerYear.set(year, n);
    return `${year}-${String(((n - 1) % 999) + 1).padStart(3, "0")}${String.fromCharCode(65 + Math.floor(rand() * 26))}`;
  }

  function add({
    name,
    category,
    country,
    launchMs,
    perigeeKm,
    apogeeKm,
    incDeg,
    raanDeg,
    argpDeg,
    maDeg,
  }: SyntheticObjectSpec): void {
    const rp = EQUATORIAL_RADIUS_KM + perigeeKm;
    const ra = EQUATORIAL_RADIUS_KM + apogeeKm;
    const a = (rp + ra) / 2;
    const e = Math.max(0, (ra - rp) / (ra + rp));
    const norad = nextNorad++;
    const omm: GpRecord = {
      OBJECT_NAME: name.replace("#", String(norad)),
      OBJECT_ID: cosparId(launchMs),
      EPOCH: epochIso,
      MEAN_MOTION: meanMotionRevPerDay(a),
      ECCENTRICITY: e,
      INCLINATION: incDeg,
      RA_OF_ASC_NODE: ((raanDeg % 360) + 360) % 360,
      ARG_OF_PERICENTER: ((argpDeg % 360) + 360) % 360,
      MEAN_ANOMALY: ((maDeg % 360) + 360) % 360,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: "U",
      NORAD_CAT_ID: norad,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 0,
      BSTAR: 0,
      MEAN_MOTION_DOT: 0,
      MEAN_MOTION_DDOT: 0,
    };
    entries.push({
      category,
      country,
      launchMs,
      projected: launchMs > referenceMs,
      omm,
    });
  }

  function shell({
    planes,
    perPlane,
    altKm,
    incDeg,
    name,
    category,
    country,
    from,
    to,
    phasing = 1,
  }: SyntheticShellSpec): void {
    for (let p = 0; p < planes; p++) {
      const launchMs = from + ((to - from) * p) / planes + range(-1, 1) * 864e5 * 5;
      for (let k = 0; k < perPlane; k++) {
        const alt = altKm + gauss() * 0.8;
        add({
          name,
          category,
          country,
          launchMs,
          perigeeKm: alt,
          apogeeKm: alt + range(0, 3),
          incDeg: incDeg + gauss() * 0.02,
          raanDeg: (360 * p) / planes + gauss() * 0.15,
          argpDeg: range(0, 360),
          maDeg: (360 * k) / perPlane + (360 * phasing * p) / (planes * perPlane),
        });
      }
    }
  }

  return { entries, add, shell, range, pick, gauss, weighted, rand };
}

/** Payload owner distribution. */
export const PAYLOAD_COUNTRY_WEIGHTS: readonly (readonly [string, number])[] = [
  ["Estados Unidos", 0.44],
  ["China", 0.18],
  ["Rusia", 0.09],
  ["Japón", 0.05],
  ["India", 0.04],
  ["ESA", 0.04],
  ["Reino Unido", 0.03],
  ["Francia", 0.03],
  ["Corea del Sur", 0.02],
  ["Alemania", 0.02],
  ["Otros", 0.06],
];

/** Debris owner distribution. */
export const DEBRIS_COUNTRY_WEIGHTS: readonly (readonly [string, number])[] = [
  ["Rusia / CEI", 0.38],
  ["Estados Unidos", 0.33],
  ["China", 0.2],
  ["Francia", 0.03],
  ["Japón", 0.02],
  ["Otros", 0.04],
];

interface DebrisCloudSpec {
  name: string;
  country: string;
  launchMs: number;
  altKm: number;
  spreadKm: number;
  incDeg: number;
  incSpread: number;
}

/**
 * Deterministic demo catalog: real constellations, GEO belt, Molniya, debris clouds,
 * rocket bodies and projected mega-constellations.
 */
export function generateSyntheticCatalog(referenceMs: number = Date.now()): CatalogEntry[] {
  const gen = createSyntheticGenerator(referenceMs);
  const { add, shell, range, pick, gauss, weighted } = gen;
  const { PAYLOAD, STARLINK, DEBRIS, ROCKET_BODY } = Category;
  const starlink = { name: "STARLINK-#", category: STARLINK, country: "Estados Unidos (SpaceX)" };

  shell({
    ...starlink,
    planes: 72,
    perPlane: 22,
    altKm: 550,
    incDeg: 53,
    from: utcDate(2019, 11),
    to: utcDate(2021, 5),
  });
  shell({
    ...starlink,
    planes: 72,
    perPlane: 22,
    altKm: 540,
    incDeg: 53.2,
    from: utcDate(2021, 9),
    to: utcDate(2022, 12),
  });
  shell({
    ...starlink,
    planes: 36,
    perPlane: 20,
    altKm: 570,
    incDeg: 70,
    from: utcDate(2022, 3),
    to: utcDate(2023, 6),
  });
  shell({
    ...starlink,
    planes: 6,
    perPlane: 58,
    altKm: 560,
    incDeg: 97.6,
    from: utcDate(2021, 6),
    to: utcDate(2023, 1),
  });
  shell({
    ...starlink,
    planes: 28,
    perPlane: 30,
    altKm: 530,
    incDeg: 43,
    from: utcDate(2023, 2),
    to: utcDate(2025, 2),
  });
  shell({
    ...starlink,
    planes: 24,
    perPlane: 30,
    altKm: 559,
    incDeg: 33,
    from: utcDate(2024, 3),
    to: utcDate(2026, 8),
  });

  // Recently launched Starlink trains climbing in string-of-pearls formation
  for (let t = 0; t < 6; t++) {
    const raan = range(0, 360);
    const ma = range(0, 360);
    const alt = 290 + t * 35;
    const inc = pick([43, 53, 53.2]);
    const launchMs = referenceMs - (6 - t) * 864e5 * 4;
    for (let k = 0; k < 23; k++)
      add({
        ...starlink,
        launchMs,
        perigeeKm: alt + k * 0.25,
        apogeeKm: alt + k * 0.25 + 2,
        incDeg: inc,
        raanDeg: raan,
        argpDeg: 0,
        maDeg: ma - k * 0.42,
      });
  }

  shell({
    planes: 18,
    perPlane: 36,
    altKm: 1200,
    incDeg: 87.9,
    name: "ONEWEB-#",
    category: PAYLOAD,
    country: "Reino Unido (Eutelsat OneWeb)",
    from: utcDate(2019, 2),
    to: utcDate(2023, 3),
  });
  shell({
    planes: 6,
    perPlane: 11,
    altKm: 780,
    incDeg: 86.4,
    name: "IRIDIUM #",
    category: PAYLOAD,
    country: "Estados Unidos (Iridium)",
    from: utcDate(2017, 1),
    to: utcDate(2019, 1),
  });
  shell({
    planes: 6,
    perPlane: 5,
    altKm: 20180,
    incDeg: 55,
    name: "GPS #",
    category: PAYLOAD,
    country: "Estados Unidos (USSF)",
    from: utcDate(2005, 1),
    to: utcDate(2023, 1),
  });
  shell({
    planes: 3,
    perPlane: 8,
    altKm: 19130,
    incDeg: 64.8,
    name: "GLONASS-M #",
    category: PAYLOAD,
    country: "Rusia (Roscosmos)",
    from: utcDate(2008, 1),
    to: utcDate(2022, 1),
  });
  shell({
    planes: 3,
    perPlane: 9,
    altKm: 23222,
    incDeg: 56,
    name: "GALILEO #",
    category: PAYLOAD,
    country: "ESA / UE",
    from: utcDate(2011, 10),
    to: utcDate(2024, 4),
  });
  shell({
    planes: 3,
    perPlane: 8,
    altKm: 21528,
    incDeg: 55,
    name: "BEIDOU-3 M#",
    category: PAYLOAD,
    country: "China (CNSA)",
    from: utcDate(2017, 11),
    to: utcDate(2020, 6),
  });

  // Geostationary belt
  for (let k = 0; k < 560; k++) {
    const alt = 35786 + gauss() * 15;
    add({
      name: "GEO SAT #",
      category: PAYLOAD,
      country: weighted(PAYLOAD_COUNTRY_WEIGHTS),
      launchMs: utcDate(Math.floor(range(1995, 2026)), 1 + Math.floor(range(0, 12))),
      perigeeKm: alt,
      apogeeKm: alt + range(0, 20),
      incDeg: Math.abs(gauss() * 2.2),
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }

  // Molniya orbits
  for (let k = 0; k < 40; k++)
    add({
      name: "MOLNIYA #",
      category: PAYLOAD,
      country: "Rusia",
      launchMs: utcDate(Math.floor(range(1985, 2020))),
      perigeeKm: range(500, 1200),
      apogeeKm: range(38500, 4e4),
      incDeg: 63.4 + gauss() * 0.3,
      raanDeg: range(0, 360),
      argpDeg: 270 + gauss() * 3,
      maDeg: range(0, 360),
    });

  // Generic LEO payloads
  const leoInclinations = [97.4, 97.6, 97.8, 98.2, 98.6, 51.6, 41.5, 45, 53, 65, 82.5, 99.2, 28.5];
  for (let k = 0; k < 3400; k++) {
    const alt = range(380, 1050);
    const inc = pick(leoInclinations) + gauss() * 0.15;
    add({
      name: "SAT #",
      category: PAYLOAD,
      country: weighted(PAYLOAD_COUNTRY_WEIGHTS),
      launchMs: utcDate(Math.floor(range(1998, 2027)), 1 + Math.floor(range(0, 12))),
      perigeeKm: alt,
      apogeeKm: alt + Math.abs(gauss() * 15),
      incDeg: inc,
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }

  // Fragmentation debris clouds
  const debrisCloud = (
    count: number,
    { name, country, launchMs, altKm, spreadKm, incDeg, incSpread }: DebrisCloudSpec,
  ): void => {
    for (let k = 0; k < count; k++) {
      const r1 = altKm + gauss() * spreadKm - Math.abs(gauss() * spreadKm * 0.6);
      const r2 = altKm + gauss() * spreadKm + Math.abs(gauss() * spreadKm * 0.6);
      add({
        name,
        category: DEBRIS,
        country,
        launchMs,
        perigeeKm: Math.max(250, Math.min(r1, r2)),
        apogeeKm: Math.max(r1, r2),
        incDeg: incDeg + gauss() * incSpread,
        raanDeg: range(0, 360),
        argpDeg: range(0, 360),
        maDeg: range(0, 360),
      });
    }
  };

  debrisCloud(3300, {
    name: "FENGYUN 1C DEB",
    country: "China",
    launchMs: utcDate(2007, 1, 11),
    altKm: 860,
    spreadKm: 120,
    incDeg: 98.8,
    incSpread: 0.6,
  });
  debrisCloud(1700, {
    name: "COSMOS 2251 DEB",
    country: "Rusia",
    launchMs: utcDate(2009, 2, 10),
    altKm: 790,
    spreadKm: 90,
    incDeg: 74,
    incSpread: 0.4,
  });
  debrisCloud(620, {
    name: "IRIDIUM 33 DEB",
    country: "Estados Unidos",
    launchMs: utcDate(2009, 2, 10),
    altKm: 780,
    spreadKm: 80,
    incDeg: 86.4,
    incSpread: 0.3,
  });
  debrisCloud(1300, {
    name: "COSMOS 1408 DEB",
    country: "Rusia",
    launchMs: utcDate(2021, 11, 15),
    altKm: 470,
    spreadKm: 60,
    incDeg: 82.6,
    incSpread: 0.3,
  });

  // Background LEO debris
  for (let k = 0; k < 2600; k++) {
    const alt = range(550, 1500);
    add({
      name: "DEB",
      category: DEBRIS,
      country: weighted(DEBRIS_COUNTRY_WEIGHTS),
      launchMs: utcDate(Math.floor(range(1965, 2025))),
      perigeeKm: alt,
      apogeeKm: alt + Math.abs(gauss() * 120),
      incDeg: pick([65, 71, 74, 81, 82.5, 98, 99, 28.5, 51.6]) + gauss() * 1.5,
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }

  // Geostationary transfer orbit debris
  for (let k = 0; k < 400; k++)
    add({
      name: "GTO DEB",
      category: DEBRIS,
      country: weighted(DEBRIS_COUNTRY_WEIGHTS),
      launchMs: utcDate(Math.floor(range(1975, 2025))),
      perigeeKm: range(250, 900),
      apogeeKm: range(3e4, 36500),
      incDeg: pick([7, 18, 28.5, 47]) + gauss(),
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });

  // GEO graveyard
  for (let k = 0; k < 320; k++) {
    const alt = 35786 + range(150, 450);
    add({
      name: "GEO GRAVEYARD DEB",
      category: DEBRIS,
      country: weighted(DEBRIS_COUNTRY_WEIGHTS),
      launchMs: utcDate(Math.floor(range(1980, 2024))),
      perigeeKm: alt,
      apogeeKm: alt + range(0, 80),
      incDeg: range(0, 14),
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }

  // Spent upper stages
  const rocketBodies: readonly (readonly [string, string])[] = [
    ["SL-16 R/B", "Rusia"],
    ["SL-8 R/B", "Rusia"],
    ["CZ-4B R/B", "China"],
    ["CZ-2C R/B", "China"],
    ["DELTA 2 R/B", "Estados Unidos"],
    ["FALCON 9 R/B", "Estados Unidos"],
    ["ARIANE 5 R/B", "Francia (Arianespace)"],
    ["H-2A R/B", "Japón"],
  ];
  for (let k = 0; k < 620; k++) {
    const [name, country] = pick(rocketBodies);
    const alt = range(500, 1100);
    add({
      name,
      category: ROCKET_BODY,
      country,
      launchMs: utcDate(Math.floor(range(1970, 2026))),
      perigeeKm: alt,
      apogeeKm: alt + Math.abs(gauss() * 300),
      incDeg: pick([71, 74, 81.2, 82.9, 98.5, 51.6, 28.5]) + gauss() * 0.5,
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }
  for (let k = 0; k < 380; k++) {
    const [name, country] = pick(rocketBodies);
    add({
      name,
      category: ROCKET_BODY,
      country,
      launchMs: utcDate(Math.floor(range(1980, 2026))),
      perigeeKm: range(180, 650),
      apogeeKm: range(34e3, 36200),
      incDeg: pick([0.5, 6, 18, 27, 28.5]) + gauss() * 0.4,
      raanDeg: range(0, 360),
      argpDeg: range(0, 360),
      maDeg: range(0, 360),
    });
  }

  // Projected mega-constellations (start 20 days after reference time)
  const projectedStart = referenceMs + 1728e6;
  const kuiper = { name: "KUIPER-#", category: PAYLOAD, country: "Estados Unidos (Amazon)" };
  shell({
    ...kuiper,
    planes: 34,
    perPlane: 34,
    altKm: 630,
    incDeg: 51.9,
    from: projectedStart,
    to: utcDate(2029, 6),
  });
  shell({
    ...kuiper,
    planes: 36,
    perPlane: 36,
    altKm: 610,
    incDeg: 42,
    from: utcDate(2027, 3),
    to: utcDate(2030, 6),
  });
  shell({
    ...kuiper,
    planes: 28,
    perPlane: 28,
    altKm: 590,
    incDeg: 33,
    from: utcDate(2027, 9),
    to: utcDate(2031, 6),
  });
  const guowang = { name: "GUOWANG-#", category: PAYLOAD, country: "China (China SatNet)" };
  shell({
    ...guowang,
    planes: 30,
    perPlane: 30,
    altKm: 1145,
    incDeg: 50,
    from: projectedStart,
    to: utcDate(2030, 1),
  });
  shell({
    ...guowang,
    planes: 24,
    perPlane: 24,
    altKm: 590,
    incDeg: 85,
    from: utcDate(2027, 6),
    to: utcDate(2031, 9),
  });
  shell({
    ...starlink,
    planes: 28,
    perPlane: 30,
    altKm: 525,
    incDeg: 53,
    from: projectedStart,
    to: utcDate(2028, 12),
  });
  shell({
    ...starlink,
    planes: 28,
    perPlane: 30,
    altKm: 535,
    incDeg: 33,
    from: utcDate(2027, 4),
    to: utcDate(2030, 12),
  });

  return gen.entries;
}

/** CelesTrak GP groups fetched in live mode. */
export const CELESTRAK_GROUPS: readonly string[] = [
  "active",
  "cosmos-2251-debris",
  "iridium-33-debris",
  "1999-025",
  "cosmos-1408-debris",
];

/** Category from a CelesTrak object name. */
export function categoryFromName(name: string): CategoryId {
  return name.startsWith("STARLINK")
    ? Category.STARLINK
    : /\bR\/B\b/.test(name)
      ? Category.ROCKET_BODY
      : /\bDEB\b/.test(name)
        ? Category.DEBRIS
        : Category.PAYLOAD;
}

export interface FetchCelestrakOptions {
  groups?: readonly string[];
  signal?: AbortSignal;
}

/** Downloads and de-duplicates CelesTrak GP JSON groups. */
export async function fetchCelestrak({
  groups = CELESTRAK_GROUPS,
  signal,
}: FetchCelestrakOptions = {}): Promise<CatalogEntry[]> {
  const results = await Promise.allSettled(
    groups.map((group) =>
      fetch(
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`,
        { signal },
      ).then((res): Promise<unknown> => {
        if (!res.ok) throw Error(`${group}: HTTP ${res.status}`);
        return res.json();
      }),
    ),
  );
  const seen = new Set<number | string>();
  const entries: CatalogEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      for (const gp of result.value as GpRecord[]) {
        if (seen.has(gp.NORAD_CAT_ID) || !Number.isFinite(parseEpoch(gp.EPOCH))) continue;
        seen.add(gp.NORAD_CAT_ID);
        const year = Number.parseInt(String(gp.OBJECT_ID).slice(0, 4), 10);
        entries.push({
          omm: gp,
          category: categoryFromName(gp.OBJECT_NAME),
          country: "—",
          launchMs: Number.isFinite(year) ? Date.UTC(year, 0, 1) : 0,
          projected: false,
        });
      }
    }
  }
  if (entries.length === 0) throw Error("CelesTrak no devolvió elementos orbitales.");
  return entries;
}
