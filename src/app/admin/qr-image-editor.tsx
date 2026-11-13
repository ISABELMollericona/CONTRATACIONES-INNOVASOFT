"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

type Props = {
  label: string;
  imageUrl: string;
  onUploaded: (imageUrl: string) => void;
};

function drawSquareCrop(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  zoom: number,
  horizontal: number,
  vertical: number,
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no puede recortar la imagen.");
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, (canvas.width - width) * horizontal / 100, (canvas.height - height) * vertical / 100, width, height);
}

export function QrImageEditor({ label, imageUrl, onUploaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!sourceUrl || !canvasRef.current) return;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      try {
        if (canvasRef.current) drawSquareCrop(image, canvasRef.current, zoom, horizontal, vertical);
      } catch (drawError) {
        setError(drawError instanceof Error ? drawError.message : "No se pudo recortar la imagen.");
      }
    };
    image.onerror = () => setError("No se pudo abrir la imagen seleccionada.");
    image.src = sourceUrl;
  }, [sourceUrl, zoom, horizontal, vertical]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    if (!selected) return;
    if (!["image/jpeg", "image/png"].includes(selected.type)) {
      setError("El QR debe ser una imagen JPG o PNG.");
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError("La imagen QR debe pesar como máximo 5 MB.");
      return;
    }
    setZoom(1);
    setHorizontal(50);
    setVertical(50);
    setFile(selected);
  }

  async function uploadCrop() {
    if (!file || !imageRef.current || !canvasRef.current) return;
    setBusy(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      output.width = 512;
      output.height = 512;
      drawSquareCrop(imageRef.current, output, zoom, horizontal, vertical);
      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo generar el recorte.")), "image/jpeg", 0.92);
      });
      const form = new FormData();
      form.set("file", blob, "qr.jpg");
      const response = await fetch("/api/admin/qr", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo subir el QR.");
      if (typeof result.imageUrl !== "string" || !result.imageUrl) throw new Error("El servidor no devolvió la dirección de la imagen.");
      onUploaded(result.imageUrl);
      setFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el QR.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qr-image-editor">
      <label>{label}<input type="file" accept="image/jpeg,image/png" onChange={chooseFile} /></label>
      {file
        ? <>
            <canvas className="qr-crop-preview" ref={canvasRef} width={260} height={260} aria-label={`Vista previa cuadrada de ${label}`} />
            <p className="muted">Mantén las cuatro esquinas del código dentro del recuadro para que se pueda escanear.</p>
            <label>Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
            <label>Posición horizontal<input type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
            <label>Posición vertical<input type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
            <button type="button" className="button button-small" disabled={busy || !sourceUrl} onClick={uploadCrop}>{busy ? "Subiendo..." : "Aplicar recorte y subir"}</button>
          </>
        : imageUrl
          ? <img className="qr-crop-preview" src={imageUrl} alt={label} />
          : <p className="muted">Todavía no hay una imagen cargada.</p>}
      {imageUrl && <a className="text-link" href={imageUrl} target="_blank" rel="noreferrer">Ver QR cargado</a>}
      {error && <span className="id-photo-error">{error}</span>}
    </div>
  );
}
