const DEFAULT_SITE_URL = "https://chavix-contrataciones.onrender.com";

export function getSiteUrl(): URL {
  return new URL(process.env.NEXTAUTH_URL || DEFAULT_SITE_URL);
}
