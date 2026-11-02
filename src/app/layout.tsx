import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Saira_Semi_Condensed } from "next/font/google";
import { SITE_NAME } from "@/engine/config";
import "./globals.css";

const saira = Saira_Semi_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${SITE_NAME} 3D: satélites y basura espacial en tiempo real`,
  description:
    "Visor 3D de satélites y basura espacial en órbita terrestre, con escalas al sistema solar y la Vía Láctea. Propagación SGP4 en el navegador.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${saira.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
