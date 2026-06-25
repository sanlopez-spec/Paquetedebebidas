import { Link } from 'react-router';

interface SiteHeaderProps {
  openInNewTab?: boolean;
}

const NAV_LINKS = [
  { label: 'Paquetes', href: '/paquetes', external: false },
  { label: 'Tienda',   href: 'https://estaciondebebidas.com', external: true },
] as const;

export default function SiteHeader({ openInNewTab = false }: SiteHeaderProps) {
  const ext = { target: '_blank' as const, rel: 'noopener noreferrer' };

  const logoProps = openInNewTab
    ? { href: '/', ...ext }
    : null;

  const localesHref = openInNewTab ? '/#locales' : '#locales';

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 bg-edb-base/85 backdrop-blur-md border-b border-edb-border"
      aria-label="Navegación principal"
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Logo */}
        {openInNewTab ? (
          <a {...logoProps!}>
            <img
              src="/logo-edb-blanco.png"
              alt="EDB Estación de Bebidas"
              className="h-8 w-auto"
            />
          </a>
        ) : (
          <Link to="/">
            <img
              src="/logo-edb-blanco.png"
              alt="EDB Estación de Bebidas"
              className="h-8 w-auto"
            />
          </Link>
        )}

        {/* Links */}
        <div className="flex items-center gap-5 text-sm">
          {NAV_LINKS.map(({ label, href, external }) => {
            const newTab = external || openInNewTab;
            if (newTab) {
              return (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-edb-muted hover:text-edb-text transition-colors"
                >
                  {label}
                </a>
              );
            }
            return (
              <Link
                key={label}
                to={href}
                className="text-edb-muted hover:text-edb-text transition-colors"
              >
                {label}
              </Link>
            );
          })}

          {/* Locales — ancla al home */}
          {openInNewTab ? (
            <a
              href={localesHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-edb-muted hover:text-edb-text transition-colors"
            >
              Locales
            </a>
          ) : (
            <a
              href={localesHref}
              className="text-edb-muted hover:text-edb-text transition-colors"
            >
              Locales
            </a>
          )}
        </div>

      </div>
    </nav>
  );
}
