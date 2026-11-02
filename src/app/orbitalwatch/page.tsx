import type { Metadata } from "next";
import { OrbitalWatch } from "@/components/sites/orbitalwatch/OrbitalWatch";
import { SITE_NAME } from "@/engine/config";
import "@/components/sites/orbitalwatch/orbitalwatch.css";

const TITLE = `${SITE_NAME} 3D: satélites y basura espacial en tiempo real`;
const DESCRIPTION =
  "Visor 3D de satélites y basura espacial en órbita terrestre, con escalas al sistema solar y la Vía Láctea. Propagación SGP4 en el navegador.";
const OG_IMAGE = "/sites/orbitalwatch/og.jpg";
const IMAGE_ALT = `${SITE_NAME} 3D: Tierra y objetos en órbita sobre fondo espacial`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  authors: [{ name: SITE_NAME }],
  applicationName: `${SITE_NAME} 3D`,
  icons: { icon: { url: OG_IMAGE, type: "image/jpeg" } },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: `${SITE_NAME} 3D`,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, type: "image/jpeg", width: 1200, height: 630, alt: IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Visor 3D de satélites y basura espacial, sistema solar y Vía Láctea. Propagación SGP4 en el navegador.",
    images: [{ url: OG_IMAGE, alt: IMAGE_ALT }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["WebApplication", "SoftwareApplication"],
      name: `${SITE_NAME} 3D`,
      applicationCategory: "EducationalApplication",
      applicationSubCategory: "Astronomy",
      operatingSystem: "Web",
      browserRequirements: "Requiere JavaScript y WebGL",
      inLanguage: "es",
      isAccessibleForFree: true,
      description:
        "Aplicación web 3D para observar satélites y basura espacial en órbita terrestre con propagación SGP4, y cambiar de escala al sistema solar (efemérides JPL) y a la Vía Láctea.",
      featureList: [
        "Propagación orbital SGP4 en tiempo real",
        "Filtros de basura espacial, Starlink y objetos previstos",
        "Vista del sistema solar con efemérides JPL",
        "Vista de la Vía Láctea",
        "Línea de tiempo UTC con velocidades de simulación",
      ],
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  ],
};

export default function OrbitalWatchPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <OrbitalWatch />
    </>
  );
}
