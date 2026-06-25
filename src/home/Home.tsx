import { Link } from 'react-router';
import { MapPin, Clock, Phone, ChevronRight, ExternalLink } from 'lucide-react';
import SiteHeader from '../site/SiteHeader';
import { WHATSAPP_NUMBER } from '../app/data';

// ── Hub sections ──────────────────────────────────────────────────────────────

const HUB_ITEMS = [
  {
    key: 'paquetes',
    title: 'Paquetes para eventos',
    desc: 'Armá la barra completa de tu casamiento, cumpleaños o evento corporativo con cantidades exactas y precio por persona.',
    href: '/paquetes',
    external: false,
    cta: 'Ver paquetes',
    disabled: false,
  },
  {
    key: 'tienda',
    title: 'Tienda online',
    desc: 'Vinos, espumantes, destilados, cervezas y más. Comprá desde cualquier lugar con envío a domicilio.',
    href: 'https://estaciondebebidas.com',
    external: true,
    cta: 'Ir a la tienda',
    disabled: false,
  },
  {
    key: 'locales',
    title: 'Nuestros locales',
    desc: 'Dos vinotecas en Barracas y Flores, CABA. Vení a elegir en persona con el asesoramiento de nuestro equipo.',
    href: '#locales',
    external: false,
    cta: 'Ver locales',
    disabled: false,
  },
  {
    key: 'club',
    title: 'Club · Talleres',
    desc: 'Club de vino, catas guiadas y talleres de maridaje. Muy pronto disponible.',
    href: null,
    external: false,
    cta: null,
    disabled: true,
    badge: 'Próximamente',
  },
] as const;

// ── Locales ───────────────────────────────────────────────────────────────────

const LOCALES = [
  {
    name: 'Local Barracas',
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

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="pt-14 flex items-center bg-edb-base px-4 py-20 md:py-28">
        <div className="max-w-6xl mx-auto w-full">
          <div className="inline-flex items-center gap-2 bg-edb-elevated border border-edb-border px-3 py-1.5 rounded-full text-edb-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-edb-gold-cta flex-shrink-0" />
            14 años distribuyendo bebidas · Dos vinotecas en CABA
          </div>

          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight mb-6 max-w-3xl">
            <span className="text-edb-text">Tu distribuidora de bebidas</span>{' '}
            <span className="text-edb-gold-readable block mt-1">para eventos.</span>
          </h1>

          <p className="text-edb-muted text-base md:text-lg leading-relaxed max-w-xl mb-8">
            Barracas y Flores, CABA. Hace más de 14 años armamos la barra de casamientos,
            cumpleaños y eventos corporativos por toda la ciudad: sin excesos,
            sin que te falte nada, y lo que sobra es tuyo.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/paquetes"
              className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
            >
              Calculá tu evento
              <ChevronRight size={16} />
            </Link>
            <a
              href="https://estaciondebebidas.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-edb-border text-edb-text font-semibold px-6 py-3 rounded-xl hover:border-edb-gold hover:text-edb-gold-readable transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-border"
            >
              Ver la tienda
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* ── Hub sections ──────────────────────────────────────────────────── */}
      <section className="bg-edb-elevated border-t border-edb-border px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-2 text-center">
            <span className="text-edb-text">Todo lo que encontrás</span>{' '}
            <span className="text-edb-gold-readable">en EDB.</span>
          </h2>
          <p className="text-edb-muted text-sm text-center mb-10">
            Bebidas para eventos, tienda online, locales físicos y más.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HUB_ITEMS.map(({ key, title, desc, href, external, cta, disabled, badge }) => {
              const baseClass = `relative p-6 rounded-2xl border transition-all text-left ${
                disabled
                  ? 'border-edb-border bg-edb-card opacity-50 cursor-not-allowed select-none'
                  : 'border-edb-border bg-edb-card hover:border-edb-gold cursor-pointer group'
              }`;

              const inner = (
                <>
                  {badge && (
                    <span className="absolute top-3 right-3 text-[11px] bg-edb-elevated border border-edb-border text-edb-muted px-2.5 py-0.5 rounded-full font-medium">
                      {badge}
                    </span>
                  )}
                  <h3 className={`font-display text-lg font-semibold mb-2 ${disabled ? 'text-edb-muted' : 'text-edb-text'}`}>
                    {title}
                  </h3>
                  <p className="text-edb-muted text-sm leading-relaxed mb-4">{desc}</p>
                  {cta && (
                    <span className="text-sm font-semibold text-edb-gold-readable flex items-center gap-1 group-hover:gap-2 transition-all">
                      {cta}
                      <ChevronRight size={14} />
                    </span>
                  )}
                </>
              );

              if (disabled || href === null) return <div key={key} className={baseClass}>{inner}</div>;

              if (external) {
                return (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={baseClass}>
                    {inner}
                  </a>
                );
              }

              if (href.startsWith('#')) {
                return <a key={key} href={href} className={baseClass}>{inner}</a>;
              }

              return (
                <Link key={key} to={href} className={baseClass}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Locales ───────────────────────────────────────────────────────── */}
      <section
        id="locales"
        className="bg-edb-base border-t border-edb-border px-4 py-16 scroll-mt-14"
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
                className="bg-edb-card border border-edb-border rounded-2xl p-6 flex flex-col gap-5"
              >
                <h3 className="font-display text-xl font-semibold text-edb-text">
                  {local.name}
                </h3>

                {/* Dirección */}
                <div className="flex items-start gap-3 text-sm">
                  <MapPin size={16} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                  <span className="text-edb-text">{local.address}</span>
                </div>

                {/* Horario */}
                <div className="flex items-start gap-3 text-sm">
                  <Clock size={16} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                  <div className="text-edb-muted space-y-0.5">
                    {local.hours.map((h, i) => (
                      <p key={i}>{h}</p>
                    ))}
                  </div>
                </div>

                {/* Contactos */}
                <div className="flex flex-col gap-2">
                  {local.contacts.map((c, i) => (
                    <a
                      key={i}
                      href={c.href}
                      className={`flex items-center gap-3 text-sm text-edb-text hover:text-edb-gold-readable transition-colors ${i > 0 ? 'pl-7' : ''}`}
                    >
                      {i === 0 && <Phone size={16} className="text-edb-gold-readable flex-shrink-0" />}
                      {c.label}
                    </a>
                  ))}
                </div>

                {/* Mapa */}
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
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
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
              href="https://estaciondebebidas.com"
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
