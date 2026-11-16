"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ContractReader } from "@/app/contract-reader";
import { BrandLogos } from "@/app/brand-logos";
import { IdPhotoInput } from "@/app/id-photo-input";
import { SignaturePad } from "@/app/signature-pad";
import { buildContractClauses } from "@/lib/contract-text";
import { DOCUMENT_TYPES, ISSUED_IN_OPTIONS, formatDocument } from "@/lib/identity";

type AppInfo = { localPreview: boolean; googleLogin: boolean; devLogin: boolean };

type Plan = {
  id: string;
  name: string;
  mode: string;
  billing: "monthly" | "annual" | "one_time";
  price: number;
  durationOptions: number[];
  maintenanceAnnual: number;
  description: string;
  badge: string;
  compareAtPrice: number;
  includedBranches: number;
  extraBranchPrice: number;
  maxExtraBranches: number;
  warrantyMonths: number;
  promotion: { name: string; description: string; discountType: "percent" | "fixed"; amount: number; firstPeriods: number; validUntil: string } | null;
};
type Product = {
  slug: string;
  name: string;
  description: string;
  features: string[];
  modes: string[];
  includes: string;
  plans: Plan[];
};
type Quote = {
  product: string;
  mode: string;
  plan: string;
  billing: Plan["billing"];
  duration: number;
  unitPrice: number;
  originalTotal: number;
  discount: number;
  total: number;
  periods: { label: string; amount: number }[];
  maintenanceAnnual: number;
  promotionName: string;
  extraBranches: number;
  extraBranchesTotal: number;
};
type PaymentSettings = {
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  bankName: string;
  beneficiary: string;
  accountNumber: string;
  qrImageUrl: string;
  paymentInstructions: string;
  contractTerms: string;
};
type CreatedContract = { id: string; code: string; status: string; total: number; emailNotificationSent?: boolean; payment: { amount: number; qrImageUrl: string; exactAmountQr: boolean; qrExpired: boolean } };

