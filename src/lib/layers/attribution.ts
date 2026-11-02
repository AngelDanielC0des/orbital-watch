import type { LayerAttribution } from "@/types/layers";

/** Credits and licences of the three upstream data providers. */
export const ATTRIBUTION: Readonly<Record<"gibs" | "firms" | "openMeteo", LayerAttribution>> = {
  gibs: {
    short: "NASA GIBS · OMI (Aura)",
    full: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
    licence: "Datos abiertos de la NASA",
    licenceUrl: "https://earthdata.nasa.gov/engage/open-data-services-and-software/data-information-policy",
  },
  firms: {
    short: "NASA FIRMS · VIIRS 375 m (NOAA-20, NOAA-21)",
    full: "We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS) with funding provided by NASA Headquarters.",
    licence: "Datos abiertos de la NASA",
    licenceUrl: "https://www.earthdata.nasa.gov/data/tools/firms",
  },
  openMeteo: {
    short: "Open-Meteo.com · CAMS (Copernicus)",
    full: "Datos de calidad del aire de Open-Meteo.com basados en el Copernicus Atmosphere Monitoring Service (CAMS). Contiene información modificada del servicio Copernicus.",
    licence: "CC BY 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
};

/** One-line source credit for the HUD footer. */
export const ATTRIBUTION_FOOTER_SHORT = "Fuentes: NASA GIBS · NASA FIRMS · Open-Meteo/CAMS";
