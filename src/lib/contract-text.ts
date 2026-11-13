/**
 * Texto completo del contrato. Se usa igual en la web (para que el cliente lo lea antes de firmar),
 * en el servidor (copia inmutable guardada con el contrato) y en el PDF.
 * No importa nada de servidor: es seguro usarlo en el navegador.
 */

export type ContractClause = { title: string; paragraphs: string[] };

type Billing = "monthly" | "annual" | "one_time";

export type ContractTextInput = {
  provider: { businessName: string; contactPhone: string; contactEmail?: string };
  customer: {
    name: string;
    document: string;
    businessName?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  signer: { name: string; document: string };
  product: { name: string; features: string[]; includes: string };
  plan: {
    name: string;
    mode: string;
    billing: Billing;
    price: number;
    includedBranches: number;
    extraBranchPrice: number;
    warrantyMonths: number;
    maintenanceAnnual: number;
  };
  siatOption: "with" | "without";
  duration: number;
  extraBranches: number;
  pricing: {
    originalTotal: number;
    discount: number;
    total: number;
    promotionName: string;
    periods: { label: string; amount: number }[];
  };
  promotion?: { description: string; validUntil?: string } | null;
  extraTerms?: string;
};

const money = (value: number) => `Bs ${value.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const billingText: Record<Billing, string> = {
  monthly: "suscripción mensual",
  annual: "prepago anual",
  one_time: "pago único (licencia de uso a perpetuidad)",
};

function branchesText(count: number) {
  if (count <= 1) return "1 local (unisucursal)";
  return `${count} locales (matriz + ${count - 1} sucursal${count - 1 === 1 ? "" : "es"})`;
}

export function buildContractClauses(input: ContractTextInput): ContractClause[] {
  const { provider, customer, signer, product, plan, pricing } = input;
  const includesSiat = input.siatOption === "with";
  const totalBranches = plan.includedBranches + input.extraBranches;
  const clauses: ContractClause[] = [];

  clauses.push({
    title: "PRIMERA. PARTES",
    paragraphs: [
      `EL PROVEEDOR: ${provider.businessName}, contacto ${provider.contactPhone}${provider.contactEmail ? `, ${provider.contactEmail}` : ""}.`,
      `EL CLIENTE: ${customer.name || "—"}, con documento ${customer.document || "—"}${customer.businessName ? `, propietario o representante de "${customer.businessName}"` : ""}${customer.address || customer.city ? `, con domicilio en ${[customer.address, customer.city].filter(Boolean).join(", ")}` : ""}${customer.phone ? `, teléfono ${customer.phone}` : ""}${customer.email ? `, correo ${customer.email}` : ""}.`,
      signer.name && signer.name !== customer.name
        ? `Firma en representación del CLIENTE: ${signer.name}, ${signer.document}.`
        : `Firma el CLIENTE: ${signer.name || customer.name || "—"}, ${signer.document || customer.document || "—"}.`,
    ],
  });

  clauses.push({
    title: "SEGUNDA. OBJETO",
    paragraphs: [
      `El PROVEEDOR otorga al CLIENTE el derecho de uso del sistema ${product.name}, modalidad ${plan.mode}, bajo el plan "${plan.name}" (${billingText[plan.billing]}), para ${branchesText(totalBranches)}.`,
      "El derecho de uso es personal del CLIENTE y no puede ser vendido, cedido ni compartido con terceros sin autorización escrita del PROVEEDOR. El código fuente y la propiedad intelectual del sistema pertenecen al PROVEEDOR.",
    ],
  });

  const isMulti = plan.mode.toLowerCase().includes("multi");
  const features = product.features.filter((feature) =>
    (isMulti || !/multisucursal/i.test(feature)) && (includesSiat || !/\bSIAT\b/i.test(feature)),
  );
  const scope = [
    "El sistema comprende las siguientes funciones:",
    ...features.map((feature) => `• ${feature}`),
  ];
  if (features.length === 0) scope.push("• El alcance funcional será confirmado por escrito por el PROVEEDOR antes de la instalación.");
  const includedItems = product.includes.split(",").map((item) => item.trim()).filter((item) => item && (includesSiat || !/\bSIAT\b/i.test(item)));
  if (includedItems.length > 0) scope.push(`Todos los planes incluyen: ${includedItems.join(", ")}.`);
  scope.push(includesSiat
    ? "Facturación SIAT: incluida en esta contratación."
    : "Facturación SIAT: no incluida en esta contratación; el sistema no emitirá facturas electrónicas mediante SIAT.");
  if (isMulti) {
    scope.push("El plan Multisucursal incluye además: traspasos entre sucursales, precios por sucursal, almacén central y vista de todo el negocio.");
  }
  scope.push(includesSiat
    ? "No están incluidos: computadoras, impresoras, lectores de código, conexión a internet, ni los trámites, certificados o costos propios del CLIENTE ante Impuestos Nacionales (SIN). El PROVEEDOR ayuda en la obtención de CUIS y CUFD."
    : "No están incluidos: integración ni facturación electrónica mediante SIAT, computadoras, impresoras, lectores de código, conexión a internet, ni los trámites, certificados o costos propios del CLIENTE ante Impuestos Nacionales (SIN).");
  clauses.push({ title: "TERCERA. QUÉ COMPRENDE EL SISTEMA", paragraphs: scope });

  const pay: string[] = [];
  if (plan.billing === "monthly") {
    pay.push(`Precio normal: ${money(plan.price)} por mes${totalBranches > 1 ? ` para ${branchesText(plan.includedBranches)}` : ""}. Duración contratada: ${input.duration} mes${input.duration === 1 ? "" : "es"} consecutivo${input.duration === 1 ? "" : "s"}.`);
  } else if (plan.billing === "annual") {
    pay.push(`Precio del prepago anual: ${money(plan.price)} por 12 meses de uso${totalBranches > 1 ? ` para ${branchesText(plan.includedBranches)}` : ""}.`);
  } else {
    pay.push(`Precio del pago único: ${money(plan.price)}${totalBranches > 1 ? ` para ${branchesText(plan.includedBranches)}` : ""}.`);
  }
  if (input.extraBranches > 0) {
    const per = plan.billing === "monthly" ? "por mes" : plan.billing === "annual" ? "por año" : "pago único";
    pay.push(`Sucursales adicionales: ${input.extraBranches} × ${money(plan.extraBranchPrice)} ${per}.`);
  }
  pay.push("Detalle de importes:");
  pay.push(...pricing.periods.map((period) => `• ${period.label}: ${money(period.amount)}`));
  if (pricing.discount > 0) pay.push(`Descuento por promoción "${pricing.promotionName}": ${money(pricing.discount)} (sobre ${money(pricing.originalTotal)}).`);
  pay.push(`TOTAL A PAGAR: ${money(pricing.total)}, mediante QR o transferencia a la cuenta del PROVEEDOR. El servicio se activa cuando el PROVEEDOR valida el comprobante de pago; subir el comprobante no confirma el pago por sí solo.`);
  clauses.push({ title: "CUARTA. PRECIO Y FORMA DE PAGO", paragraphs: pay });

  if (input.promotion) {
    clauses.push({
      title: "QUINTA. PROMOCIÓN",
      paragraphs: [
        input.promotion.description,
        input.promotion.validUntil ? `La promoción es válida solo para contrataciones realizadas hasta el ${input.promotion.validUntil}. Pasada esa fecha y en las renovaciones se aplica el precio normal.` : "En las renovaciones se aplica el precio normal.",
      ],
    });
  }

  const support: string[] = [];
  if (plan.billing === "one_time") {
    support.push(`Día 1: el PROVEEDOR instala el sistema, carga los productos del CLIENTE y lo capacita.`);
    if (plan.warrantyMonths > 0) support.push(`Meses 1 a ${plan.warrantyMonths}: garantía con soporte y actualizaciones gratis.`);
    support.push(plan.maintenanceAnnual > 0
      ? `Después de la garantía, el mantenimiento cuesta ${money(plan.maintenanceAnnual)} por año y se renueva cada 12 meses. Incluye ${includesSiat ? "actualizaciones del SIAT y ayuda con CUIS y CUFD, " : ""}respaldo de la información y soporte remoto.`
      : "Después de la garantía, el mantenimiento anual se cotiza por separado.");
    support.push(includesSiat
      ? "Si el CLIENTE no renueva el mantenimiento, puede seguir usando el sistema, pero sin actualizaciones (incluidas las exigidas por el SIN) ni soporte."
      : "Si el CLIENTE no renueva el mantenimiento, puede seguir usando el sistema, pero sin actualizaciones ni soporte.");
  } else {
    support.push(`El mantenimiento está incluido mientras el plan esté pagado: ${includesSiat ? "actualizaciones del SIAT, respaldo de la información, soporte remoto y ayuda con CUIS y CUFD" : "actualizaciones generales del sistema, respaldo de la información y soporte remoto"}. No se paga nada más.`);
    support.push("La instalación, la carga inicial de productos y la capacitación están incluidas.");
  }
  clauses.push({ title: `${input.promotion ? "SEXTA" : "QUINTA"}. INSTALACIÓN, GARANTÍA Y MANTENIMIENTO`, paragraphs: support });

  const n = (index: number) => ["", "PRIMERA", "SEGUNDA", "TERCERA", "CUARTA", "QUINTA", "SEXTA", "SÉPTIMA", "OCTAVA", "NOVENA", "DÉCIMA", "UNDÉCIMA", "DUODÉCIMA", "DECIMOTERCERA"][index] ?? `${index}.ª`;
  let next = clauses.length + 1;

  clauses.push({
    title: `${n(next++)}. VIGENCIA, RENOVACIÓN Y FALTA DE PAGO`,
    paragraphs: plan.billing === "one_time"
      ? ["La licencia de uso no vence. El mantenimiento es anual y opcional, según la cláusula anterior."]
      : [
          plan.billing === "monthly"
            ? `El plan rige por ${input.duration} mes${input.duration === 1 ? "" : "es"} desde la activación. Para continuar, el CLIENTE paga cada mes adicional al precio normal de ${money(plan.price)}${input.extraBranches > 0 ? ` más las sucursales adicionales` : ""}.`
            : `El plan rige por 12 meses desde la activación y se renueva pagando el prepago anual vigente.`,
          "Si el pago no se realiza en la fecha de renovación, el PROVEEDOR puede suspender el acceso hasta que se regularice. La información del CLIENTE se conserva y puede solicitar una copia de sus datos.",
          "El CLIENTE puede dejar de renovar en cualquier momento. Los periodos ya pagados no son reembolsables, salvo falla del sistema atribuible al PROVEEDOR que no sea corregida.",
        ],
  });

  clauses.push({
    title: `${n(next++)}. OBLIGACIONES DEL CLIENTE`,
    paragraphs: [
      "• Proporcionar datos verdaderos y una copia legible de su documento de identidad.",
      "• Contar con equipos y conexión a internet adecuados para facturar en línea.",
      "• Cuidar sus usuarios y contraseñas; las operaciones hechas con ellos son de su responsabilidad.",
      "• Responder por la información fiscal y comercial que registra en el sistema y por sus obligaciones ante el SIN.",
    ],
  });

  clauses.push({
    title: `${n(next++)}. OBLIGACIONES DEL PROVEEDOR`,
    paragraphs: [
      "• Entregar el sistema instalado y funcionando, y capacitar al CLIENTE.",
      "• Brindar soporte remoto y actualizaciones mientras el plan o el mantenimiento estén vigentes.",
      "• Mantener respaldos de la información y no compartirla con terceros.",
    ],
  });

  clauses.push({
    title: `${n(next++)}. DATOS Y CONFIDENCIALIDAD`,
    paragraphs: [
      "La información registrada en el sistema pertenece al CLIENTE. El PROVEEDOR solo la usa para prestar el servicio, dar soporte y hacer respaldos, y no la vende ni la comparte.",
      "La copia del documento de identidad se usa únicamente para verificar la identidad del firmante de este contrato.",
    ],
  });

  if (input.extraTerms?.trim()) {
    clauses.push({ title: `${n(next++)}. CONDICIONES ADICIONALES`, paragraphs: input.extraTerms.trim().split(/\n+/) });
  }

  clauses.push({
    title: `${n(next++)}. ACEPTACIÓN Y FIRMA`,
    paragraphs: [
      "El CLIENTE declara que leyó todo este contrato, que entiende qué comprende el sistema, su precio y sus condiciones, y que las acepta.",
      "La aceptación se registra con una firma electrónica simple: firma dibujada, documento de identidad, foto del carnet, fecha y una huella digital (SHA-256) del contenido. No equivale a una firma digital certificada por una entidad acreditada.",
    ],
  });

  return clauses;
}
