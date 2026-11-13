"use client";

import { useState } from "react";

const MAX_SIDE = 1600;

/** Reduce la foto (máx. 1600 px, JPEG) para que se suba rápido y siga siendo legible. */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No se pudo leer la imagen."));
      element.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no permite procesar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Props = { label: string; value: string; onChange: (dataUrl: string) => void; disabled?: boolean };

export function IdPhotoInput({ label, value, onChange, disabled }: Props) {
  const [error, setError] = useState("");
  return (
    <label className={`id-photo ${value ? "has-photo" : ""}`}>
      <span className="id-photo-label">{label}</span>
      {value
        ? <img src={value} alt={label} />
        : <span className="id-photo-empty"><b>📷</b>Toca para tomar o subir la foto</span>}
      <input
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        disabled={disabled}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          if (!["image/jpeg", "image/png"].includes(file.type)) {
            setError("Usa una foto JPG o PNG.");
            return;
          }
          if (file.size > 15 * 1024 * 1024) {
            setError("La foto es demasiado grande (máximo 15 MB).");
            return;
          }
          try {
            onChange(await compress(file));
          } catch (compressError) {
            setError(compressError instanceof Error ? compressError.message : "No se pudo procesar la foto.");
          }
        }}
      />
      {value && <span className="id-photo-change">Cambiar foto</span>}
      {error && <span className="id-photo-error">{error}</span>}
    </label>
  );
}
