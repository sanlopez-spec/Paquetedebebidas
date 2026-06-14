import { motion, useReducedMotion } from 'motion/react';
import { GlassWater, Wine, Sparkles, Beer, FlaskConical, Droplets } from 'lucide-react';
import { trackGA, trackClarity } from '../../app/utils';
import type { WizardEventType } from '../../app/App';
import type { LucideIcon } from 'lucide-react';

const CATEGORIES: { name: string; icon: LucideIcon }[] = [
  { name: 'Destilados y aperitivos', icon: GlassWater },
  { name: 'Vinos',                   icon: Wine       },
  { name: 'Espumantes',              icon: Sparkles   },
  { name: 'Cervezas',                icon: Beer       },
  { name: 'Mixers',                  icon: FlaskConical },
  { name: 'Gaseosas y aguas',        icon: Droplets   },
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
            No resolvemos solo la barra de tragos. Cubrís todas las bebidas de tu
            evento en un solo lugar, calculadas a tu medida.
          </p>
        </motion.div>

        <motion.div
          {...fadeUp(0.1)}
          className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6"
        >
          {CATEGORIES.map(({ name, icon: Icon }) => (
            <div
              key={name}
              className="flex flex-col gap-3 p-5 md:p-6 bg-edb-card border border-edb-border rounded-xl hover:border-edb-gold/50 transition-colors"
            >
              <Icon
                size={20}
                className="text-edb-gold-readable flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-sm text-edb-text font-medium leading-tight">{name}</span>
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

        {/* CTA solo en desktop — en mobile la sticky bar cubre */}
        <motion.div {...fadeUp(0.24)} className="hidden md:block">
          <button
            onClick={handleCTA}
            className="inline-flex items-center bg-edb-gold-cta text-edb-base font-bold py-3 px-8 rounded-xl text-sm hover:bg-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta focus-visible:ring-offset-2 focus-visible:ring-offset-edb-elevated"
          >
            Calculá tu evento
          </button>
        </motion.div>

      </div>
    </section>
  );
}