const money = (amount: number) => `Bs ${amount.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;

/** Primer importe con promoción (por ejemplo Bs 125 el 1.er mes). */
function promoPrice(plan: Plan) {
  if (!plan.promotion) return null;
  const discount = plan.promotion.discountType === "percent" ? plan.price * (plan.promotion.amount / 100) : plan.promotion.amount;
  return Math.max(0, Math.round((plan.price - discount) * 100) / 100);
}
function promoBadge(plan: Plan) {
  if (!plan.promotion) return "";
  const amount = plan.promotion.discountType === "percent" ? `${plan.promotion.amount}%` : money(plan.promotion.amount);
  return plan.promotion.firstPeriods === 1 ? `${amount} el primer mes` : `${amount} los primeros ${plan.promotion.firstPeriods} meses`;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [mode, setMode] = useState("");
  const [planId, setPlanId] = useState("");
  const [duration, setDuration] = useState(1);
  const [extraBranches, setExtraBranches] = useState(0);
  const [siatOption, setSiatOption] = useState<"with" | "without">("with");
  const [identityFront, setIdentityFront] = useState("");
  const [identityBack, setIdentityBack] = useState("");
  const [contractRead, setContractRead] = useState(false);
  const [promotionCode, setPromotionCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState<CreatedContract | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [appInfo, setAppInfo] = useState<AppInfo>({ localPreview: false, googleLogin: true, devLogin: false });
  const localPreview = appInfo.localPreview;
  const [signatureImage, setSignatureImage] = useState("");
  const [signerSameAsCustomer, setSignerSameAsCustomer] = useState(true);
  const [signer, setSigner] = useState({ name: "", type: "CI", number: "", complement: "", issuedIn: "" });
  const [customer, setCustomer] = useState({
    name: "",
    documentType: "CI",
    documentNumber: "",
    documentComplement: "",
    documentIssuedIn: "",
    phone: "",
    email: "",
    businessName: "",
    address: "",
    city: "",
  });

  useEffect(() => {
    fetch("/api/app-info").then((response) => response.json() as Promise<AppInfo>).then(setAppInfo).catch(() => undefined);
    Promise.all([
      fetch("/api/catalog").then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo. Verifica MongoDB y vuelve a intentar.");
        return response.json() as Promise<Product[]>;
      }),
      fetch("/api/payment-settings").then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la configuración de pagos.");
        return response.json() as Promise<PaymentSettings>;
      }),
    ]).then(([catalog, paymentSettings]) => {
      setProducts(catalog);
      setSettings(paymentSettings);
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : "Ocurrió un error cargando la plataforma.");
    });
  }, []);

  useEffect(() => {
    if (session?.user) {
      setCustomer((previous) => ({
        ...previous,
        name: previous.name || session.user?.name || "",
        email: previous.email || session.user?.email || "",
      }));
    }
  }, [session]);

  // Un NIT identifica a la empresa, no a una persona: en ese caso firma un representante con su propio documento.
  const signerIsCustomer = signerSameAsCustomer && customer.documentType !== "NIT";
  const effectiveSigner = signerIsCustomer
    ? {
        name: customer.name,
        type: customer.documentType,
        number: customer.documentNumber,
        complement: customer.documentComplement,
        issuedIn: customer.documentIssuedIn,
      }
    : signer;

  async function login() {
    if (appInfo.googleLogin) {
      await signIn("google");
      return;
    }
    if (appInfo.devLogin) {
      const email = window.prompt("Acceso de prueba local. Escribe un correo (los de ADMIN_EMAILS entran como administrador):");
      if (email) await signIn("dev-login", { email, callbackUrl: window.location.href });
      return;
    }
    setFormError("No hay un método de inicio de sesión configurado. Revisa GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");
  }

  const selectedProduct = products.find((product) => product.slug === selectedSlug);
  const productPlans = useMemo(
    () => selectedProduct?.plans.filter((plan) => plan.mode === mode) ?? [],
    [selectedProduct, mode],
  );
  const selectedPlan = productPlans.find((plan) => plan.id === planId);

  useEffect(() => {
    if (!selectedProduct || !selectedPlan) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ productSlug: selectedProduct.slug, planId, mode, duration, extraBranches, promotionCode }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo calcular el precio.");
      setQuote(body as Quote);
      setQuoteError("");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : "No se pudo calcular el precio.");
    });
    return () => controller.abort();
  }, [selectedProduct, selectedPlan, planId, mode, duration, extraBranches, promotionCode]);

  const customerDocument = customer.documentNumber
    ? formatDocument({ type: customer.documentType, number: customer.documentNumber, complement: customer.documentComplement, issuedIn: customer.documentType === "CI" ? customer.documentIssuedIn : "" })
    : "";
  const signerDocumentText = effectiveSigner.number
    ? formatDocument({ type: effectiveSigner.type, number: effectiveSigner.number, complement: effectiveSigner.complement, issuedIn: effectiveSigner.type === "CI" ? effectiveSigner.issuedIn : "" })
    : "";
  const clauses = useMemo(() => {
    if (!selectedProduct || !selectedPlan || !quote) return [];
    return buildContractClauses({
      provider: { businessName: settings?.businessName ?? "CHAVIX", contactPhone: settings?.contactPhone ?? "", contactEmail: settings?.contactEmail ?? "" },
      customer: { name: customer.name, document: customerDocument, businessName: customer.businessName, address: customer.address, city: customer.city, phone: customer.phone, email: customer.email },
      signer: { name: effectiveSigner.name, document: signerDocumentText },
      product: { name: selectedProduct.name, features: selectedProduct.features, includes: selectedProduct.includes },
      plan: { ...selectedPlan },
      siatOption,
      duration,
      extraBranches,
      pricing: quote,
      promotion: selectedPlan.promotion && quote.discount > 0 ? { description: selectedPlan.promotion.description || selectedPlan.promotion.name, validUntil: selectedPlan.promotion.validUntil } : null,
      extraTerms: settings?.contractTerms ?? "",
    });
  }, [selectedProduct, selectedPlan, quote, settings, customer, customerDocument, effectiveSigner.name, signerDocumentText, siatOption, duration, extraBranches]);
  // Si cambia el plan o el precio, el contrato cambia: hay que leerlo de nuevo.
  const contractKey = `${selectedProduct?.slug}|${planId}|${duration}|${extraBranches}|${siatOption}|${quote?.total ?? ""}`;

  // Al elegir un sistema, la sección de planes aparece más abajo: la llevamos a la vista.
  const [scrollRequest, setScrollRequest] = useState(0);
  useEffect(() => {
    if (!scrollRequest) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("contratar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollRequest]);

  function chooseProduct(product: Product) {
    setScrollRequest((value) => value + 1);
    setSelectedSlug(product.slug);
    const nextMode = product.modes[0] ?? "";
    setMode(nextMode);
    const plan = product.plans.find((item) => item.mode === nextMode);
    setPlanId(plan?.id ?? "");
    setDuration(plan?.durationOptions[0] ?? 1);
    setExtraBranches(0);
    setContract(null);
    setFormError("");
  }

  function chooseMode(nextMode: string) {
    setMode(nextMode);
    const plan = selectedProduct?.plans.find((item) => item.mode === nextMode);
    setPlanId(plan?.id ?? "");
    setDuration(plan?.durationOptions[0] ?? 1);
    setExtraBranches(0);
    setContract(null);
  }

  function choosePlan(nextId: string) {
    const plan = productPlans.find((item) => item.id === nextId);
    setPlanId(nextId);
    setDuration(plan?.durationOptions[0] ?? 1);
    setExtraBranches(0);
  }

  async function submitContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (localPreview) {
      setFormError("Vista previa local: para crear contratos configura MongoDB y Google OAuth. Aquí puedes evaluar el catálogo y las cotizaciones.");
      return;
    }
    if (!session?.user?.email) {
      await login();
      return;
    }
    if (!selectedProduct || !selectedPlan || !quote) {
      setFormError("Selecciona el sistema y plan para continuar.");
      return;
    }
    if (!identityFront || !identityBack) {
      setFormError("Sube las fotos del anverso y reverso de tu carnet.");
      return;
    }
    if (!contractRead) {
      setFormError("Debes leer el contrato completo hasta el final antes de aceptarlo.");
      return;
    }
    if (!signatureImage) {
      setFormError("Dibuja tu firma en el recuadro antes de continuar.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: selectedProduct.slug,
          planId,
          mode,
          duration,
          extraBranches,
          siatOption,
          promotionCode,
          customer,
          signerName: effectiveSigner.name,
          signerDocument: {
            type: effectiveSigner.type,
            number: effectiveSigner.number,
            complement: effectiveSigner.complement,
            issuedIn: effectiveSigner.type === "CI" ? effectiveSigner.issuedIn : "",
          },
          signatureImage,
          identityPhotos: { front: identityFront, back: identityBack },
          readFullContract: contractRead,
          acceptedTerms: form.get("acceptedTerms") === "on",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear la contratación.");
      setContract(body as CreatedContract);
      requestAnimationFrame(() => document.getElementById("pago")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Ocurrió un error. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contract) return;
    setBusy(true);
    setReceiptMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/contracts/${contract.id}/receipt`, { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el comprobante.");
      setReceiptMessage(body.emailNotificationSent === false
        ? "Comprobante recibido y pendiente de revisión, pero no se pudo enviar la alerta por correo al equipo."
        : "Comprobante recibido. El pago está pendiente de revisión manual.");
    } catch (error) {
      setReceiptMessage(error instanceof Error ? error.message : "Ocurrió un error al cargar el comprobante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="topbar wrap">
        <BrandLogos />
        <nav><a href="#sistemas">Sistemas</a><a href="#como-funciona">Cómo funciona</a></nav>
        {localPreview ? <span className="preview-pill">Vista previa local</span> : status === "loading" ? <span className="muted">Cargando...</span> : session?.user ? (
          <div className="account">
            {session.user.role === "admin" && <a className="text-link" href="/admin">Administración</a>}
            <span className="muted">{session.user.name}</span>
            <button className="button button-outline button-small" onClick={() => signOut()}>Salir</button>
          </div>
        ) : <button className="button button-outline button-small" onClick={login}>{appInfo.googleLogin ? "Entrar con Google" : appInfo.devLogin ? "Entrar (prueba local)" : "Entrar"}</button>}
      </header>

      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">SOLUCIONES PARA TU NEGOCIO</span>
          <h1>Tu negocio,<br /><span>en un solo lugar.</span></h1>
          <p>Conoce los sistemas CHAVIX, elige cómo trabajar y solicita tu contratación en línea.</p>
          <a className="button" href="#sistemas">Ver sistemas <span aria-hidden>↓</span></a>
          <div className="hero-note"><span className="dot" /> Atención personalizada · Bolivia</div>
        </div>
        <div className="hero-card">
          <div className="hero-card-label">CHAVIX / CONTROL</div>
          <div className="mock-row"><span>VENTAS DE HOY</span><strong>Bs 3.850</strong></div>
          <div className="mock-bars"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="mock-footer"><span>Inventario</span><b>● En orden</b></div>
        </div>
      </section>

      {localPreview && <div className="wrap"><div className="preview-banner"><b>Modo de evaluación local</b><span>Catálogo y precios de muestra; no se envían contratos ni pagos reales.</span></div></div>}

      <section className="section wrap" id="sistemas">
        <div className="section-heading">
          <div><span className="eyebrow">CATÁLOGO</span><h2>Sistemas para crecer</h2></div>
          <p>Selecciona un sistema para ver modalidades y precios.</p>
        </div>
        {loadError && <div className="alert error">{loadError}</div>}
        {!loadError && products.length === 0 && <div className="empty">No hay sistemas publicados por el momento.</div>}
        <div className="product-grid">
          {products.map((product, index) => (
            <article className={`product-card ${selectedSlug === product.slug ? "selected" : ""}`} key={product.slug}>
              <div className="product-card-top"><span className={`product-icon icon-${index % 2}`}>{index === 0 ? "▦" : "↗"}</span><span className="product-tag">CHAVIX</span></div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <ul>{product.features.slice(0, 4).map((feature) => <li key={feature}><span>✓</span>{feature.split(":")[0]}</li>)}</ul>
              <button className={`button full ${selectedSlug === product.slug ? "" : "button-dark"}`} onClick={() => chooseProduct(product)}>{selectedSlug === product.slug ? <>Ver planes elegidos <span aria-hidden>↓</span></> : <>Ver planes <span aria-hidden>→</span></>}</button>
            </article>
          ))}
        </div>
      </section>

      {selectedProduct && (
        <section className="section wrap" id="contratar">
          <div className="section-heading">
            <div><span className="eyebrow">CONFIGURA TU CONTRATACIÓN</span><h2>{selectedProduct.name}</h2></div>
            <button className="text-link" onClick={() => { setSelectedSlug(""); document.getElementById("sistemas")?.scrollIntoView({ behavior: "smooth" }); }}>Cambiar sistema ×</button>
          </div>
          <div className="checkout-grid">
            <div className="checkout-panel">
              <div className="step-title"><span>1</span><div><h3>Elige tu modalidad y plan</h3><p>Los precios se verifican en el servidor.</p></div></div>
              <label>Modalidad<select value={mode} onChange={(event) => chooseMode(event.target.value)}>{selectedProduct.modes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <div className="plan-options">
                {productPlans.map((plan) => {
                  const firstPrice = promoPrice(plan);
                  const badge = plan.badge || promoBadge(plan);
                  return (
                    <button type="button" key={plan.id} className={`plan-option ${planId === plan.id ? "active" : ""}`} onClick={() => choosePlan(plan.id)}>
                      {badge && <span className="plan-badge">{badge}</span>}
                      <span className="plan-copy"><b>{plan.name}</b><small>{plan.description || (plan.billing === "monthly" ? "Suscripción mensual" : plan.billing === "annual" ? "Prepago anual" : "Compra en pago único")}</small>
                        {plan.billing === "monthly" && firstPrice !== null && <small>Desde el 2.º mes: {money(plan.price)}/mes</small>}
                        {plan.billing === "one_time" && plan.maintenanceAnnual > 0 && <small>Mantenimiento: {money(plan.maintenanceAnnual)} al año</small>}
                        {plan.extraBranchPrice > 0 && <small>Sucursal adicional: {money(plan.extraBranchPrice)}{plan.billing === "monthly" ? "/mes" : plan.billing === "annual" ? "/año" : ""}</small>}
                      </span>
                      <span className="plan-price">
                        {(firstPrice !== null || plan.compareAtPrice > plan.price) && <s>{money(firstPrice !== null ? plan.price : plan.compareAtPrice)}</s>}
                        <strong>{money(firstPrice ?? plan.price)}<small>{firstPrice !== null ? " 1.er mes" : plan.billing === "monthly" ? "/mes" : plan.billing === "annual" ? "/año" : ""}</small></strong>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPlan && selectedPlan.durationOptions.length > 1 && <label>¿Cuántos meses?<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{selectedPlan.durationOptions.map((item) => <option key={item} value={item}>{item} {item === 1 ? "mes" : "meses"}</option>)}</select></label>}
              {selectedPlan && selectedPlan.maxExtraBranches > 0 && <label>Sucursales adicionales (incluye {selectedPlan.includedBranches === 2 ? "matriz + 1 sucursal" : `${selectedPlan.includedBranches} locales`})<select value={extraBranches} onChange={(event) => setExtraBranches(Number(event.target.value))}>{Array.from({ length: selectedPlan.maxExtraBranches + 1 }, (_, item) => <option key={item} value={item}>{item === 0 ? "Ninguna" : `${item} × ${money(selectedPlan.extraBranchPrice)}${selectedPlan.billing === "monthly" ? "/mes" : selectedPlan.billing === "annual" ? "/año" : ""}`}</option>)}</select></label>}
              {selectedPlan?.promotion && selectedPlan.billing === "monthly" && <div className="promo-note">🎉 <b>{promoBadge(selectedPlan)}</b>. Válido hasta el {selectedPlan.promotion.validUntil}. Desde el 2.º mes pagas el precio normal.</div>}
              <label>Código promocional (opcional)<input value={promotionCode} onChange={(event) => setPromotionCode(event.target.value)} placeholder="Escribe tu código" /></label>
              {quoteError && <div className="alert error">{quoteError}</div>}
              {quote && <div className="quote-box">
                <h3>Resumen de precios</h3>
                <div className="quote-row"><span>{quote.plan} · {quote.mode}{quote.extraBranches > 0 ? ` + ${quote.extraBranches} sucursal(es)` : ""}</span><span>{money(quote.originalTotal)}</span></div>
                {quote.promotionName && <div className="quote-row saving"><span>{quote.promotionName}</span><span>−{money(quote.discount)}</span></div>}
                <div className="period-list">{quote.periods.map((period) => <div className="quote-row" key={period.label}><span>{period.label}</span><span>{money(period.amount)}</span></div>)}</div>
                <div className="quote-total"><span>Total</span><strong>{money(quote.total)}</strong></div>
                {quote.maintenanceAnnual > 0 && <small className="muted">Mantenimiento posterior: {money(quote.maintenanceAnnual)} al año.</small>}
              </div>}
            </div>

            <div className="checkout-panel">
              <div className="step-title"><span>2</span><div><h3>Datos y aceptación</h3><p>Inicia sesión para guardar tu contrato.</p></div></div>
              {!localPreview && !session?.user && <button type="button" className="button google-button full" onClick={login}>{appInfo.googleLogin ? "G Continuar con Google" : "Continuar (acceso de prueba local)"}</button>}
              <form className="customer-form" onSubmit={submitContract}>
                <fieldset className="signature-section siat-section">
                  <legend>Facturación SIAT</legend>
                  <p className="muted">Elige si tu contratación incluye facturación electrónica integrada con SIAT. Esta elección no cambia el precio.</p>
                  <label><input type="radio" name="siatOption" value="with" checked={siatOption === "with"} onChange={() => setSiatOption("with")} /> Con SIAT</label>
                  <label><input type="radio" name="siatOption" value="without" checked={siatOption === "without"} onChange={() => setSiatOption("without")} /> Sin SIAT</label>
                </fieldset>
                <div className="field-pair">
                  <label>Nombre completo<input required minLength={2} maxLength={120} value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
                  <label>Tipo de documento<select value={customer.documentType} onChange={(event) => setCustomer({ ...customer, documentType: event.target.value, documentIssuedIn: event.target.value === "CI" ? customer.documentIssuedIn : "", documentComplement: event.target.value === "CI" ? customer.documentComplement : "" })}>{DOCUMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
                </div>
                <div className={customer.documentType === "CI" ? "field-trio" : ""}>
                  <label>Número de documento<input required minLength={3} maxLength={40} pattern="[0-9A-Za-z\-]+" title="Solo números, letras y guion" value={customer.documentNumber} onChange={(event) => setCustomer({ ...customer, documentNumber: event.target.value })} /></label>
                  {customer.documentType === "CI" && <label>Complemento<input maxLength={5} placeholder="Opcional" value={customer.documentComplement} onChange={(event) => setCustomer({ ...customer, documentComplement: event.target.value })} /></label>}
                  {customer.documentType === "CI" && <label>Expedido en<select required value={customer.documentIssuedIn} onChange={(event) => setCustomer({ ...customer, documentIssuedIn: event.target.value })}><option value="">Selecciona</option>{ISSUED_IN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}</select></label>}
                </div>
                <label>Teléfono<input required type="tel" minLength={6} maxLength={30} value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
                <label>Correo electrónico<input required type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
                <label>Nombre comercial (opcional)<input value={customer.businessName} onChange={(event) => setCustomer({ ...customer, businessName: event.target.value })} /></label>
                <div className="field-pair">
                  <label>Dirección (opcional)<input value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>
                  <label>Ciudad (opcional)<input value={customer.city} onChange={(event) => setCustomer({ ...customer, city: event.target.value })} /></label>
                </div>
                <fieldset className="signature-section">
                  <legend>Foto de tu carnet</legend>
                  <p className="muted">Sube una foto clara del carnet de quien firma, por ambos lados. Solo CHAVIX puede verla.</p>
                  <div className="id-photos">
                    <IdPhotoInput label="Anverso (frente)" value={identityFront} onChange={setIdentityFront} disabled={busy} />
                    <IdPhotoInput label="Reverso (atrás)" value={identityBack} onChange={setIdentityBack} disabled={busy} />
                  </div>
                </fieldset>
                {clauses.length > 0 && <ContractReader clauses={clauses} contentKey={contractKey} onReadChange={setContractRead} />}
                <fieldset className="signature-section">
                  <legend>Firma y documento de identidad</legend>
                  {customer.documentType === "NIT" ? <p className="muted">Con NIT, indica el documento de identidad de la persona que firma en representación de la empresa.</p> : <label className="accept-check"><input type="checkbox" checked={signerSameAsCustomer} onChange={(event) => {
                    setSignerSameAsCustomer(event.target.checked);
                    if (!event.target.checked) setSigner({ name: "", type: "CI", number: "", complement: "", issuedIn: "" });
                  }} /><span>Firma el mismo titular del documento indicado arriba.</span></label>}
                  {!signerIsCustomer && <>
                    <label>Nombre de quien firma (representante)<input required minLength={2} maxLength={120} value={signer.name} onChange={(event) => setSigner({ ...signer, name: event.target.value })} /></label>
                    <div className="field-pair">
                      <label>Documento del firmante<select value={signer.type} onChange={(event) => setSigner({ ...signer, type: event.target.value, issuedIn: event.target.value === "CI" ? signer.issuedIn : "", complement: event.target.value === "CI" ? signer.complement : "" })}>{DOCUMENT_TYPES.filter((item) => item !== "NIT").map((item) => <option key={item}>{item}</option>)}</select></label>
                      <label>Número<input required minLength={3} maxLength={40} pattern="[0-9A-Za-z\-]+" value={signer.number} onChange={(event) => setSigner({ ...signer, number: event.target.value })} /></label>
                    </div>
                    {signer.type === "CI" && <div className="field-pair">
                      <label>Complemento<input maxLength={5} placeholder="Opcional" value={signer.complement} onChange={(event) => setSigner({ ...signer, complement: event.target.value })} /></label>
                      <label>Expedido en<select required value={signer.issuedIn} onChange={(event) => setSigner({ ...signer, issuedIn: event.target.value })}><option value="">Selecciona</option>{ISSUED_IN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.label}</option>)}</select></label>
                    </div>}
                  </>}
                  <SignaturePad onChange={setSignatureImage} disabled={busy} />
                  <div className="signer-card">
                    <b>{effectiveSigner.name || "Nombre del firmante"}</b>
                    <span>{effectiveSigner.number ? formatDocument({ type: effectiveSigner.type, number: effectiveSigner.number, complement: effectiveSigner.complement, issuedIn: effectiveSigner.type === "CI" ? effectiveSigner.issuedIn : "" }) : "Documento de identidad"}</span>
                  </div>
                  <label className={`accept-check ${contractRead ? "" : "locked"}`}><input name="acceptedTerms" type="checkbox" required disabled={!contractRead} /><span>{contractRead ? "Leí todo el contrato y acepto sus condiciones. Mi firma dibujada, mi documento y la foto de mi carnet registran una firma electrónica simple, no una firma digital certificada." : "🔒 Primero lee el contrato completo hasta el final para poder aceptarlo."}</span></label>
                </fieldset>
                {formError && <div className="alert error">{formError}</div>}
                <button className="button full" disabled={busy || !quote || (Boolean(session?.user) && !contractRead)}>{busy ? "Procesando..." : localPreview ? "Vista previa: contratación desactivada" : session?.user ? "Crear contratación" : "Inicia sesión para continuar"}</button>
              </form>
            </div>
          </div>
        </section>
      )}

      {contract && (
        <section className="section wrap" id="pago">
          <div className="success-panel">
            <span className="success-mark">✓</span><div>
              <span className="eyebrow">CONTRATACIÓN CREADA</span><h2>{contract.code}</h2>
              <p>Tu solicitud y aceptación quedaron registradas. El pago aún no está confirmado.</p>
              {contract.emailNotificationSent === false && <div className="alert error">La contratación quedó registrada, pero no se pudo enviar la alerta por correo al equipo. Contacta a CHAVIX para confirmar.</div>}
              <a className="button button-outline no-print" href={`/api/contracts/${contract.id}/pdf`}>Descargar contrato PDF</a>
              <div className="payment-details">
                <h3>Pago mediante QR</h3>
                <p className="pay-amount">Monto a pagar: <b>{money(contract.payment.amount)}</b></p>
                {contract.payment.qrImageUrl
                  ? <><img className="payment-qr" src={contract.payment.qrImageUrl} alt={`Código QR de pago por ${money(contract.payment.amount)}`} />
                    {!contract.payment.exactAmountQr && <p className="alert">Este QR no tiene el monto cargado: escribe <b>{money(contract.payment.amount)}</b> al pagar.</p>}</>
                  : <p className="alert">{contract.payment.qrExpired ? "Este QR venció y ya no está disponible. " : `El QR para ${money(contract.payment.amount)} aún no está disponible. `}Paga por transferencia o escríbenos al {settings?.contactPhone}.</p>}
                <p><b>Beneficiario:</b> {settings?.beneficiary || "Pendiente de configurar"}</p>
                <p><b>Banco:</b> {settings?.bankName || "Pendiente de configurar"}</p>
                <p><b>Cuenta:</b> {settings?.accountNumber || "Pendiente de configurar"}</p>
                <p>{settings?.paymentInstructions}</p>
                <form className="receipt-form no-print" onSubmit={uploadReceipt}>
                  <label>Adjunta comprobante (PDF, JPG o PNG; máximo 5 MB)<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required /></label>
                  <button className="button button-dark" disabled={busy}>{busy ? "Cargando..." : "Enviar comprobante"}</button>
                </form>
                {receiptMessage && <div className="alert">{receiptMessage}</div>}
                <small className="muted">La carga del comprobante no confirma el pago. CHAVIX debe revisarlo.</small>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bottom-cta wrap" id="como-funciona">
        <div><span className="eyebrow">FÁCIL Y TRANSPARENTE</span><h2>Empieza a trabajar con CHAVIX.</h2><p>Elige tu sistema, revisa el precio y envía tu solicitud desde cualquier dispositivo.</p></div>
        <a className="button button-light" href="#sistemas">Explorar sistemas →</a>
      </section>
      <footer className="footer wrap"><BrandLogos /><span>© {new Date().getFullYear()} InnovaSoft · Sistemas CHAVIX · Bolivia</span><a href={`tel:${settings?.contactPhone ?? ""}`}>{settings?.contactPhone ? `Contáctanos: ${settings.contactPhone}` : "Contáctanos"}</a></footer>
    </main>
  );
}
