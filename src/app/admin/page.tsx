"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { QrImageEditor } from "@/app/admin/qr-image-editor";
import { qrExpiryStatus } from "@/lib/qr-expiry";

type AdminPlan = {
  id?: string;
  name: string;
  mode: string;
  billing: "monthly" | "annual" | "one_time";
  price: number;
  durationOptions: number[];
  maintenanceAnnual?: number;
  enabled: boolean;
  description: string;
  badge: string;
  compareAtPrice: number;
  includedBranches: number;
  extraBranchPrice: number;
  maxExtraBranches: number;
  warrantyMonths: number;
};
type AdminProduct = {
  slug: string;
  name: string;
  description: string;
  features: string[];
  modes: string[];
  active: boolean;
  includes: string;
  plans: AdminPlan[];
};
type Config = {
  products: AdminProduct[];
  settings: {
    businessName: string;
    contactPhone: string;
    contactEmail: string;
    bankName: string;
    beneficiary: string;
    accountNumber: string;
    qrImageUrl: string;
    qrImageValidUntil: string;
    paymentInstructions: string;
    contractTerms: string;
    qrByAmount: { amount: number; imageUrl: string; validUntil: string }[];
  };
  promotion: { active: boolean; startsAt: string; endsAt: string } | null;
};
type AdminContract = {
  id: string;
  code: string;
  productName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  customerName: string;
  signerName: string;
  signerDocument: string;
  hasSignature: boolean;
  hasIdentityPhotos: boolean;
  customerPhone: string;
  planName: string;
  mode: string;
};

