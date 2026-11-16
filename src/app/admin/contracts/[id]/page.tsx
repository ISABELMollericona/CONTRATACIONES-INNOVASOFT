"use client";

import { signIn, useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { auditLabels, billingLabels, dateTime, money, paymentLabels, statusLabels, statusTone, timeAgo, whatsappLink } from "@/app/admin/labels";

type Detail = {
  id: string;
  code: string;
  createdAt: string;
  ownerEmail: string;
  status: string;
  paymentStatus: string;
  selection: {
    productName: string;
    mode: string;
    planName: string;
    billing: string;
    duration: number;
    extraBranches?: number;
    includedBranches?: number;
    siatOption?: "with" | "without";
  };
  customer: {
    name: string;
    phone: string;
    email: string;
    businessName: string;
    address: string;
    city: string;
  };
  customerDocument: string;
  pricing: {
    unitPrice: number;
    originalTotal: number;
    discount: number;
    total: number;
    promotionName: string;
    periods: { label: string; amount: number }[];
    maintenanceAnnual: number;
    extraBranchesTotal?: number;
  };
  signedAt: string;
  signerName: string;
  signerDocumentText: string;
  signatureImage: string;
  signatureHash: string;
  identityPhotos: { front: { format: string } | null; back: { format: string } | null };
  receipt: { format: string; uploadedAt: string } | null;
  contractClauses: { title: string; paragraphs: string[] }[];
  readConfirmedAt: string | null;
  documentHash: string;
  audit: { event: string; by: string; at: string; note: string }[];
};

function Field({ label, value, copy }: { label: string; value?: string | number | null; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <div className="kv">
      <span>{label}</span>
      <b>{text}{copy && text !== "—" && (
        <button type="button" className="copy-btn" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "✓" : "Copiar"}</button>
      )}</b>
    </div>
  );
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [showClauses, setShowClauses] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/contracts/${id}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "No se pudo cargar la contratación.");
    setDetail(body as Detail);
  }, [id]);

  useEffect(() => {
    if (status !== "authenticated") return;
    load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Error al cargar."));
  }, [status, load]);

  async function act(decision: "validate" | "reject" | "note", text = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/contracts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: text }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo completar la acción.");
      await load();
      setNotice(decision === "validate" ? "Pago validado: el contrato está activo." : decision === "reject" ? "Pago rechazado: el cliente puede enviar otro comprobante." : "Nota guardada.");
      if (decision === "note") setNote("");
      if (decision === "reject") { setRejectReason(""); setShowReject(false); }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <main className="wrap admin-page"><div className="empty">Cargando...</div></main>;
  if (!session?.user) return <main className="wrap admin-page"><div className="empty"><h1>Panel CHAVIX</h1><button className="button" onClick={() => signIn()}>Entrar</button></div></main>;
  if (session.user.role !== "admin") return <main className="wrap admin-page"><div className="alert error">Tu cuenta no tiene permisos de administración.</div></main>;
  if (error && !detail) return <main className="wrap admin-page"><a className="text-link" href="/admin">← Volver a contrataciones</a><div className="alert error">{error}</div></main>;
  if (!detail) return <main className="wrap admin-page"><div className="empty">Cargando contratación...</div></main>;

  const tone = statusTone(detail.paymentStatus, detail.status);
  const pendingReview = detail.paymentStatus === "pending_review";
  const totalBranches = (detail.selection.includedBranches ?? 1) + (detail.selection.extraBranches ?? 0);
  const firstName = detail.customer.name.split(" ")[0];
  const waText = pendingReview
    ? `Hola ${firstName}, te escribimos de CHAVIX sobre tu contratación ${detail.code}. Ya recibimos tu comprobante y lo estamos revisando.`
    : detail.status === "active"
      ? `Hola ${firstName}, tu contratación ${detail.code} de ${detail.selection.productName} ya está activa. Coordinemos la instalación.`
      : `Hola ${firstName}, te escribimos de CHAVIX sobre tu contratación ${detail.code} por ${money(detail.pricing.total)}. ¿Pudiste realizar el pago?`;
  const receiptUrl = `/api/admin/contracts/${detail.id}/receipt?inline=1`;
  const notes = detail.audit.filter((item) => item.event === "admin_note");

  return (
    <main className="wrap admin-page detail-page">
      <a className="text-link back-link" href="/admin">← Volver a contrataciones</a>

      <header className={`detail-hero tone-${tone}`}>
        <div>
          <span className="eyebrow">CONTRATACIÓN</span>
          <h1>{detail.code}</h1>
          <p className="muted">Creada el {dateTime(detail.createdAt)} · {timeAgo(detail.createdAt)}</p>
          <div className="pill-row">
            <span className={`pill pill-${tone}`}>{statusLabels[detail.status] ?? detail.status}</span>
            <span className="pill">{paymentLabels[detail.paymentStatus] ?? detail.paymentStatus}</span>
            {detail.selection.siatOption && <span className="pill">{detail.selection.siatOption === "with" ? "Con SIAT" : "Sin SIAT"}</span>}
          </div>
        </div>
        <div className="hero-total">
          <span>Total</span>
          <strong>{money(detail.pricing.total)}</strong>
          <small>{detail.selection.productName} · {detail.selection.planName}</small>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success-alert">{notice}</div>}

      <div className="action-bar">
        {pendingReview && <>
          <button className="button" disabled={busy} onClick={() => { if (window.confirm(`¿Validar el pago de ${money(detail.pricing.total)} y activar ${detail.code}?`)) act("validate"); }}>✓ Validar pago y activar</button>
          <button className="button button-danger" disabled={busy} onClick={() => setShowReject((value) => !value)}>✕ Rechazar pago</button>
        </>}
        <a className="button button-outline" href={`/api/contracts/${detail.id}/pdf`}>⬇ Contrato PDF</a>
        <a className="button button-outline" href={whatsappLink(detail.customer.phone, waText)} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className="button button-outline" href={`tel:${detail.customer.phone}`}>Llamar</a>
        <a className="button button-outline" href={`mailto:${detail.customer.email}?subject=${encodeURIComponent(`Contratación ${detail.code}`)}`}>Correo</a>
      </div>
      {showReject && <div className="reject-box">
        <label>Motivo del rechazo (el cliente podrá enviar otro comprobante)<textarea rows={2} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Ej.: el monto no coincide, comprobante ilegible…" /></label>
        <button className="button button-danger" disabled={busy} onClick={() => act("reject", rejectReason)}>Confirmar rechazo</button>
      </div>}

      <div className="detail-grid">
        <section className="detail-card">
          <h2>Cliente</h2>
          <Field label="Nombre" value={detail.customer.name} />
          <Field label="Documento" value={detail.customerDocument} copy />
          <Field label="Teléfono" value={detail.customer.phone} copy />
          <Field label="Correo" value={detail.customer.email} copy />
          <Field label="Negocio" value={detail.customer.businessName} />
          <Field label="Dirección" value={[detail.customer.address, detail.customer.city].filter(Boolean).join(", ")} />
          <Field label="Cuenta Google" value={detail.ownerEmail} />
        </section>

        <section className="detail-card">
          <h2>Plan contratado</h2>
          <Field label="Sistema" value={`${detail.selection.productName} · ${detail.selection.mode}`} />
          <Field label="Plan" value={`${detail.selection.planName} (${billingLabels[detail.selection.billing] ?? detail.selection.billing})`} />
          {detail.selection.billing === "monthly" && <Field label="Duración" value={`${detail.selection.duration} mes${detail.selection.duration === 1 ? "" : "es"}`} />}
          <Field label="Locales" value={`${totalBranches}${detail.selection.extraBranches ? ` (${detail.selection.extraBranches} adicional${detail.selection.extraBranches === 1 ? "" : "es"})` : ""}`} />
          <Field label="Facturación SIAT" value={detail.selection.siatOption ? (detail.selection.siatOption === "with" ? "Con SIAT" : "Sin SIAT") : "No especificado"} />
          {detail.pricing.maintenanceAnnual > 0 && <Field label="Mantenimiento" value={`${money(detail.pricing.maintenanceAnnual)} al año`} />}
          <div className="price-table">
            {detail.pricing.periods.map((period) => <div key={period.label}><span>{period.label}</span><span>{money(period.amount)}</span></div>)}
            {detail.pricing.discount > 0 && <div className="saving"><span>{detail.pricing.promotionName || "Descuento"}</span><span>−{money(detail.pricing.discount)}</span></div>}
            <div className="total"><span>Total</span><span>{money(detail.pricing.total)}</span></div>
          </div>
        </section>

        <section className="detail-card span-2">
          <h2>Comprobante de pago</h2>
          {detail.receipt ? <>
            <p className="muted">Subido el {dateTime(detail.receipt.uploadedAt)} · {timeAgo(detail.receipt.uploadedAt)} · Monto esperado: <b>{money(detail.pricing.total)}</b></p>
            <div className="receipt-view">
              {detail.receipt.format === "pdf"
                ? <iframe src={receiptUrl} title="Comprobante PDF" />
                : <img src={receiptUrl} alt="Comprobante de pago" onClick={() => setZoom({ src: receiptUrl, alt: "Comprobante de pago" })} />}
            </div>
            <a className="text-link" href={`/api/admin/contracts/${detail.id}/receipt`}>Descargar comprobante</a>
          </> : <div className="empty compact">El cliente todavía no subió el comprobante.</div>}
        </section>

        <section className="detail-card">
          <h2>Firma</h2>
          {detail.signatureImage
            ? <div className="signature-view"><img src={detail.signatureImage} alt="Firma del cliente" /></div>
            : <div className="empty compact">Sin firma dibujada (contrato anterior).</div>}
          <Field label="Firmante" value={detail.signerName} />
          <Field label="Documento" value={detail.signerDocumentText} copy />
          <Field label="Firmó el" value={dateTime(detail.signedAt)} />
          <Field label="Leyó todo el contrato" value={detail.readConfirmedAt ? `Sí, ${dateTime(detail.readConfirmedAt)}` : "No registrado"} />
        </section>

        <section className="detail-card">
          <h2>Carnet de identidad</h2>
          {detail.identityPhotos.front || detail.identityPhotos.back ? (
            <div className="id-view">
              {(["front", "back"] as const).map((side) => detail.identityPhotos[side] && (
                <figure key={side}>
                  <img src={`/api/admin/contracts/${detail.id}/identity/${side}`} alt={side === "front" ? "Carnet anverso" : "Carnet reverso"} onClick={() => setZoom({ src: `/api/admin/contracts/${detail.id}/identity/${side}`, alt: side === "front" ? "Carnet anverso" : "Carnet reverso" })} />
                  <figcaption>{side === "front" ? "Anverso" : "Reverso"}</figcaption>
                </figure>
              ))}
            </div>
          ) : <div className="empty compact">Sin fotos del carnet (contrato anterior).</div>}
          <p className="muted">Compara el nombre y número del carnet con: <b>{detail.signerName}</b> · <b>{detail.signerDocumentText}</b></p>
        </section>

        <section className="detail-card span-2">
          <div className="card-head"><h2>Contrato firmado</h2><button type="button" className="text-link" onClick={() => setShowClauses((value) => !value)}>{showClauses ? "Ocultar texto" : `Ver las ${detail.contractClauses?.length ?? 0} cláusulas`}</button></div>
          {showClauses && <div className="clauses-view">
            {detail.contractClauses?.map((clause) => <div key={clause.title}><h4>{clause.title}</h4>{clause.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>)}
          </div>}
          <p className="hash">Integridad (SHA-256): {detail.documentHash}</p>
        </section>

        <section className="detail-card">
          <h2>Historial</h2>
          <ol className="timeline">
            {[...detail.audit].reverse().map((item, index) => (
              <li key={`${item.event}-${index}`} className={`ev-${item.event}`}>
                <b>{auditLabels[item.event] ?? item.event}</b>
                <small>{dateTime(item.at)} · {item.by}</small>
                {item.note && <p>{item.note}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className="detail-card">
          <h2>Notas internas {notes.length > 0 && <span className="count-pill">{notes.length}</span>}</h2>
          <p className="muted">Solo las ve administración. Ej.: “Instalación coordinada para el lunes”.</p>
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escribe una nota…" />
          <button className="button button-dark" disabled={busy || !note.trim()} onClick={() => act("note", note)}>Guardar nota</button>
        </section>
      </div>

      {zoom && <div className="zoom-overlay" onClick={() => setZoom(null)} role="dialog" aria-label={zoom.alt}>
        <img src={zoom.src} alt={zoom.alt} />
        <span>Toca para cerrar</span>
      </div>}
    </main>
  );
}
