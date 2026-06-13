import { motion, useReducedMotion } from 'motion/react';
import { trackGA, trackClarity } from '../../app/utils';
import type { WizardEventType } from '../../app/App';

// Solo nombres de categoría — CERO cantidades, litros ni envases
const CATEGORIES = [
  'Destilados y aperitivos',
  'Vinos',
  'Espumantes',
  'Cervezas',
  'Mixers',
  'Gaseosas y aguas',
];

interface ScopeProps {
  onStart: (eventType?: WizardEventType) => void;
}

export default function Scope({ onStart }: ScopeProps) {
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

  const handleCTA = () => {
    trackGA('cotizador_iniciado', { origen: 'alcance' });
    trackClarity('cotizador_iniciado_alcance');
    onStart();
  };

  return (
    <section className="py-16 md:py-24" aria-label="Alcance del paquete de bebidas">
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12 max-w-3xl">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight mb-3">
            Tu evento no es igual a ningún otro.{' '}
            <span className="block">Tu paquete de bebidas tampoco.</span>
          </h2>
          <p className="text-edb-muted text-base md:text-lg">
            No resolvemos solo la barra de tragos. Podés cubrir todo el item bebidas de tu
            evento en un solo lugar, calculado a tu medida.
          </p>
        </motion.div>

        <motion.div
          {...fadeUp(0.1)}
          className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6"
        >
          {CATEGORIES.map((name) => (
            <div
              key={name}
              className="flex items-center gap-3 p-4 bg-edb-card border border-edb-border rounded-xl"
            >
              <div
                className="w-2 h-2 rounded-full bg-edb-gold flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-sm text-edb-text font-medium">{name}</span>
            </div>
          ))}
        </motion.div>

        {/* Nota honesta sobre el alcance por estilo — no omitir */}
        <motion.p
          {...fadeUp(0.18)}
          className="text-xs text-edb-muted mb-8 max-w-2xl leading-relaxed"
        >
          El alcance completo es nuestra Experiencia Completa. También podés elegir un estilo
          más acotado (por ejemplo, solo barra y cervezas, o solo vinos y espumantes).
        </motion.p>

        <motion.div {...fadeUp(0.24)}>
          <button
            onClick={handleCTA}
            className="inline-flex items-center bg-edb-gold-cta text-edb-base font-bold py-3 px-8 rounded-xl text-sm hover:bg-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta focus-visible:ring-offset-2 focus-visible:ring-offset-edb-base"
          >
            Armá tu paquete
          </button>
        </motion.div>

      </div>
    </section>
  );
}
