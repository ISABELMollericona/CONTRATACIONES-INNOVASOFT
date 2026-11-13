"use client";

import { useEffect, useRef, useState } from "react";
import type { ContractClause } from "@/lib/contract-text";

type Props = {
  clauses: ContractClause[];
  /** Cambia cuando el contenido del contrato cambia (plan, precio, datos): obliga a leer otra vez. */
  contentKey: string;
  onReadChange: (read: boolean) => void;
};

/**
 * Muestra el contrato completo en un recuadro con desplazamiento.
 * Solo se marca como leído cuando el cliente llega al final del texto.
 */
export function ContractReader({ clauses, contentKey, onReadChange }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(false);
    setProgress(0);
    onReadChange(false);
    if (boxRef.current) boxRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  function onScroll() {
    const box = boxRef.current;
    if (!box) return;
    const max = box.scrollHeight - box.clientHeight;
    const value = max <= 0 ? 1 : box.scrollTop / max;
    setProgress((previous) => Math.max(previous, value));
    if (!read && box.scrollTop + box.clientHeight >= box.scrollHeight - 12) {
      setRead(true);
      onReadChange(true);
    }
  }

  return (
    <div className="contract-reader">
      <div className="contract-reader-head">
        <b>Contrato completo</b>
        <span className={read ? "read-ok" : ""}>{read ? "✓ Leído hasta el final" : `Leído ${Math.round(progress * 100)}% · desplázate hasta el final`}</span>
      </div>
      <div className="contract-progress"><i style={{ width: `${Math.round((read ? 1 : progress) * 100)}%` }} /></div>
      <div className="contract-text" ref={boxRef} onScroll={onScroll} tabIndex={0} aria-label="Texto del contrato">
        {clauses.map((clause) => (
          <section key={clause.title}>
            <h4>{clause.title}</h4>
            {clause.paragraphs.map((paragraph, index) => (
              paragraph.startsWith("• ")
                ? <p className="bullet" key={index}>{paragraph.slice(2)}</p>
                : <p key={index}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p className="contract-end">— Fin del contrato —</p>
      </div>
    </div>
  );
}
