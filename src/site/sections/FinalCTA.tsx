import { motion, useReducedMotion } from 'motion/react';
import { WHATSAPP_NUMBER } from '../../app/data';
import { trackGA, trackClarity } from '../../app/utils';
import type { WizardEventType } from '../../app/App';

const WA_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola! Quiero consultar por un paquete de bebidas para un evento.')}`;

interface FinalCTAProps {
  onStart: (eventType?: WizardEventType) => void;
}

export default function FinalCTA({ onStart }: FinalCTAProps) {
  const reducedMotion = !!useReducedMotion();

  const fadeUp = (delay = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.5, ease: 'easeOut', delay },
        };

  const handlePrimary = () => {
    trackGA('cotizador_iniciado', { origen: 'cierre' });
    trackClarity('cotizador_iniciado_cierre');
    onStart();
  };

  const handleSecondary = () => {
    trackGA('whatsapp_directo', { origen: 'cierre' });
    trackClarity('whatsapp_directo_cierre');
  };

  return (
    <section
      className="bg-edb-elevated border-t border-edb-gold/20 py-10 md:py-16"
      aria-label="Comenzá tu cotización"
    >
      <div className="max-w-3xl mx-auto w-full px-4 text-center">

        <motion.h2
          {...fadeUp(0)}
          className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight mb-4"
        >
          Armá tu paquete ahora.{' '}
          <span className="text-edb-gold-readable">Te lleva 2 minutos.</span>
        </motion.h2>

        <motion.p
          {...fadeUp(0.1)}
          className="text-edb-muted text-base md:text-lg mb-8"
        >
          Sin registrarte, sin compromiso. La cotización es al instante.
        </motion.p>

        <motion.div
          {...fadeUp(0.18)}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <button
            onClick={handlePrimary}
            className="w-full sm:w-auto inline-flex items-center justify-center bg-edb-gold-cta text-edb-base font-bold py-3.5 px-10 rounded-xl text-sm hover:bg-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta focus-visible:ring-offset-2 focus-visible:ring-offset-edb-elevated"
          >
            Armá tu paquete
          </button>

          <a
            href={WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleSecondary}
            className="w-full sm:w-auto inline-flex items-center justify-center border border-edb-border text-edb-text font-semibold py-3.5 px-8 rounded-xl text-sm hover:border-edb-muted hover:text-edb-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-border focus-visible:ring-offset-2 focus-visible:ring-offset-edb-elevated"
          >
            Prefiero hablar
          </a>
        </motion.div>

      </div>
    </section>
  );
}
