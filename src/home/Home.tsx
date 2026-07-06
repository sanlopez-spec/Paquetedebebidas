import { useState, useEffect, type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router';
import {
  MapPin, Clock, Phone, ChevronRight, ExternalLink,
  Wine, ShoppingBag, Sparkles, ArrowDown,
  Truck, CreditCard, Wrench, Monitor, ChevronLeft, X,
} from 'lucide-react';
import {
  IconVinos, IconEspumantes, IconDestilados,
  IconCervezas, IconMixers, IconGaseosas,
} from '../app/components/BeverageIcons';
import SiteHeader from '../site/SiteHeader';
import Footer from '../site/Footer';
import { TIENDA_URL } from '../app/data';

// ── Branded photo frame with automatic placeholder on error ───────────────────

function PhotoFrame({ src, alt, className = '', placeholderText = 'Foto próximamente', PlaceholderIcon = Wine }: {
  src: string;
  alt: string;
  className?: string;
  placeholderText?: string;
  PlaceholderIcon?: ComponentType<{ size?: number; className?: string }>;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`bg-edb-elevated border border-edb-border/50 flex flex-col items-center justify-center gap-2 ${className}`}>
        <PlaceholderIcon size={26} className="text-edb-gold opacity-40" aria-hidden="true" />
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
    href: '#local-barracas' as string | null,
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

// ── Locales data — editar aquí para actualizar o remover un local ─────────────

type LightboxState = { localKey: string; idx: number } | null;

type LocalInfo = {
  key: string;
  infoSide: 'left' | 'right';
  nameWhite: string;
  nameGold: string;
  rating: number;
  reviews: number;
  reviewsUrl: string;
  address: string;
  mapsUrl: string;
  embedUrl: string;
  hours: string[];
  contacts: { label: string; href: string }[];
  photos: string[];
  banner: string;
  review: { author: string; initials: string; text: string };
};

const LOCALES: Record<string, LocalInfo> = {
  barracas: {
    key:        'barracas',
    infoSide:   'left',
    nameWhite:  'Local ',
    nameGold:   'Barracas.',
    rating:     4.7,
    reviews:    289,
    reviewsUrl: '#', // TODO: reemplazar con URL de la ficha de Google
    address:    'Av. Martín García 695, CABA',
    mapsUrl:    'https://www.google.com/maps/search/?api=1&query=Av.+Martin+Garcia+695+CABA',
    embedUrl:   'https://www.google.com/maps?q=Av+Martin+Garcia+695+CABA&output=embed',
    hours: [
      'Lunes a Sábado de 10 a 22 h',
      'Domingo de 11 a 20 h',
    ],
    contacts: [
      { label: '011 4307-0938',       href: 'tel:+541143070938'  },
      { label: '+54 9 11 2883-3566',  href: 'tel:+5491128833566' },
    ],
    photos: [1,2,3,4,5,6].map(n => `/local-barracas-${n}.jpg`),
    banner: '/local-barracas-banner.jpg',
    review: {
      author:   'Matías De Santis',
      initials: 'MD',
      text: 'He comprado varias veces bebidas de distintos tipos (whiskies, licores, brandy y vermú). La atención es muy buena y hay mucha variedad que van cambiando/rotando de forma permanente. Es ideal para ir a buscar aquellas botellas que ya sabemos que nos gustan, así como para "explorar" un poco y dejarse recomendar por los chicos que atienden. ¡Recomendable!',
    },
  },
  flores: {
    key:        'flores',
    infoSide:   'left',
    nameWhite:  'Local ',
    nameGold:   'Flores.',
    rating:     4.9,
    reviews:    35,
    reviewsUrl: '#', // TODO: reemplazar con URL de la ficha de Google
    address:    'Av. Carabobo 338, CABA',
    mapsUrl:    'https://www.google.com/maps/search/?api=1&query=Av.+Carabobo+338+CABA',
    embedUrl:   'https://www.google.com/maps?q=Av+Carabobo+338+CABA&output=embed',
    hours: [
      'Martes y Miércoles de 16 a 22 h',
      'Jueves y Viernes de 12 a 22 h',
      'Sábado de 10 a 22 h',
      'Domingo y Lunes cerrado',
    ],
    contacts: [
      { label: '011 15-3685-5540',    href: 'tel:+5491153685540' },
    ],
    photos: [1,2,3,4,5,6].map(n => `/local-flores-${n}.jpg`),
    banner: '/local-flores-banner.jpg',
    review: {
      author:   'Juan Manuel Chidini',
      initials: 'JC',
      text: 'Fui a comprar un regalo para un cumpleaños y me supieron asesorar de manera excelente sobre cada uno de los vinos, el muchacho se tomó su tiempo para explicar de manera clara las diferencias entre cada uno. Impecable atención al cliente.',
    },
  },
};

// ── Star rating helpers ───────────────────────────────────────────────────────

function StarSvg({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }} aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function StarRating({
  rating,
  reviews,
  variant = 'default',
}: {
  rating: number;
  reviews: number;
  variant?: 'default' | 'banner';
}) {
  const pct = `${((rating / 5) * 100).toFixed(1)}%`;
  const isBanner = variant === 'banner';
  const emptyColor = isBanner ? '#58585e' : '#3a3a40';
  return (
    <div className="flex items-center gap-3">
      <span className={`font-display text-3xl font-semibold leading-none ${isBanner ? 'text-white' : 'text-edb-text'}`}>
        {rating.toFixed(1).replace('.', ',')}
      </span>
      <div className="flex flex-col gap-1">
        {/* Gray base + gold overlay clipped to rating percentage */}
        <div className="relative inline-flex">
          <div className="flex gap-[2px]">
            {[0,1,2,3,4].map(i => <StarSvg key={i} color={emptyColor} />)}
          </div>
          <div className="absolute top-0 left-0 h-full overflow-hidden" style={{ width: pct }}>
            <div className="flex gap-[2px]">
              {[0,1,2,3,4].map(i => <StarSvg key={i} color="#e7a500" />)}
            </div>
          </div>
        </div>
        <span className={`text-xs ${isBanner ? 'text-white/70' : 'text-edb-muted'}`}>
          {reviews} opiniones en Google
        </span>
      </div>
    </div>
  );
}

// ── Gallery photo tile ────────────────────────────────────────────────────────

function GalleryPhoto({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl aspect-[4/3] bg-edb-card border border-edb-border/50 hover:border-edb-gold/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta w-full"
      aria-label={alt}
    >
      {failed ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
          <Wine size={18} className="text-edb-gold opacity-30" aria-hidden="true" />
          <span className="text-[10px] text-edb-border">Foto próximamente</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

// ── Local section component ───────────────────────────────────────────────────

function LocalSection({
  local,
  id,
  sectionClass,
  setLightbox,
}: {
  local: LocalInfo;
  id: string;
  sectionClass: string;
  setLightbox: Dispatch<SetStateAction<LightboxState>>;
}) {
  const [bannerFailed, setBannerFailed] = useState(false);
  const isLeft = local.infoSide === 'left';

  return (
    <section
      id={id}
      className={`${sectionClass} border-t border-edb-border scroll-mt-14`}
    >
      {/* 1. BANNER — foto de fachada full-width, nombre grande + rating montados */}
      <div className="relative overflow-hidden aspect-[2.6/1] min-h-[220px] lg:min-h-0">
        {bannerFailed ? (
          <div className="w-full h-full bg-edb-card flex flex-col items-center justify-center gap-3">
            <ShoppingBag size={32} className="text-edb-gold opacity-30" aria-hidden="true" />
            <span className="text-edb-border text-sm">
              Foto fachada · {local.nameWhite}{local.nameGold}
            </span>
          </div>
        ) : (
          <img
            src={local.banner}
            alt={`Fachada ${local.nameWhite}${local.nameGold}`}
            className="w-full h-full object-cover"
            onError={() => setBannerFailed(true)}
          />
        )}
        {/* Gradiente de abajo hacia arriba para legibilidad del texto */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(8,8,10,.92) 0%, transparent 75%)' }}
        />
        {/* Nombre GRANDE + rating, alineados abajo-izquierda */}
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-8 pb-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-[2.1rem] sm:text-[2.8rem] lg:text-[3.25rem] font-semibold leading-none tracking-[-0.025em] mb-3">
              <span className="text-white">{local.nameWhite}</span>
              <span className="text-edb-gold-readable">{local.nameGold}</span>
            </h2>
            <StarRating rating={local.rating} reviews={local.reviews} variant="banner" />
          </div>
        </div>
      </div>

      {/* 2. Split + 3. Reseña + 4. Galería */}
      <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col gap-10">

        {/* 2. Split info / mapa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[34px] items-stretch">

          {/* Info column — justify-center centra si el mapa resulta más alto */}
          <div className={`flex flex-col justify-center gap-4${!isLeft ? ' lg:order-2' : ''}`}>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <MapPin size={15} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                <span className="text-edb-text text-sm">{local.address}</span>
              </div>
              <div className="flex items-start gap-3">
                <Clock size={15} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                <div className="text-edb-muted text-sm space-y-0.5">
                  {local.hours.map((h, i) => <p key={i}>{h}</p>)}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone size={15} className="text-edb-gold-readable flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  {local.contacts.map((c, i) => (
                    <a
                      key={i}
                      href={c.href}
                      className="text-edb-text text-sm hover:text-edb-gold-readable transition-colors"
                    >
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={local.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
              >
                Cómo llegar
                <ExternalLink size={14} />
              </a>
              {/* reviewsUrl: completar con la URL de la ficha de Google */}
              <a
                href={local.reviewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-edb-border text-edb-text font-semibold px-6 py-3 rounded-xl hover:border-edb-gold hover:text-edb-gold-readable transition-all text-sm"
              >
                Ver reseñas en Google
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Mapa — h-[280px] mobile; en desktop min-h garantiza generosidad,
              items-stretch del grid estira hasta el alto de la info si es mayor */}
          <div className={`h-[280px] lg:h-auto lg:min-h-[280px]${!isLeft ? ' lg:order-1' : ''}`}>
            <iframe
              src={local.embedUrl}
              title={`Mapa ${local.nameWhite}${local.nameGold}`}
              width="100%"
              height="100%"
              loading="lazy"
              className="block w-full h-full rounded-2xl"
              style={{ border: 0 }}
              allowFullScreen
            />
          </div>

        </div>

        {/* 3. Reseña destacada */}
        <div className="bg-edb-card border border-edb-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-edb-gold/10 border border-edb-gold/20 flex items-center justify-center flex-shrink-0">
              <span className="text-edb-gold-readable font-bold text-sm">{local.review.initials}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-edb-text font-semibold text-sm leading-tight">{local.review.author}</p>
              <div className="flex gap-[2px]">
                {[0,1,2,3,4].map(i => <StarSvg key={i} color="#e7a500" />)}
              </div>
            </div>
          </div>
          <blockquote className="text-edb-muted text-sm leading-relaxed">
            &ldquo;{local.review.text}&rdquo;
          </blockquote>
        </div>

        {/* 4. Galería — 2 cols mobile, 3 sm+, 6 desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {local.photos.map((src, i) => (
            <GalleryPhoto
              key={i}
              src={src}
              alt={`${local.nameWhite}${local.nameGold} — foto ${i + 1}`}
              onClick={() => setLightbox({ localKey: local.key, idx: i })}
            />
          ))}
        </div>

      </div>
    </section>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [lightbox, setLightbox] = useState<{ localKey: string; idx: number } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox]);

  const lightboxLocal = lightbox
    ? LOCALES[lightbox.localKey] ?? null
    : null;
  const lightboxTotal = lightboxLocal ? lightboxLocal.photos.length : 0;

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

      {/* ── (D) Tienda online — split texto izq / captura der ───────────── */}
      {/* Alto de fila = texto (items-stretch); captura rellena con lg:h-full      */}
      <section
        id="tienda"
        className="bg-edb-base border-t border-edb-border scroll-mt-14 px-4 py-12"
      >
        <div className="max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.82fr] gap-[34px] items-stretch">

            {/* Left — texto: su altura natural determina la fila */}
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
                <span className="text-edb-text">Nuestra vinoteca,</span>{' '}
                <span className="text-edb-gold-readable">también online.</span>
              </h2>
              <p className="text-edb-muted text-base leading-relaxed max-w-[460px]">
                El mismo catálogo que en nuestros locales, pero desde tu casa. Desde
                etiquetas para todos los días hasta esa botella especial que no se consigue
                en ningún lado, con envío a domicilio.
              </p>

              {/* Chips de categorías — grandes, flex-wrap */}
              <div className="flex flex-wrap gap-[11px] max-w-[520px]">
                {TIENDA_CATS.map(({ key, label }) => (
                  <a
                    key={key}
                    href={TIENDA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-[20px] py-[11px] rounded-full bg-edb-card border border-edb-border/50 text-[14.5px] font-medium text-edb-muted hover:brightness-110 hover:border-edb-gold/30 hover:text-edb-text transition-all"
                  >
                    {label}
                  </a>
                ))}
              </div>

              {/* Franja envíos + cuotas */}
              <div className="flex flex-wrap items-center gap-x-[24px] gap-y-2">
                <span className="flex items-center gap-2 text-[13px] text-edb-muted">
                  <Truck size={13} className="text-edb-gold-readable flex-shrink-0" aria-hidden="true" />
                  Envíos a CABA y GBA
                </span>
                <span className="flex items-center gap-2 text-[13px] text-edb-muted">
                  <CreditCard size={13} className="text-edb-gold-readable flex-shrink-0" aria-hidden="true" />
                  Cuotas sin interés con BBVA y Banco Ciudad
                </span>
              </div>

              {/* CTA — idéntico al de Paquetes */}
              <a
                href={TIENDA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-edb-gold-cta text-edb-base font-bold px-6 py-3 rounded-xl hover:brightness-110 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta self-start"
              >
                Ir a la tienda online
                <ExternalLink size={14} />
              </a>
            </div>

            {/* Right — captura: h-64 mobile (altura razonable), lg:h-full rellena
                la fila definida por el texto. Sin min-height grande. Igual que C. */}
            <PhotoFrame
              src="/tienda-online.jpg"
              alt="Captura de la tienda online EDB"
              placeholderText="Captura de la tienda online"
              PlaceholderIcon={Monitor}
              className="w-full rounded-2xl h-64 lg:h-full object-left"
            />

          </div>
        </div>
      </section>

      {/* ── (E1) Local Barracas ──────────────────────────────────────────── */}
      <LocalSection
        local={LOCALES.barracas}
        id="local-barracas"
        sectionClass="bg-edb-elevated"
        setLightbox={setLightbox}
      />

      {/* ── (E2) Local Flores ────────────────────────────────────────────── */}
      <LocalSection
        local={LOCALES.flores}
        id="local-flores"
        sectionClass="bg-edb-base"
        setLightbox={setLightbox}
      />

      {/* ── (F) Footer ───────────────────────────────────────────────────── */}
      <Footer />

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox !== null && lightboxLocal !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white hover:text-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
            onClick={() => setLightbox(null)}
            aria-label="Cerrar galería"
          >
            <X size={24} />
          </button>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white hover:text-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(lb => lb ? { ...lb, idx: (lb.idx - 1 + lightboxTotal) % lightboxTotal } : null);
            }}
            aria-label="Foto anterior"
          >
            <ChevronLeft size={32} />
          </button>
          <img
            src={lightboxLocal.photos[lightbox.idx]}
            alt={`${lightboxLocal.nameWhite}${lightboxLocal.nameGold} foto ${lightbox.idx + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white hover:text-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(lb => lb ? { ...lb, idx: (lb.idx + 1) % lightboxTotal } : null);
            }}
            aria-label="Foto siguiente"
          >
            <ChevronRight size={32} />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm select-none">
            {lightbox.idx + 1} / {lightboxTotal}
          </span>
        </div>
      )}
    </div>
  );
}
