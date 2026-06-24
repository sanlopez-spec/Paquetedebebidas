import { WHATSAPP_NUMBER } from '../app/data';
import type { WizardEventType } from '../app/App';

interface NavProps {
  startWizard: (eventType?: WizardEventType) => void;
}

export default function Nav({ startWizard }: NavProps) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 bg-edb-base/85 backdrop-blur-md border-b border-edb-border"
      aria-label="Navegación principal"
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <img
          src="/logo-edb-blanco.png"
          alt="EDB Estación de Bebidas"
          className="h-8 w-auto"
        />

        {/* Acciones */}
        <div className="flex items-center gap-3">
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-sm text-edb-muted hover:text-edb-text transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
          >
            Escribinos
          </a>
          <button
            onClick={() => startWizard()}
            className="bg-edb-gold-cta text-edb-base text-sm font-semibold px-4 py-2 rounded-xl hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-edb-gold-cta focus-visible:ring-offset-edb-base"
          >
            Armá tu paquete
          </button>
        </div>
      </div>
    </nav>
  );
}
