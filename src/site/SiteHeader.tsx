import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { TIENDA_URL } from '../app/data';

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
        <div className="flex items-center gap-2 sm:gap-5 text-sm">

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
          <Link
            to="/paquetes"
            className="text-edb-muted hover:text-edb-text transition-colors"
          >
            <span className="sm:hidden">Paquetes</span>
            <span className="hidden sm:inline">Paquetes para eventos</span>
          </Link>

          {/* Local Barracas */}
          <a
            href={`${p}#local-barracas`}
            className="text-edb-muted hover:text-edb-text transition-colors"
            {...(openInNewTab ? ext : {})}
          >
            <span className="sm:hidden">Barracas</span>
            <span className="hidden sm:inline">Local Barracas</span>
          </a>

          {/* Local Flores */}
          <a
            href={`${p}#local-flores`}
            className="text-edb-muted hover:text-edb-text transition-colors"
            {...(openInNewTab ? ext : {})}
          >
            <span className="sm:hidden">Flores</span>
            <span className="hidden sm:inline">Local Flores</span>
          </a>

          {/* Tienda online — always new tab, visually highlighted */}
          <a
            href={TIENDA_URL}
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
