import { z } from "zod";

export const DOCUMENT_TYPES = ["CI", "NIT", "Pasaporte", "Otro"] as const;

/** Lugar de expedición del carnet de identidad boliviano. */
export const ISSUED_IN_OPTIONS = [
  { value: "LP", label: "La Paz" },
  { value: "CB", label: "Cochabamba" },
  { value: "SC", label: "Santa Cruz" },
  { value: "OR", label: "Oruro" },
  { value: "PT", label: "Potosí" },
  { value: "CH", label: "Chuquisaca" },
  { value: "TJ", label: "Tarija" },
  { value: "BE", label: "Beni" },
  { value: "PD", label: "Pando" },
  { value: "EXT", label: "Extranjero" },
] as const;

const issuedInValues = ISSUED_IN_OPTIONS.map((option) => option.value) as [string, ...string[]];

/** Máximo tamaño aceptado de la imagen de la firma dibujada (data URL PNG). */
export const MAX_SIGNATURE_LENGTH = 300_000;

export const signerDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  number: z.string().trim().min(3).max(40).regex(/^[0-9A-Za-z-]+$/),
  complement: z.string().trim().max(5).regex(/^[0-9A-Za-z]*$/).optional(),
  issuedIn: z.enum(issuedInValues).or(z.literal("")).optional(),
});

export const signatureImageSchema = z
  .string()
  .max(MAX_SIGNATURE_LENGTH)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);

export type SignerDocument = z.infer<typeof signerDocumentSchema>;

/** Texto legible, por ejemplo "CI 1234567-1A LP". */
export function formatDocument(document: { type: string; number: string; complement?: string; issuedIn?: string }) {
  const complement = document.complement ? `-${document.complement}` : "";
  const issued = document.issuedIn ? ` ${document.issuedIn}` : "";
  return `${document.type} ${document.number}${complement}${issued}`;
}
