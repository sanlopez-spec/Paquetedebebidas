import { useState } from 'react';
import { Link } from 'react-router';
import {
  MapPin, Clock, Phone, ChevronRight, ExternalLink,
  Wine, ShoppingBag, Sparkles, ArrowRight,
} from 'lucide-react';
import SiteHeader from '../site/SiteHeader';
import { WHATSAPP_NUMBER, TIENDA_URL } from '../app/data';

// ── Branded photo frame with automatic placeholder on error ───────────────────

function PhotoFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`bg-edb-elevated border border-edb-border/50 flex flex-col items-center justify-center gap-2 ${className}`}>
        <Wine size={26} className="text-edb-gold opacity-40" aria-hidden="true" />
        <span className="text-[11px] tracking-wide text-edb-border">Foto próximamente</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

// ── Hero vidriera rows ────────────────────────────────────────────────────────

const VIDRIERA_ITEMS = [
  {
    key: 'paquetes',
    Icon: Wine,
    title: 'Paquetes para eventos',
    subtitle: 'Calculá la barra de tu evento',
    href: '/paquetes' as string | null,
    external: false,
    disabled: false,
  },
  {
    key: 'tienda',
    Icon: ShoppingBag,
    title: 'Tienda online',
    subtitle: '+1000 productos con envío',
    href: '#tienda' as string | null,
    external: false,
    disabled: false,
  },
  {
    key: 'locales',
    Icon: MapPin,
    title: 'Nuestros locales',
    subtitle: 'Barracas y Flores, CABA',
    href: '#locales' as string | null,
    external: false,
    disabled: false,
  },
  {
    key: 'club',
    Icon: Sparkles,
    title: 'Club · Talleres',
    subtitle: 'Próximamente',
    href: null,
    external: false,
    disabled: true,
  },
];

// ── Tienda categories ─────────────────────────────────────────────────────────

const TIENDA_CATS = [
  'Vinos', 'Espumantes', 'Whisky', 'Gin', 'Destilados',
  'Licores', 'Cervezas', 'Sidras', 'Cristalería', 'Accesorios',
];

// ── Locales ───────────────────────────────────────────────────────────────────

