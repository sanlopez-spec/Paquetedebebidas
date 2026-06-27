import { ExternalLink } from 'lucide-react';

interface SiteHeaderProps {
  openInNewTab?: boolean;
}

export default function SiteHeader({ openInNewTab = false }: SiteHeaderProps) {
  const ext = { target: '_blank' as const, rel: 'noopener noreferrer' };

  // When on /paquetes all home-anchors need the '/' prefix; when on '/' use bare '#'
  const p = openInNewTab ? '/' : '';

  const scrollToTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 bg-edb-base/85 backdrop-blur-md border-b border-edb-border"
      aria-label="Navegación principal"
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        {openInNewTab ? (
          <a href="/" {...ext}>
            <img src="/logo-edb-blanco.png" alt="EDB Estación de Bebidas" className="h-8 w-auto" />
          </a>
        ) : (
          <a href="/" onClick={scrollToTop}>
            <img src="/logo-edb-blanco.png" alt="EDB Estación de Bebidas" className="h-8 w-auto" />
          </a>
        )}

        {/* Nav links */}
        <div className="flex items-center gap-3 sm:gap-5 text-sm">

          {/* Inicio — hidden on mobile (logo serves the same purpose) */}
          {openInNewTab ? (
            <a href="/" {...ext} className="hidden sm:block text-edb-muted hover:text-edb-text transition-colors">
              Inicio
            </a>
          ) : (
            <a href="/" onClick={scrollToTop} className="hidden sm:block text-edb-muted hover:text-edb-text transition-colors">
              Inicio
            </a>
          )}

          {/* Paquetes para eventos */}
          <a
            href={`${p}#paquetes`}
            className="text-edb-muted hover:text-edb-text transition-colors"
            {...(openInNewTab ? ext : {})}
          >
            <span className="sm:hidden">Paquetes</span>
            <span className="hidden sm:inline">Paquetes para eventos</span>
          </a>

          {/* Locales */}
          <a
            href={`${p}#locales`}
            className="text-edb-muted hover:text-edb-text transition-colors"
            {...(openInNewTab ? ext : {})}
          >
            Locales
          </a>

          {/* Tienda online — always new tab, visually highlighted */}
          <a
            href="https://estaciondebebidas.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-edb-text border border-edb-border px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg hover:border-edb-gold hover:text-edb-gold-readable transition-all"
          >
            <span className="sm:hidden">Tienda</span>
            <span className="hidden sm:inline">Tienda online</span>
            <ExternalLink size={11} />
          </a>

        </div>
      </div>
    </nav>
  );
}
