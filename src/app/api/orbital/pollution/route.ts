/** `GET /api/orbital/pollution`: surface air quality at the sample points (Open-Meteo CAMS, memo 1 h). */
import { isPollutionDTO } from "@/lib/layers/pollution/pollution.service";
import { SAMPLE_POINTS } from "@/lib/layers/pollution/sample-points";
import { errorJson, okJson, parseMock } from "@/lib/server/envelope";
import { memo } from "@/lib/server/memo";
import { fetchPollution, upstreamCallCount } from "@/lib/server/open-meteo";
import { loadSnapshot } from "@/lib/server/snapshots";
import type { PollutionDTO } from "@/types/layers";

export const maxDuration = 30;

const TTL_SEC = 3600;
const SOURCE = "Open-Meteo CAMS";

async function servePollutionSnapshot(origin: string): Promise<Response> {
  const snapshot = await loadSnapshot("pollution", origin);
  if (snapshot && isPollutionDTO(snapshot.data)) {
    const dto: PollutionDTO = snapshot.data;
    return okJson(dto, { source: SOURCE, dataDate: dto.time, fetchedAt: new Date().toISOString(), fallback: true }, 300);
  }
  return errorJson("upstream", "Fuente no disponible y sin instantánea", 503, { source: SOURCE });
}

/** Pollution route (takes no parameters except the dev flag `mock`). */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mock = parseMock(url.searchParams);
  if (!mock.ok) return errorJson("invalid", mock.message, 400, { source: SOURCE });
  if (mock.value === "error") return errorJson("upstream", "Error simulado", 500, { source: SOURCE });
  if (mock.value === "snapshot") return servePollutionSnapshot(url.origin);

  const result = await memo(
    "pollution",
    TTL_SEC * 1000,
    async () => {
      const fetched = await fetchPollution(SAMPLE_POINTS);
      if (process.env.NODE_ENV !== "production") console.info("[orbital] open-meteo upstream calls:", upstreamCallCount());
      return { fetched, fetchedAt: new Date().toISOString() };
    },
    (v) => v.fetched.ok,
  );
  if (!result.fetched.ok) return servePollutionSnapshot(url.origin);
  const dto = result.fetched.value;
  return okJson(dto, { source: SOURCE, dataDate: dto.time, fetchedAt: result.fetchedAt, fallback: false }, TTL_SEC);
}