/** Convierte ISO (UTC) al formato local que espera <input type="datetime-local">. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const statusLabels: Record<string, string> = {
  unpaid: "Sin pago",
  pending_review: "Por revisar",
  validated: "Validado",
  rejected: "Rechazado",
  pending_payment: "Pendiente de pago",
  active: "Activo",
  cancelled: "Cancelado",
};

const blankSettings: Config["settings"] = {
  businessName: "CHAVIX",
  contactPhone: "",
  contactEmail: "",
  bankName: "",
  beneficiary: "",
  accountNumber: "",
  qrImageUrl: "",
  qrImageValidUntil: "",
  paymentInstructions: "",
  contractTerms: "El comprobante será revisado por CHAVIX. La contratación se activa después de validar el pago y completar la aceptación del contrato.",
  qrByAmount: [],
};
const newPlan = (mode: string): AdminPlan => ({ name: "Nuevo plan", mode, billing: "monthly", price: 0, durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], enabled: false, description: "", badge: "", compareAtPrice: 0, includedBranches: 1, extraBranchPrice: 0, maxExtraBranches: 0, warrantyMonths: 0 });

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [config, setConfig] = useState<Config | null>(null);
  const [contracts, setContracts] = useState<AdminContract[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [qrClock, setQrClock] = useState(() => Date.now());

  async function load() {
    const [configResponse, contractsResponse] = await Promise.all([
      fetch("/api/admin/config"),
      fetch("/api/contracts"),
    ]);
    const configBody = await configResponse.json();
    const contractBody = await contractsResponse.json();
    if (!configResponse.ok) throw new Error(configBody.error ?? "No se pudo cargar la configuración.");
    if (!contractsResponse.ok) throw new Error(contractBody.error ?? "No se pudieron cargar las contrataciones.");
    setConfig({
      products: configBody.products,
      settings: { ...blankSettings, ...configBody.settings },
      promotion: configBody.promotion,
    });
    setContracts(contractBody);
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Error cargando el panel."));
  }, [status]);

  useEffect(() => {
    const timer = window.setInterval(() => setQrClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  function updateProduct(index: number, patch: Partial<AdminProduct>) {
    if (!config) return;
    const products = [...config.products];
    products[index] = { ...products[index], ...patch };
    setConfig({ ...config, products });
  }

  function updatePlan(productIndex: number, planIndex: number, patch: Partial<AdminPlan>) {
    if (!config) return;
    const products = [...config.products];
    const plans = [...products[productIndex].plans];
    plans[planIndex] = { ...plans[planIndex], ...patch };
    products[productIndex] = { ...products[productIndex], plans };
    setConfig({ ...config, products });
  }

  function updateQr(index: number, patch: Partial<Config["settings"]["qrByAmount"][number]>) {
    if (!config) return;
    setConfig({
      ...config,
      settings: {
        ...config.settings,
        qrByAmount: config.settings.qrByAmount.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item),
      },
    });
  }

  function addProduct() {
    if (!config) return;
    const number = config.products.length + 1;
    const slug = `nuevo-sistema-${number}`;
    setConfig({
      ...config,
      products: [...config.products, {
        slug,
        name: `Nuevo sistema ${number}`,
        description: "Describe qué resuelve este sistema.",
        features: ["Nueva característica"],
        modes: ["Unisucursal"],
        active: false,
        includes: "",
        plans: [{ ...newPlan("Unisucursal"), name: "Mensual", enabled: true }],
      }],
    });
  }

  async function saveConfig() {
    if (!config) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          promotion: config.promotion ?? {
            active: false,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 86400000).toISOString(),
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar.");
      setNotice("Configuración guardada.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function decidePayment(id: string, decision: "validate" | "reject") {
    const note = decision === "reject" ? window.prompt("Motivo de rechazo (opcional):") ?? "" : "";
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/contracts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo procesar el pago.");
      await load();
      setNotice(decision === "validate" ? "Pago validado y contrato activado." : "Pago rechazado; el cliente puede enviar otro comprobante.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <main className="wrap admin-page"><div className="empty">Cargando...</div></main>;
  if (!session?.user) return <main className="wrap admin-page"><div className="empty"><h1>Panel CHAVIX</h1><p>Inicia sesión con la cuenta Google autorizada como administradora.</p><button className="button" onClick={() => signIn("google")}>Entrar con Google</button></div></main>;
  if (session.user.role !== "admin") return <main className="wrap admin-page"><div className="alert error">Tu cuenta no tiene permisos de administración.</div><a className="text-link" href="/">Volver al catálogo</a></main>;

  const expiringQrs = config ? [
    ...(config.settings.qrImageUrl ? [{ label: "QR general", validUntil: config.settings.qrImageValidUntil }] : []),
    ...config.settings.qrByAmount.map((item) => ({ label: `QR de Bs ${item.amount.toLocaleString("es-BO")}`, validUntil: item.validUntil })),
  ].filter((item) => item.validUntil && qrExpiryStatus(item.validUntil, new Date(qrClock)) !== "active") : [];

  return (
    <main className="wrap admin-page">
      <header className="admin-header">
        <div><a className="brand" href="/">✳ CHAVIX</a><span className="eyebrow"> / ADMINISTRACIÓN</span><h1>Panel de control</h1></div>
        <a className="button button-outline" href="/">Ver catálogo</a>
      </header>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success-alert">{notice}</div>}

      <section className="admin-section">
        <div className="section-heading"><div><span className="eyebrow">OPERACIÓN</span><h2>Pagos pendientes</h2></div><span className="count-pill">{contracts.filter((item) => item.paymentStatus === "pending_review").length} por revisar</span></div>
        <div className="admin-table">
          <div className="admin-table-head"><span>Contrato</span><span>Producto / firmante</span><span>Total</span><span>Estado</span><span>Acción</span></div>
          {contracts.map((item) => (
            <div className="admin-table-row" key={item.id}>
              <span><b>{item.code}</b><small>{new Date(item.createdAt).toLocaleDateString("es-BO")}</small><a className="text-link pdf-link" href={`/api/contracts/${item.id}/pdf`}>PDF firmado</a></span>
              <span>{item.productName} · {item.planName}<small>{item.customerPhone} · </small><small>{item.signerName || item.customerName}{item.signerDocument ? ` · ${item.signerDocument}` : ""}{item.hasSignature ? " · ✍ firmado" : ""}</small>{item.hasIdentityPhotos && <small><a className="text-link pdf-link" href={`/api/admin/contracts/${item.id}/identity/front`} target="_blank" rel="noreferrer">Carnet anverso</a> · <a className="text-link pdf-link" href={`/api/admin/contracts/${item.id}/identity/back`} target="_blank" rel="noreferrer">reverso</a></small>}</span>
              <span>Bs {item.total.toLocaleString("es-BO")}</span>
              <span><em className={`status status-${item.paymentStatus}`}>{statusLabels[item.paymentStatus] ?? item.paymentStatus}</em></span>
              <span>{item.paymentStatus === "pending_review" ? <div className="row-actions"><a href={`/api/admin/contracts/${item.id}/receipt`} target="_blank" rel="noreferrer">Ver comprobante</a><button disabled={busy} onClick={() => decidePayment(item.id, "validate")}>Validar</button><button className="danger-link" disabled={busy} onClick={() => decidePayment(item.id, "reject")}>Rechazar</button></div> : statusLabels[item.status] ?? item.status}</span>
            </div>
          ))}
          {contracts.length === 0 && <div className="empty compact">No hay contrataciones todavía.</div>}
        </div>
      </section>

      {config && <section className="admin-section">
        <div className="section-heading"><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Sistemas, modalidades y precios</h2></div><button className="button button-outline" onClick={addProduct}>+ Agregar sistema</button></div>
        <div className="admin-products">
          {config.products.map((product, productIndex) => (
            <article className="admin-product" key={`${product.slug}-${productIndex}`}>
              <div className="admin-product-heading">
                <div><span className="eyebrow">{product.slug}</span><h3>{product.name}</h3></div>
                <label className="switch-label"><input type="checkbox" checked={product.active} onChange={(event) => updateProduct(productIndex, { active: event.target.checked })} /> Publicado</label>
              </div>
              <div className="field-pair">
                <label>Slug (identificador)<input value={product.slug} readOnly /></label>
                <label>Nombre del sistema<input value={product.name} onChange={(event) => updateProduct(productIndex, { name: event.target.value })} /></label>
              </div>
              <label>Descripción<textarea value={product.description} onChange={(event) => updateProduct(productIndex, { description: event.target.value })} rows={2} /></label>
              <div className="field-pair">
                <label>Modalidades (una por línea)<textarea value={product.modes.join("\n")} onChange={(event) => updateProduct(productIndex, { modes: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} rows={3} /></label>
                <label>Características (una por línea, «Título: detalle»)<textarea value={product.features.join("\n")} onChange={(event) => updateProduct(productIndex, { features: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} rows={3} /></label>
              </div>
              <label>Todos los planes incluyen<input placeholder="facturas SIAT ilimitadas, instalación, capacitación y soporte remoto" value={product.includes} onChange={(event) => updateProduct(productIndex, { includes: event.target.value })} /></label>
              <h4>Planes y precios</h4>
              {product.plans.map((plan, planIndex) => (
                <div className="plan-editor" key={plan.id ?? planIndex}>
                  <label>Nombre<input value={plan.name} onChange={(event) => updatePlan(productIndex, planIndex, { name: event.target.value })} /></label>
                  <label>Modalidad<input value={plan.mode} onChange={(event) => updatePlan(productIndex, planIndex, { mode: event.target.value })} /></label>
                  <label>Tipo<select value={plan.billing} onChange={(event) => updatePlan(productIndex, planIndex, { billing: event.target.value as AdminPlan["billing"] })}><option value="monthly">Mensual</option><option value="annual">Anual</option><option value="one_time">Pago único</option></select></label>
                  <label>Precio (Bs)<input type="number" min="0" step="0.01" value={plan.price} onChange={(event) => updatePlan(productIndex, planIndex, { price: Number(event.target.value) })} /></label>
                  <label>Duraciones, meses<input value={plan.durationOptions.join(",")} onChange={(event) => updatePlan(productIndex, planIndex, { durationOptions: event.target.value.split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0) })} /></label>
                  <label>Mantenimiento/año<input type="number" min="0" step="0.01" value={plan.maintenanceAnnual ?? 0} onChange={(event) => updatePlan(productIndex, planIndex, { maintenanceAnnual: Number(event.target.value) })} /></label>
                  <label>Precio tachado (Bs)<input type="number" min="0" step="0.01" value={plan.compareAtPrice} onChange={(event) => updatePlan(productIndex, planIndex, { compareAtPrice: Number(event.target.value) })} /></label>
                  <label>Etiqueta<input placeholder="2 meses gratis" value={plan.badge} onChange={(event) => updatePlan(productIndex, planIndex, { badge: event.target.value })} /></label>
                  <label className="wide-field">Descripción corta<input placeholder="Pagas 10 meses y usas 12" value={plan.description} onChange={(event) => updatePlan(productIndex, planIndex, { description: event.target.value })} /></label>
                  <label>Locales incluidos<input type="number" min="1" value={plan.includedBranches} onChange={(event) => updatePlan(productIndex, planIndex, { includedBranches: Math.max(1, Number(event.target.value)) })} /></label>
                  <label>Sucursal extra (Bs/periodo)<input type="number" min="0" step="0.01" value={plan.extraBranchPrice} onChange={(event) => updatePlan(productIndex, planIndex, { extraBranchPrice: Number(event.target.value) })} /></label>
                  <label>Máx. sucursales extra<input type="number" min="0" max="50" value={plan.maxExtraBranches} onChange={(event) => updatePlan(productIndex, planIndex, { maxExtraBranches: Math.max(0, Number(event.target.value)) })} /></label>
                  <label>Garantía (meses)<input type="number" min="0" value={plan.warrantyMonths} onChange={(event) => updatePlan(productIndex, planIndex, { warrantyMonths: Math.max(0, Number(event.target.value)) })} /></label>
                  <label className="switch-label"><input type="checkbox" checked={plan.enabled} onChange={(event) => updatePlan(productIndex, planIndex, { enabled: event.target.checked })} /> Disponible</label>
                  <button className="danger-link" onClick={() => updateProduct(productIndex, { plans: product.plans.filter((_, index) => index !== planIndex) })}>Quitar plan</button>
                </div>
              ))}
              <button className="text-link add-plan" onClick={() => updateProduct(productIndex, { plans: [...product.plans, newPlan(product.modes[0] ?? "Unisucursal")] })}>+ Agregar plan</button>
            </article>
          ))}
        </div>
      </section>}

      {config && <section className="admin-section">
        <div className="section-heading"><div><span className="eyebrow">PAGOS Y DOCUMENTOS</span><h2>Configuración general</h2></div></div>
        <div className="settings-grid">
          <label>Nombre comercial<input value={config.settings.businessName} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, businessName: event.target.value } })} /></label>
          <label>Teléfono de contacto<input value={config.settings.contactPhone} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, contactPhone: event.target.value } })} /></label>
          <label>Correo de contacto<input value={config.settings.contactEmail} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, contactEmail: event.target.value } })} /></label>
          <label>Banco<input value={config.settings.bankName} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, bankName: event.target.value } })} /></label>
          <label>Beneficiario<input value={config.settings.beneficiary} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, beneficiary: event.target.value } })} /></label>
          <label>Número de cuenta<input value={config.settings.accountNumber} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, accountNumber: event.target.value } })} /></label>
          <div className="wide">
            <h3>QR general</h3>
            <QrImageEditor label="Subir imagen QR general (JPG o PNG, hasta 5 MB)" imageUrl={config.settings.qrImageUrl} onUploaded={(imageUrl) => setConfig({ ...config, settings: { ...config.settings, qrImageUrl: imageUrl } })} />
            <label>Fecha de vencimiento<input type="date" value={config.settings.qrImageValidUntil} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, qrImageValidUntil: event.target.value } })} /></label>
          </div>
          <label className="wide">Instrucciones de pago<textarea rows={2} value={config.settings.paymentInstructions} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, paymentInstructions: event.target.value } })} /></label>
          <label className="wide">Condiciones adicionales del contrato (se agregan como cláusula)<textarea rows={4} value={config.settings.contractTerms} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, contractTerms: event.target.value } })} /></label>
        </div>
        <div className="promotion-editor">
          <h3>QR por monto</h3>
          <p className="muted">Sube el QR y ajusta el recorte cuadrado con zoom y posición. La fecha es opcional; al vencer, ese QR deja de mostrarse. Se avisa en este panel desde 7 días antes.</p>
          {expiringQrs.length > 0 && <div className="alert qr-expiry-alert" role="status">
            <b>Revisa los QR que vencen pronto o ya vencieron:</b>
            <ul>{expiringQrs.map((item) => {
              const status = qrExpiryStatus(item.validUntil, new Date(qrClock));
              return <li key={`${item.label}-${item.validUntil}`}><b>{item.label}</b>: {status === "expired" ? `venció el ${item.validUntil}; no se mostrará a los clientes` : `vence el ${item.validUntil}`}</li>;
            })}</ul>
          </div>}
          {config.settings.qrByAmount.map((item, index) => (
            <div className="field-pair qr-row" key={index}>
              <label>Monto (Bs)<input type="number" min="0" step="0.01" value={item.amount} onChange={(event) => setConfig({ ...config, settings: { ...config.settings, qrByAmount: config.settings.qrByAmount.map((row, rowIndex) => rowIndex === index ? { ...row, amount: Number(event.target.value) } : row) } })} /></label>
              <QrImageEditor label="Subir y recortar QR (JPG o PNG)" imageUrl={item.imageUrl} onUploaded={(imageUrl) => updateQr(index, { imageUrl })} />
              <label>Vence el<input type="date" value={item.validUntil} onChange={(event) => updateQr(index, { validUntil: event.target.value })} /></label>
              <button type="button" className="danger-link" onClick={() => setConfig({ ...config, settings: { ...config.settings, qrByAmount: config.settings.qrByAmount.filter((_, rowIndex) => rowIndex !== index) } })}>Quitar</button>
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => setConfig({ ...config, settings: { ...config.settings, qrByAmount: [...config.settings.qrByAmount, { amount: 0, imageUrl: "", validUntil: "" }] } })}>+ Agregar QR por monto</button>
        </div>
        {config.promotion && <div className="promotion-editor">
          <h3>Promoción Black Friday: primer mes al 50%</h3>
          <label className="switch-label"><input type="checkbox" checked={config.promotion.active} onChange={(event) => setConfig({ ...config, promotion: config.promotion ? { ...config.promotion, active: event.target.checked } : null })} /> Activa</label>
          <div className="field-pair">
            <label>Inicio<input type="datetime-local" value={toLocalInput(config.promotion.startsAt)} onChange={(event) => event.target.value && setConfig({ ...config, promotion: config.promotion ? { ...config.promotion, startsAt: new Date(event.target.value).toISOString() } : null })} /></label>
            <label>Fin<input type="datetime-local" value={toLocalInput(config.promotion.endsAt)} onChange={(event) => event.target.value && setConfig({ ...config, promotion: config.promotion ? { ...config.promotion, endsAt: new Date(event.target.value).toISOString() } : null })} /></label>
          </div>
        </div>}
        <div className="save-row"><p className="muted">Los cambios de precios no alteran las contrataciones ya creadas.</p><button className="button" disabled={busy} onClick={saveConfig}>{busy ? "Guardando..." : "Guardar configuración"}</button></div>
      </section>}
    </main>
  );
}
