import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "CHAVIX | Software para farmacias en Bolivia - InnovaSoft",
  description: "Gestiona tu farmacia en Bolivia con CHAVIX: facturación SIAT, inventario por lotes y vencimientos, caja, reportes y sucursales. Consulta planes y cotiza en línea.",
  applicationName: "CHAVIX de InnovaSoft",
  keywords: [
    "software para farmacias en Bolivia",
    "sistema para farmacia",
    "facturación SIAT",
    "inventario de farmacia",
    "control de lotes y vencimientos",
    "CHAVIX",
    "InnovaSoft",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "es_BO",
    url: "/",
    siteName: "CHAVIX | InnovaSoft",
    title: "CHAVIX | Software para farmacias en Bolivia",
    description: "Sistema de gestión para farmacias con facturación SIAT, inventario, caja y reportes. Conoce planes y solicita una cotización en línea.",
    images: [{ url: "/brand/innovasoft-logo.png", width: 600, height: 380, alt: "InnovaSoft y CHAVIX" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CHAVIX | Software para farmacias en Bolivia",
    description: "Sistema de gestión para farmacias con facturación SIAT, inventario, caja y reportes.",
    images: ["/brand/innovasoft-logo.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  name: "InnovaSoft",
                  alternateName: "CHAVIX",
                  url: siteUrl.origin,
                  logo: new URL("/brand/innovasoft-logo.png", siteUrl).toString(),
                },
                {
                  "@type": "WebSite",
                  name: "CHAVIX | InnovaSoft",
                  url: siteUrl.origin,
                  inLanguage: "es-BO",
                },
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}
