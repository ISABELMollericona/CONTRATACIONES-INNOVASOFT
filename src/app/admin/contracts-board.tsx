"use client";

import { useEffect, useMemo, useState } from "react";
import { money, paymentLabels, statusLabels, statusTone, timeAgo, whatsappLink } from "@/app/admin/labels";

export type BoardContract = {
  id: string;
  code: string;
  productName: string;
  planName: string;
  mode: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerDocument?: string;
  businessName?: string;
  city?: string;
  duration?: number;
  billing?: string;
  extraBranches?: number;
  signerName: string;
  signerDocument: string;
  hasSignature: boolean;
  hasIdentityPhotos: boolean;
  receiptUploadedAt?: string | null;
  siatOption?: "" | "with" | "without";
};

const FILTERS = [
  { key: "review", label: "Por revisar", test: (item: BoardContract) => item.paymentStatus === "pending_review" },
  { key: "waiting", label: "Esperando pago", test: (item: BoardContract) => item.status === "pending_payment" },
  { key: "active", label: "Activos", test: (item: BoardContract) => item.status === "active" },
  { key: "all", label: "Todos", test: () => true },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function ContractsBoard({ contracts, onRefresh, refreshing }: { contracts: BoardContract[]; onRefresh: () => void; refreshing: boolean }) {
  const [filter, setFilter] = useState<FilterKey>("review");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Si no hay nada por revisar, mostrar todos para no abrir en una lista vacía.
  useEffect(() => {
    if (filter === "review" && contracts.length > 0 && !contracts.some(FILTERS[0].test)) setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts.length]);

  const stats = useMemo(() => {
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const active = contracts.filter((item) => item.status === "active");
    return {
      review: contracts.filter((item) => item.paymentStatus === "pending_review"),
      waiting: contracts.filter((item) => item.status === "pending_payment"),
      active,
      revenue: active.reduce((sum, item) => sum + item.total, 0),
      thisMonth: contracts.filter((item) => new Date(item.createdAt) >= monthStart).length,
    };
  }, [contracts, now]);

  const visible = useMemo(() => {
    const test = FILTERS.find((item) => item.key === filter)?.test ?? (() => true);
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return contracts.filter(test).filter((item) => {
      if (terms.length === 0) return true;
      const haystack = normalize([item.code, item.customerName, item.customerPhone, item.customerEmail, item.customerDocument, item.businessName, item.city, item.signerName, item.signerDocument, item.productName, item.planName].filter(Boolean).join(" "));
      return terms.every((term) => haystack.includes(term));
    }).sort((a, b) => {
      // Lo urgente primero: comprobantes por revisar, del más antiguo al más nuevo.
      const urgentA = a.paymentStatus === "pending_review" ? 0 : 1;
      const urgentB = b.paymentStatus === "pending_review" ? 0 : 1;
      if (urgentA !== urgentB) return urgentA - urgentB;
      if (urgentA === 0) return new Date(a.receiptUploadedAt ?? a.createdAt).getTime() - new Date(b.receiptUploadedAt ?? b.createdAt).getTime();
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [contracts, filter, query]);

  return (
    <section className="admin-section">
      <div className="stat-grid">
        <button type="button" className={`stat-card warn ${filter === "review" ? "on" : ""}`} onClick={() => setFilter("review")}>
          <span>Comprobantes por revisar</span><strong>{stats.review.length}</strong><small>{stats.review.length ? "Requieren tu revisión" : "Todo al día"}</small>
        </button>
        <button type="button" className={`stat-card ${filter === "waiting" ? "on" : ""}`} onClick={() => setFilter("waiting")}>
          <span>Esperando pago</span><strong>{stats.waiting.length}</strong><small>{money(stats.waiting.reduce((sum, item) => sum + item.total, 0))} por cobrar</small>
        </button>
        <button type="button" className={`stat-card ok ${filter === "active" ? "on" : ""}`} onClick={() => setFilter("active")}>
          <span>Contratos activos</span><strong>{stats.active.length}</strong><small>{money(stats.revenue)} cobrados</small>
        </button>
        <button type="button" className={`stat-card ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
          <span>Este mes</span><strong>{stats.thisMonth}</strong><small>{contracts.length} en total</small>
        </button>
      </div>

      <div className="board-toolbar">
        <div className="filter-tabs" role="tablist">
          {FILTERS.map((item) => (
            <button type="button" role="tab" aria-selected={filter === item.key} key={item.key} className={filter === item.key ? "on" : ""} onClick={() => setFilter(item.key)}>
              {item.label} <em>{contracts.filter(item.test).length}</em>
            </button>
          ))}
        </div>
        <input className="board-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, nombre, CI, teléfono, negocio…" />
        <button type="button" className="button button-outline button-small" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Actualizando…" : "↻ Actualizar"}</button>
      </div>

      <div className="contract-cards">
        {visible.map((item) => {
          const tone = statusTone(item.paymentStatus, item.status);
          const firstName = item.customerName.split(" ")[0];
          return (
            <article key={item.id} className={`contract-card tone-${tone}`}>
              <a className="contract-card-main" href={`/admin/contracts/${item.id}`}>
                <div className="cc-top">
                  <span className={`pill pill-${tone}`}>{statusLabels[item.status] ?? item.status}</span>
                  <span className="pill">{paymentLabels[item.paymentStatus] ?? item.paymentStatus}</span>
                  <small>{timeAgo(item.paymentStatus === "pending_review" ? item.receiptUploadedAt ?? item.createdAt : item.createdAt, now)}</small>
                </div>
                <h3>{item.customerName}</h3>
                <p className="cc-sub">{item.businessName ? `${item.businessName} · ` : ""}{item.city || ""}{item.city ? " · " : ""}{item.customerDocument || item.signerDocument}</p>
                <div className="cc-plan">
                  <span>{item.productName}<br /><small>{item.mode} · {item.planName}{item.billing === "monthly" && item.duration ? ` · ${item.duration} mes${item.duration === 1 ? "" : "es"}` : ""}{item.extraBranches ? ` · +${item.extraBranches} suc.` : ""}{item.siatOption ? ` · ${item.siatOption === "with" ? "con" : "sin"} SIAT` : ""}</small></span>
                  <strong>{money(item.total)}</strong>
                </div>
                <div className="cc-checks">
                  <span className={item.hasSignature ? "yes" : "no"}>{item.hasSignature ? "✓" : "✕"} Firma</span>
                  <span className={item.hasIdentityPhotos ? "yes" : "no"}>{item.hasIdentityPhotos ? "✓" : "✕"} Carnet</span>
                  <span className={item.receiptUploadedAt ? "yes" : "no"}>{item.receiptUploadedAt ? "✓" : "…"} Comprobante</span>
                  <span className="code">{item.code}</span>
                </div>
              </a>
              <div className="cc-actions">
                <a className="button button-small" href={`/admin/contracts/${item.id}`}>{item.paymentStatus === "pending_review" ? "Revisar pago" : "Ver detalle"}</a>
                <a className="button button-outline button-small" href={whatsappLink(item.customerPhone, `Hola ${firstName}, te escribimos de CHAVIX sobre tu contratación ${item.code}.`)} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="button button-outline button-small" href={`/api/contracts/${item.id}/pdf`}>PDF</a>
              </div>
            </article>
          );
        })}
        {visible.length === 0 && <div className="empty">{contracts.length === 0 ? "No hay contrataciones todavía." : query ? "Ninguna contratación coincide con la búsqueda." : `No hay contrataciones en “${FILTERS.find((item) => item.key === filter)?.label}”.`}</div>}
      </div>
      <p className="muted board-legend">Los comprobantes por revisar aparecen primero, del más antiguo al más nuevo. En los planes mensuales el total incluye todos los meses contratados.</p>
    </section>
  );
}
