"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogos } from "@/app/brand-logos";
import { ContractsBoard, type BoardContract } from "@/app/admin/contracts-board";
import { QrImageEditor } from "@/app/admin/qr-image-editor";
import { qrExpiryStatus } from "@/lib/qr-expiry";
import { suggestQrAmounts } from "@/lib/qr-amount-suggestions";

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
  originalSlug?: string;
  slugHistory?: string[];
  name: string;
  description: string;
  features: string[];
  modes: string[];
  active: boolean;
  includes: string;
  plans: AdminPlan[];
};
type AdminDiscountCode = {
  id?: string;
  name: string;
  description: string;
  productSlugs: string[];
  billing: AdminPlan["billing"];
  discountType: "percent" | "fixed";
  amount: number;
  firstPeriods: number;
  code: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};
type AdminPromotion = {
  name: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
  productSlugs: string[];
  billing: AdminPlan["billing"];
  discountType: "percent" | "fixed";
  amount: number;
  firstPeriods: number;
};
type Config = {
  products: AdminProduct[];
  emailNotifications: { configured: boolean; recipientCount: number; missing: string[] };
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
  promotion: AdminPromotion | null;
  discountCodes: AdminDiscountCode[];
};
type AdminContract = BoardContract;

/** Convierte ISO (UTC) al formato local que espera <input type="datetime-local">. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}


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
  const [tab, setTab] = useState<"contracts" | "catalog" | "settings">("contracts");
  const [refreshing, setRefreshing] = useState(false);
  const [deletedProductSlugs, setDeletedProductSlugs] = useState<string[]>([]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No se pudo actualizar.");
    } finally {
      setRefreshing(false);
    }
  }

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
      products: configBody.products.map((product: AdminProduct) => ({
        ...product,
        originalSlug: product.slug,
        slugHistory: [product.slug],
      })),
      emailNotifications: configBody.emailNotifications,
      settings: { ...blankSettings, ...configBody.settings },
      promotion: configBody.promotion,
      discountCodes: configBody.discountCodes ?? [],
    });
    setDeletedProductSlugs([]);
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

  const qrAmountSuggestions = useMemo(
    () => config ? suggestQrAmounts(config.products, config.promotion ? [config.promotion] : [], new Date(qrClock)) : [],
    [config?.products, config?.promotion, qrClock],
  );

  function updateProduct(index: number, patch: Partial<AdminProduct>) {
    if (!config) return;
    const products = [...config.products];
    products[index] = { ...products[index], ...patch };
    setConfig({ ...config, products });
  }

  function updateProductSlug(index: number, slug: string) {
    if (!config) return;
    const product = config.products[index];
    const knownSlugs = new Set([
      ...(product.slugHistory ?? []),
      product.slug,
      product.originalSlug,
    ].filter((value): value is string => Boolean(value)));
    const products = [...config.products];
    products[index] = {
      ...product,
      slug,
      slugHistory: [...new Set([...knownSlugs, ...(slug ? [slug] : [])])],
    };
    const discountCodes = slug
      ? config.discountCodes.map((code) => ({
          ...code,
          productSlugs: [...new Set(code.productSlugs.map((item) => knownSlugs.has(item) ? slug : item))],
        }))
      : config.discountCodes;
    const promotion = slug && config.promotion
      ? {
          ...config.promotion,
          productSlugs: [...new Set(config.promotion.productSlugs.map((item) => knownSlugs.has(item) ? slug : item))],
        }
      : config.promotion;
    setConfig({ ...config, products, discountCodes, promotion });
  }

  function removeProduct(index: number) {
    if (!config) return;
    const product = config.products[index];
    const knownSlugs = new Set([
      ...(product.slugHistory ?? []),
      product.slug,
      product.originalSlug,
    ].filter((value): value is string => Boolean(value)));
    if (config.promotion?.active && config.promotion.productSlugs.some((slug) => knownSlugs.has(slug))) {
      setError("Desactiva la promoción del primer mes antes de eliminar el sistema asociado.");
      return;
    }
    if (config.discountCodes.some((code) => code.productSlugs.some((slug) => knownSlugs.has(slug)))) {
      setError("Antes de eliminar este sistema, elimina o actualiza los códigos de descuento que lo incluyen.");
      return;
    }
    if (!window.confirm(`¿Eliminar “${product.name}” del catálogo? Las contrataciones ya creadas se conservarán.`)) return;
    setError("");
    const originalSlug = product.originalSlug;
    setConfig({
      ...config,
      products: config.products.filter((_, productIndex) => productIndex !== index),
    });
    if (originalSlug) {
      setDeletedProductSlugs((slugs) => [...new Set([...slugs, originalSlug])]);
    }
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

  function addSuggestedQr(amount: number) {
    if (!config || config.settings.qrByAmount.some((item) => Math.abs(item.amount - amount) < 0.005)) return;
    setConfig({
      ...config,
      settings: {
        ...config.settings,
        qrByAmount: [...config.settings.qrByAmount, { amount, imageUrl: "", validUntil: "" }],
      },
    });
  }

  function updateDiscountCode(index: number, patch: Partial<AdminDiscountCode>) {
    if (!config) return;
    setConfig({
      ...config,
      discountCodes: config.discountCodes.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item),
    });
  }

  function addDiscountCode() {
    if (!config) return;
    const now = new Date();
    setConfig({
      ...config,
      discountCodes: [...config.discountCodes, {
        name: "Nuevo descuento",
        description: "",
        productSlugs: [],
        billing: "monthly",
        discountType: "percent",
        amount: 10,
        firstPeriods: 1,
        code: "",
        startsAt: now.toISOString(),
        endsAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
        active: false,
      }],
    });
  }

  function toggleDiscountProduct(index: number, slug: string, checked: boolean) {
    if (!config) return;
    const code = config.discountCodes[index];
    const allSlugs = config.products.map((product) => product.slug);
    const selected = code.productSlugs.length === 0 ? allSlugs : code.productSlugs;
    const next = checked ? [...selected, slug] : selected.filter((item) => item !== slug);
    const unique = [...new Set(next)];
    updateDiscountCode(index, { productSlugs: unique.length === allSlugs.length ? [] : unique });
  }

  function addProduct() {
    if (!config) return;
    let number = 1;
    while (
      config.products.some((product) => product.slug === `nuevo-sistema-${number}`)
      || deletedProductSlugs.includes(`nuevo-sistema-${number}`)
    ) number += 1;
    const slug = `nuevo-sistema-${number}`;
    setConfig({
      ...config,
      products: [...config.products, {
        slug,
        slugHistory: [slug],
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
          deletedProductSlugs,
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

  if (status === "loading") return <main className="wrap admin-page"><div className="empty">Cargando...</div></main>;
  if (!session?.user) return <main className="wrap admin-page"><div className="empty"><BrandLogos /><h1>Panel de administración InnovaSoft</h1><p>Inicia sesión con la cuenta Google autorizada como administradora.</p><button className="button" onClick={() => signIn("google")}>Entrar con Google</button></div></main>;
  if (session.user.role !== "admin") return <main className="wrap admin-page"><div className="alert error">Tu cuenta no tiene permisos de administración.</div><a className="text-link" href="/">Volver al catálogo</a></main>;

  const expiringQrs = config ? [
    ...(config.settings.qrImageUrl ? [{ label: "QR general", validUntil: config.settings.qrImageValidUntil }] : []),
    ...config.settings.qrByAmount.map((item) => ({ label: `QR de Bs ${item.amount.toLocaleString("es-BO")}`, validUntil: item.validUntil })),
  ].filter((item) => item.validUntil && qrExpiryStatus(item.validUntil, new Date(qrClock)) !== "active") : [];

  return (
    <main className="wrap admin-page">
      <header className="admin-header">
        <div><BrandLogos className="brand-logos-admin" /><span className="eyebrow"> / ADMINISTRACIÓN</span><h1>Panel de control</h1></div>
        <a className="button button-outline" href="/">Ver catálogo</a>
      </header>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success-alert">{notice}</div>}

      <nav className="admin-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "contracts"} className={tab === "contracts" ? "on" : ""} onClick={() => setTab("contracts")}>Contrataciones{contracts.filter((item) => item.paymentStatus === "pending_review").length > 0 && <em>{contracts.filter((item) => item.paymentStatus === "pending_review").length}</em>}</button>
        <button type="button" role="tab" aria-selected={tab === "catalog"} className={tab === "catalog" ? "on" : ""} onClick={() => setTab("catalog")}>Catálogo y precios</button>
        <button type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Pagos, QR y promoción{expiringQrs.length > 0 && <em className="warn">!</em>}</button>
      </nav>

      {tab === "contracts" && <ContractsBoard contracts={contracts} onRefresh={refresh} refreshing={refreshing} />}

      {tab === "catalog" && config && <section className="admin-section">
        <div className="section-heading"><div><span className="eyebrow">CATÁLOGO COMERCIAL</span><h2>Sistemas, modalidades y precios</h2></div><button className="button button-outline" onClick={addProduct}>+ Agregar sistema</button></div>
        <div className="admin-products">
          {config.products.map((product, productIndex) => (
            <article className="admin-product" key={product.originalSlug ?? product.slugHistory?.[0] ?? `${product.slug}-${productIndex}`}>
              <div className="admin-product-heading">
                <div><span className="eyebrow">{product.slug}</span><h3>{product.name}</h3></div>
                <div className="admin-product-actions">
                  <label className="switch-label"><input type="checkbox" checked={product.active} onChange={(event) => updateProduct(productIndex, { active: event.target.checked })} /> Publicado</label>
                  <button type="button" className="danger-link" onClick={() => removeProduct(productIndex)}>Eliminar sistema</button>
                </div>
              </div>
              <div className="field-pair">
                <label>Slug (identificador)<input value={product.slug} onChange={(event) => updateProductSlug(productIndex, event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label>
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
        <div className="save-row"><p className="muted">Los cambios de precios no alteran las contrataciones ya creadas.</p><button className="button" disabled={busy} onClick={saveConfig}>{busy ? "Guardando..." : "Guardar catálogo"}</button></div>
      </section>}

      {tab === "settings" && config && <section className="admin-section">
        <div className="section-heading"><div><span className="eyebrow">PAGOS Y DOCUMENTOS</span><h2>Configuración general</h2></div></div>
        <div className={`alert ${config.emailNotifications.configured ? "success-alert" : "error"}`} role="status">
          {config.emailNotifications.configured
            ? `Alertas por correo activas para ${config.emailNotifications.recipientCount} administrador(es).`
            : `Falta configurar las alertas por correo: ${config.emailNotifications.missing.join(", ")}. Completa estas variables en Render y reinicia el servicio.`}
        </div>
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
          <div className="qr-amount-suggestions" aria-live="polite">
            <h4>Montos sugeridos desde el catálogo</h4>
            <p className="muted">Se calculan con los planes publicados y las promociones generales vigentes. No incluyen sucursales extra ni códigos de descuento; esos pagos pueden tener otros montos. Al preparar un monto, aparecerá abajo para que cargues su imagen.</p>
            {qrAmountSuggestions.length > 0
              ? <div className="qr-suggestion-list">{qrAmountSuggestions.map((suggestion) => {
                  const existingQr = config.settings.qrByAmount.find((item) => Math.abs(item.amount - suggestion.amount) < 0.005);
                  const examples = suggestion.examples.slice(0, 2).join("; ");
                  const more = suggestion.examples.length > 2 ? ` y ${suggestion.examples.length - 2} más` : "";
                  return <div className="qr-suggestion-row" key={suggestion.amount}>
                    <div><strong>Bs {suggestion.amount.toLocaleString("es-BO", { maximumFractionDigits: 2 })}</strong><small>{examples}{more}</small></div>
                    <button type="button" className="button button-outline button-small" disabled={Boolean(existingQr)} onClick={() => addSuggestedQr(suggestion.amount)}>
                      {existingQr ? existingQr.imageUrl ? "QR cargado" : "Monto agregado" : "Preparar QR"}
                    </button>
                  </div>;
                })}</div>
              : <p className="muted">Publica planes con precio para ver sugerencias.</p>}
          </div>
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
        <div className="promotion-editor">
        <div className="section-heading">
          <div><h3>Códigos de descuento</h3><p className="muted">Crea códigos, define su descuento y elige los productos donde se aceptarán. Si no seleccionas productos, aplica a todos.</p></div>
          <button type="button" className="button button-outline" onClick={addDiscountCode}>+ Crear código</button>
        </div>
        {config.discountCodes.map((item, index) => {
          const allProducts = item.productSlugs.length === 0;
          return <article className="discount-code-editor" key={item.id ?? `new-${index}`}>
            <div className="admin-product-heading">
              <h4>{item.name || "Nuevo descuento"}</h4>
              <label className="switch-label"><input type="checkbox" checked={item.active} onChange={(event) => updateDiscountCode(index, { active: event.target.checked })} /> Activo</label>
            </div>
            <div className="settings-grid">
              <label>Nombre del descuento<input value={item.name} onChange={(event) => updateDiscountCode(index, { name: event.target.value })} /></label>
              <label>Código para el cliente<input value={item.code} autoCapitalize="characters" onChange={(event) => updateDiscountCode(index, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="EJEMPLO10" /></label>
              <label>Tipo de descuento<select value={item.discountType} onChange={(event) => updateDiscountCode(index, { discountType: event.target.value as AdminDiscountCode["discountType"] })}><option value="percent">Porcentaje (%)</option><option value="fixed">Monto fijo (Bs)</option></select></label>
              <label>{item.discountType === "percent" ? "Porcentaje" : "Monto (Bs)"}<input type="number" min="0.01" max={item.discountType === "percent" ? 100 : 10000000} step="0.01" value={item.amount} onChange={(event) => updateDiscountCode(index, { amount: Number(event.target.value) })} /></label>
              <label>Tipo de plan<select value={item.billing} onChange={(event) => updateDiscountCode(index, { billing: event.target.value as AdminPlan["billing"] })}><option value="monthly">Mensual</option><option value="annual">Anual</option><option value="one_time">Pago único</option></select></label>
              <label>Primeros periodos con descuento<input type="number" min="1" max="120" value={item.firstPeriods} onChange={(event) => updateDiscountCode(index, { firstPeriods: Math.max(1, Number(event.target.value)) })} /></label>
              <label className="wide">Descripción (opcional)<input value={item.description} onChange={(event) => updateDiscountCode(index, { description: event.target.value })} /></label>
              <label>Inicio<input type="datetime-local" value={toLocalInput(item.startsAt)} onChange={(event) => event.target.value && updateDiscountCode(index, { startsAt: new Date(event.target.value).toISOString() })} /></label>
              <label>Fin<input type="datetime-local" value={toLocalInput(item.endsAt)} onChange={(event) => event.target.value && updateDiscountCode(index, { endsAt: new Date(event.target.value).toISOString() })} /></label>
            </div>
            <fieldset className="discount-product-options">
              <legend>Productos aplicables</legend>
              <p className="muted">{allProducts ? "Aplica a todos. Desmarca los productos excluidos." : "Selecciona los productos donde se aceptará este código."}</p>
              <div className="discount-product-list">{config.products.map((product) => {
                const checked = allProducts || item.productSlugs.includes(product.slug);
                return <label className="switch-label" key={product.slug}><input type="checkbox" checked={checked} disabled={checked && !allProducts && item.productSlugs.length === 1} onChange={(event) => toggleDiscountProduct(index, product.slug, event.target.checked)} /> {product.name}</label>;
              })}</div>
            </fieldset>
            <button type="button" className="danger-link" onClick={() => setConfig({ ...config, discountCodes: config.discountCodes.filter((_, rowIndex) => rowIndex !== index) })}>Eliminar código</button>
          </article>;
        })}
        {config.discountCodes.length === 0 && <p className="muted">Todavía no hay códigos de descuento.</p>}
        </div>
        <div className="save-row"><p className="muted">Los cambios de precios no alteran las contrataciones ya creadas.</p><button className="button" disabled={busy} onClick={saveConfig}>{busy ? "Guardando..." : "Guardar configuración"}</button></div>
      </section>}
    </main>
  );
}
