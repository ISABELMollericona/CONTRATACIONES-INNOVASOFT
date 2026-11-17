const DEFAULT_SITE_URL = "https://contrataciones-innovasoft.vercel.app";

export function getSiteUrl(): URL {
  return new URL(process.env.NEXTAUTH_URL || DEFAULT_SITE_URL);
}
