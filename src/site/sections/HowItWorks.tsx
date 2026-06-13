import { motion, useReducedMotion } from 'motion/react';
import { trackGA, trackClarity } from '../../app/utils';
import type { WizardEventType } from '../../app/App';

const STEPS = [
  {
    n: 1,
    title: 'Respondé 5 preguntas',
    desc: 'Evento, personas, duración, ritmo y estilo.',
  },
  {
    n: 2,
    title: 'Calculamos tu paquete',
    desc: 'La medida exacta para tu evento, no un combo fijo.',
  },
  {
    n: 3,
    title: 'Elegís la calidad',
    desc: 'Tres niveles. Vos decidís marcas y presupuesto.',
  },
  {
    n: 4,
    title: 'Te lo llevamos',
    desc: 'Envío sin cargo en CABA y GBA según el plan.',
  },
];

interface HowItWorksProps {
  onStart: (eventType?: WizardEventType) => void;
}

export default function HowItWorks({ onStart }: HowItWorksProps) {
  const reducedMotion = !!useReducedMotion();

  const fadeUp = (delay = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.45, ease: 'easeOut', delay },
        };

  const handleCTA = () => {
    trackGA('cotizador_iniciado', { origen: 'como_funciona' });
    trackClarity('cotizador_iniciado_como_funciona');
    onStart();
  };

  return (
    <section className="py-12 md:py-20" aria-label="Cómo funciona">
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-6 md:mb-8">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            En 2 minutos, sin compromiso.
          </h2>
        </motion.div>

        {/* Tira de 4 pasos: 2×2 en mobile, fila única en desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {STEPS.map(({ n, title, desc }, i) => (
            <motion.div
              key={n}
              {...fadeUp(0.07 + i * 0.07)}
              className="flex flex-col gap-2 p-4 bg-edb-card border border-edb-border rounded-xl"
            >
              <span
                className="font-bold text-2xl text-edb-gold-readable leading-none"
                aria-hidden="true"
              >
                {n}
              </span>
              <strong className="text-edb-text font-semibold text-sm leading-tight">
                {title}
              </strong>
              <p className="text-edb-muted text-xs leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp(0.35)}>
          <button
            onClick={handleCTA}
            className="inline-flex items-center bg-edb-gold-cta text-edb-base font-bold py-2.5 px-6 rounded-xl text-sm hover:bg-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta focus-visible:ring-offset-2 focus-visible:ring-offset-edb-base"
          >
            Armá tu paquete
          </button>
        </motion.div>

      </div>
    </section>
  );
}
