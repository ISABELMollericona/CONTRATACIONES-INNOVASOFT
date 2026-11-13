"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
};

/**
 * Recuadro para dibujar la firma con mouse, lápiz o dedo.
 * Devuelve un PNG (data URL) con fondo transparente y trazo oscuro, listo para el PDF.
 */
export function SignaturePad({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#0d1b2a";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    const context = event.currentTarget.getContext("2d");
    if (context && last.current) {
      context.beginPath();
      context.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      context.fillStyle = "#0d1b2a";
      context.fill();
    }
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    event.preventDefault();
    const next = point(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.beginPath();
    context.moveTo(last.current.x, last.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    last.current = next;
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    strokes.current += 1;
    setEmpty(false);
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    strokes.current = 0;
    setEmpty(true);
    onChange("");
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        aria-label="Recuadro para dibujar la firma"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      {empty && <span className="signature-placeholder">Firma aquí con el mouse o el dedo</span>}
      <div className="signature-line" />
      <button type="button" className="text-link signature-clear" onClick={clear} disabled={disabled || empty}>Borrar firma</button>
    </div>
  );
}