const LOCALES = [
  {
    name: 'Local Barracas',
    photo: '/local-barracas.jpg',
    address: 'Av. Martín García 695, CABA',
    hours: [
      'Lunes a Sábado de 10 a 22 h',
      'Domingo de 11 a 20 h',
    ],
    contacts: [
      { label: '011 4307-0938', href: 'tel:+541143070938' },
      { label: '+54 9 11 2883-3566', href: 'tel:+5491128833566' },
    ],
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Martin+Garcia+695+CABA',
  },
  {
    name: 'Local Flores',
    photo: '/local-flores.jpg',
    address: 'Av. Carabobo 338, CABA',
    hours: [
      'Martes y Miércoles de 16 a 22 h',
      'Jueves y Viernes de 12 a 22 h',
      'Sábado de 10 a 22 h',
      'Domingo y Lunes cerrado',
    ],
    contacts: [
      { label: '011 15-3685-5540', href: 'tel:+5491153685540' },
    ],
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Carabobo+338+CABA',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="bg-edb-base text-edb-text min-h-screen">
      <SiteHeader openInNewTab={false} />

      {/* ── (B) Hero — vidriera partida ──────────────────────────────────── */}
      {/* Container mirrors exactly the cotizador: max-w-6xl mx-auto w-full px-4 */}
      <section className="bg-edb-base pt-14 pb-[46px]">
        <div className="max-w-6xl mx-auto w-full px-4 pt-[42px]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-[34px] items-center">

            {/* Left — title + paragraph */}
            <div className="flex flex-col gap-[22px]">
              {/* max-w-[620px] pins the wrap point regardless of viewport */}
              <h1 className="font-display font-medium text-[32px] md:text-[44px] lg:text-[50px] leading-[1.04] tracking-[-1px] max-w-[620px]">
                <span className="text-edb-text">Todo lo que encontrás en </span>
                <span className="text-edb-gold-readable">Estación de Bebidas.</span>
              </h1>
              <p className="text-[#a4a299] text-[15px] leading-[1.6] max-w-[440px]">
                Más de 15 años de experiencia en el mundo de las bebidas. En EDB encontrás
                desde esa botella especial que no conseguís en ningún lado hasta el
                asesoramiento para armar la barra de tu casamiento, cumpleaños o evento
                corporativo.
              </p>
            </div>

            {/* Right — vidriera rows using cotizador page bg (gray-100) */}
            <div className="flex flex-col gap-[10px]">
              {VIDRIERA_ITEMS.map(({ key, Icon, title, subtitle, href, disabled }) => {
                const rowClass = `flex items-center gap-3 rounded-[12px] px-4 py-[14px] border transition-all ${
                  disabled
                    ? 'bg-gray-200 border-transparent opacity-[0.5] cursor-default select-none'
                    : 'bg-gray-100 border-transparent hover:bg-gray-50 hover:border-[#C8A44E]/40 cursor-pointer'
                }`;

                const inner = (
                  <>
                    <div className="w-[37px] h-[37px] rounded-xl bg-[#937522]/[0.14] flex items-center justify-center flex-shrink-0">
                      <Icon size={19} className="text-[#937522]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-medium leading-tight text-[#1a1814]">{title}</p>
                      <p className="text-[#7a766d] text-[12px] mt-0.5">{subtitle}</p>
                    </div>
                    {!disabled && (
                      <ArrowRight size={17} className="text-[#937522] flex-shrink-0" />
                    )}
                  </>
                );

                if (disabled || href === null) {
                  return <div key={key} className={rowClass}>{inner}</div>;
                }
                if (href.startsWith('/')) {
                  return <Link key={key} to={href} className={rowClass}>{inner}</Link>;
                }
                return <a key={key} href={href} className={rowClass}>{inner}</a>;
              })}
            </div>

          </div>
        </div>
      </section>

      {/* ── (C) Paquetes para eventos ────────────────────────────────────── */}
      <section
        id="paquetes"
        className="bg-edb-elevated border-t border-edb-border scroll-mt-14 px-4 py-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight mb-4">
              <span className="text-edb-text">Armá la barra de tu evento</span>{' '}
              <span className="text-edb-gold-readable">sin sorpresas.</span>
            </h2>
            <p className="text-edb-muted text-base leading-relaxed mb-6">
              Hace más de 14 años armamos barras para casamientos, cumpleaños y eventos corporativos
              por toda la ciudad. Calculás todo online: cantidades exactas, precio por persona,
              y lo que sobra es tuyo.
            </p>
            <Link
              to="/paquetes"
              className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
            >
              Cotizá tu evento
              <ChevronRight size={16} />
            </Link>
          </div>

          {/* Event photo gallery */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <PhotoFrame
                key={n}
                src={`/barra-evento-${n}.jpg`}
                alt={`Barra de evento EDB ${n}`}
                className="w-full h-52 md:h-60 rounded-xl"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── (D) Tienda online ────────────────────────────────────────────── */}
      <section
        id="tienda"
        className="bg-edb-base border-t border-edb-border scroll-mt-14 px-4 py-16"
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight mb-4">
                <span className="text-edb-text">Tienda online</span>{' '}
                <span className="text-edb-gold-readable">estaciondebebidas.com</span>
              </h2>
              <p className="text-edb-muted text-base leading-relaxed mb-6">
                Comprá vinos, espumantes, destilados, cervezas y más desde cualquier lugar.
                Envíos a CABA y GBA. Pagás con tarjeta, transferencia o efectivo.
              </p>

              {/* Category chips */}
              <div className="flex flex-wrap gap-2 mb-8">
                {TIENDA_CATS.map((cat) => (
                  <a
                    key={cat}
                    href={TIENDA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-edb-muted border border-edb-border px-3 py-1.5 rounded-full hover:border-edb-gold hover:text-edb-gold-readable transition-all"
                  >
                    {cat}
                  </a>
                ))}
              </div>

              <a
                href={TIENDA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-edb-border text-edb-text font-semibold px-6 py-3 rounded-xl hover:border-edb-gold hover:text-edb-gold-readable transition-all text-sm"
              >
                Ir a la tienda
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── (E) Locales ──────────────────────────────────────────────────── */}
      <section
        id="locales"
        className="bg-edb-elevated border-t border-edb-border scroll-mt-14 px-4 py-16"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-2 text-center">
            <span className="text-edb-text">Dos locales en</span>{' '}
            <span className="text-edb-gold-readable">CABA.</span>
          </h2>
          <p className="text-edb-muted text-sm text-center mb-10">
            Vení a elegir en persona o escribinos antes de venir.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LOCALES.map((local) => (
              <div
                key={local.name}
                className="bg-edb-card border border-edb-border rounded-2xl overflow-hidden flex flex-col"
              >
                {/* Local photo */}
                <PhotoFrame
                  src={local.photo}
                  alt={`Foto ${local.name}`}
                  className="w-full h-44"
                />

                <div className="p-6 flex flex-col gap-4 flex-1">
                  <h3 className="font-display text-xl font-semibold text-edb-text">
                    {local.name}
                  </h3>

                  <div className="flex items-start gap-3 text-sm">
                    <MapPin size={15} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                    <span className="text-edb-text">{local.address}</span>
                  </div>

                  <div className="flex items-start gap-3 text-sm">
                    <Clock size={15} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                    <div className="text-edb-muted space-y-0.5">
                      {local.hours.map((h, i) => (
                        <p key={i}>{h}</p>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {local.contacts.map((c, i) => (
                      <a
                        key={i}
                        href={c.href}
                        className={`flex items-center gap-3 text-sm text-edb-text hover:text-edb-gold-readable transition-colors ${i > 0 ? 'pl-[23px]' : ''}`}
                      >
                        {i === 0 && <Phone size={15} className="text-edb-gold-readable flex-shrink-0" />}
                        {c.label}
                      </a>
                    ))}
                  </div>

                  <a
                    href={local.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center justify-center gap-2 border border-edb-border text-edb-text font-semibold px-4 py-2.5 rounded-xl hover:border-edb-gold hover:text-edb-gold-readable transition-all text-sm"
                  >
                    Cómo llegar
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── (F) Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-edb-border bg-edb-card py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-edb-muted">
          <div className="flex flex-col items-center sm:items-start gap-0.5">
            <span className="font-display text-sm font-semibold text-edb-text">
              EDB Estación de Bebidas
            </span>
            <span>Desde 2013 con nuestras dos vinotecas en CABA</span>
          </div>

          <nav aria-label="Links del pie" className="flex items-center gap-5">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-edb-text transition-colors"
            >
              WhatsApp
            </a>
            <a
              href={TIENDA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-edb-text transition-colors"
            >
              Tienda online
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
