import { WHATSAPP_NUMBER } from '../app/data';

export default function Footer() {
  return (
    <footer className="border-t border-edb-border bg-edb-card py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-edb-muted">
        <div className="flex flex-col items-center sm:items-start gap-0.5">
          <span className="font-display text-sm font-semibold text-edb-text">
            EDB Estación de Bebidas
          </span>
          <span>Barracas y Flores, CABA</span>
        </div>

        <nav aria-label="Links del pie" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-edb-text transition-colors"
          >
            WhatsApp
          </a>
          <a
            href="https://www.instagram.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-edb-text transition-colors"
          >
            Instagram
          </a>
          <a href="#" className="hover:text-edb-text transition-colors">
            Tienda online
          </a>
          <a href="#" className="opacity-60 hover:opacity-100 hover:text-edb-text transition-all">
            Datos legales
          </a>
        </nav>
      </div>
    </footer>
  );
}
