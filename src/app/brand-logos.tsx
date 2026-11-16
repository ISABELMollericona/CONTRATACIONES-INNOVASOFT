import Image from "next/image";

export function BrandLogos({ className = "" }: { className?: string }) {
  return (
    <a className={`brand-logos ${className}`} href="/" aria-label="InnovaSoft y CHAVIX">
      <Image className="brand-logo-innovasoft" src="/brand/innovasoft-logo.png" alt="InnovaSoft" width={600} height={380} />
      <span className="brand-logo-divider" aria-hidden="true" />
      <Image className="brand-logo-chavix" src="/brand/chavix-logo.png" alt="CHAVIX" width={851} height={315} />
    </a>
  );
}
