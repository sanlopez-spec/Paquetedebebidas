import { useState } from 'react';
import { Link } from 'react-router';
import {
  MapPin, Clock, Phone, ChevronRight, ExternalLink,
  Wine, ShoppingBag, Sparkles, ArrowDown,
  Truck, CreditCard, Wrench,
} from 'lucide-react';
import {
  IconVinos, IconEspumantes, IconDestilados,
  IconCervezas, IconMixers, IconGaseosas,
} from '../app/components/BeverageIcons';
import SiteHeader from '../site/SiteHeader';
import { WHATSAPP_NUMBER, TIENDA_URL } from '../app/data';

// ── Branded photo frame with automatic placeholder on error ───────────────────

function PhotoFrame({ src, alt, className = '', placeholderText = 'Foto próximamente' }: { src: string; alt: string; className?: string; placeholderText?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`bg-edb-elevated border border-edb-border/50 flex flex-col items-center justify-center gap-2 ${className}`}>
        <Wine size={26} className="text-edb-gold opacity-40" aria-hidden="true" />
        <span className="text-[11px] tracking-wide text-edb-border">{placeholderText}</span>
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
    href: '#paquetes' as string | null,
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
  { key: 'vinos',       label: 'Vinos',       Icon: IconVinos      },
  { key: 'espumantes',  label: 'Espumantes',   Icon: IconEspumantes },
  { key: 'whisky',      label: 'Whisky',       Icon: IconDestilados },
  { key: 'gin',         label: 'Gin',          Icon: IconMixers     },
  { key: 'destilados',  label: 'Destilados',   Icon: IconDestilados },
  { key: 'licores',     label: 'Licores',      Icon: IconGaseosas   },
  { key: 'cervezas',    label: 'Cervezas',     Icon: IconCervezas   },
  { key: 'sidras',      label: 'Sidras',       Icon: IconCervezas   },
  { key: 'cristaleria', label: 'Cristalería',  Icon: Wine           },
  { key: 'accesorios',  label: 'Accesorios',   Icon: Wrench         },
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

      {/* ── (B) Hero — cloned from src/site/sections/Hero.tsx ───────────── */}
      <section className="bg-edb-base pt-14">
        <div className="py-10 md:py-16">
          {/* Exact same container as Hero.tsx */}
          <div className="max-w-6xl mx-auto w-full px-4 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 items-start">

            {/* Left — same classes as Hero.tsx, different text, no checks/CTA */}
            <div className="flex flex-col gap-4 lg:gap-8">
              <h1 className="font-display text-3xl md:text-5xl lg:text-[3.25rem] font-semibold text-edb-text leading-[1.1] tracking-tight">
                Todo lo que encontrás en{' '}
                <span className="block mt-2 text-edb-gold-readable">
                  Estación de Bebidas.
                </span>
              </h1>
              <p className="text-sm md:text-lg text-edb-muted leading-relaxed max-w-lg">
                Más de 15 años de experiencia en el mundo de las bebidas. En EDB encontrás
                desde esa botella especial que no conseguís en ningún lado hasta el
                asesoramiento para armar la barra de tu casamiento, cumpleaños o evento
                corporativo.
              </p>
            </div>

            {/* Right — standalone rows, bg-gray-100 (cotizador page gray), sin recuadro */}
            <div className="flex flex-col gap-3">
              {VIDRIERA_ITEMS.map(({ key, Icon, title, subtitle, href, disabled }) => {
                const rowClass = `group flex items-center gap-3 rounded-xl px-4 py-[14px] border border-transparent transition-colors ${
                  disabled
                    ? 'bg-gray-200 opacity-50 cursor-default select-none'
                    : 'bg-gray-100 hover:bg-gray-50 hover:border-[#937522]/30 cursor-pointer'
                }`;

                const inner = (
                  <>
                    <div className="w-9 h-9 rounded-lg bg-[#937522]/[0.10] flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-[#937522]" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                    </div>
                    {!disabled && (
                      <ArrowDown size={16} className="text-[#937522] flex-shrink-0" />
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
        className="bg-edb-elevated border-t border-edb-border scroll-mt-14 px-4 py-12"
      >
        <div className="max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[0.62fr_1fr] gap-[34px] items-stretch">

            {/* Left — foto: altura fija mobile, estira al alto del contenido en desktop */}
            <PhotoFrame
              src="/barra-evento.jpg"
              alt="Barra de evento EDB"
              placeholderText="Foto de barra de evento"
              className="w-full rounded-2xl h-64 lg:h-full"
            />

            {/* Right — contenido */}
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
                <span className="text-edb-text">Calculá las bebidas para tu evento</span>{' '}
                <span className="text-edb-gold-readable">en minutos.</span>
              </h2>
              <p className="text-edb-muted text-base leading-relaxed">
                Nuestro exclusivo cotizador online calcula las bebidas justas para tu evento
                —gratis y sin registrarte— cubriendo todas las categorías: barra de tragos,
                vinos, espumantes, cervezas y gaseosas.
              </p>
              <div className="grid grid-cols-2 gap-[11px]">
                {[
                  { n: 1, title: 'Respondé 5 preguntas',          desc: 'Evento, personas, duración y estilo.' },
                  { n: 2, title: 'Calculamos tu paquete',         desc: 'La medida justa, no un combo fijo.' },
                  { n: 3, title: 'Elegís calidad y precio',       desc: 'Tres niveles. Vos decidís marcas y presupuesto.' },
                  { n: 4, title: 'Coordinás con un especialista', desc: 'Ajustamos los detalles y te lo llevamos.' },
                ].map(({ n, title, desc }) => (
                  <div
                    key={n}
                    className="flex flex-col gap-2 p-4 md:p-5 bg-edb-card border border-edb-border rounded-xl"
                  >
                    <span className="font-bold text-2xl text-edb-gold-readable leading-none" aria-hidden="true">
                      {n}
                    </span>
                    <strong className="text-edb-text font-semibold text-[13.5px] leading-tight">
                      {title}
                    </strong>
                    <p className="text-edb-muted text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
              <Link
                to="/paquetes"
                className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta self-start"
              >
                Calculá tu evento
                <ChevronRight size={16} />
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── (D) Tienda online ────────────────────────────────────────────── */}
      <section
        id="tienda"
        className="bg-edb-base border-t border-edb-border scroll-mt-14 px-4 py-12"
      >
        <div className="max-w-6xl mx-auto w-full text-center">

          {/* Título */}
          <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight mb-4">
            <span className="text-edb-text">Tu vinoteca,</span>{' '}
            <span className="text-edb-gold-readable">también online.</span>
          </h2>

          {/* Bajada */}
          <p className="text-edb-muted text-base leading-relaxed max-w-[480px] mx-auto mb-10">
            Vinos, espumantes, destilados y mucho más, con envío a domicilio. +1000
            productos a un clic.
          </p>

          {/* Grilla de categorías — 2 cols mobile, 5 cols sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
            {TIENDA_CATS.map(({ key, label, Icon }) => (
              <a
                key={key}
                href={TIENDA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-3 p-[18px] bg-edb-card border border-edb-border/50 rounded-xl hover:brightness-110 hover:border-edb-gold/30 transition-all"
              >
                <Icon className="w-7 h-7 text-edb-gold-readable" aria-hidden="true" />
                <span className="text-[12.5px] font-medium text-edb-text leading-tight">
                  {label}
                </span>
              </a>
            ))}
          </div>

          {/* Franja envíos + cuotas */}
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 mb-8">
            <span className="flex items-center gap-2 text-[13.5px] text-edb-muted">
              <Truck size={14} className="text-edb-gold-readable flex-shrink-0" aria-hidden="true" />
              Envíos a CABA y GBA
            </span>
            <span className="hidden sm:block w-px h-4 bg-edb-border" aria-hidden="true" />
            <span className="flex items-center gap-2 text-[13.5px] text-edb-muted">
              <CreditCard size={14} className="text-edb-gold-readable flex-shrink-0" aria-hidden="true" />
              Cuotas sin interés con BBVA y Banco Ciudad
            </span>
          </div>

          {/* CTA */}
          <a
            href={TIENDA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
          >
            Ir a la tienda online
            <ExternalLink size={14} />
          </a>

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
