import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Permite usar otra carpeta de compilación (p. ej. para pruebas locales en paralelo).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  // pdfkit lee sus fuentes (.afm) desde node_modules en tiempo de ejecuciÃ³n;
  // si se empaqueta con webpack, falla al generar el PDF.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
