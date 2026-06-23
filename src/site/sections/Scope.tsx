import type { ComponentType, SVGProps } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  IconDestilados,
  IconVinos,
  IconEspumantes,
  IconCervezas,
  IconMixers,
  IconGaseosas,
} from '../../app/components/BeverageIcons';

type BeverageIcon = ComponentType<SVGProps<SVGSVGElement>>;

const CATEGORIES: { name: string; icon: BeverageIcon }[] = [
  { name: 'Destilados y aperitivos', icon: IconDestilados },
  { name: 'Vinos',                   icon: IconVinos      },
  { name: 'Espumantes',              icon: IconEspumantes },
  { name: 'Cervezas',                icon: IconCervezas   },
  { name: 'Mixers',                  icon: IconMixers     },
  { name: 'Gaseosas y aguas',        icon: IconGaseosas   },
];

export default function Scope() {
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

  return (
    <section className="py-10 md:py-16" aria-label="Alcance del paquete de bebidas">
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12 max-w-3xl">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight mb-3">
            Tu evento no es igual a ningún otro.{' '}
            <span className="block">
              Tu paquete de bebidas{' '}
              <span className="text-edb-gold-readable">tampoco.</span>
            </span>
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
              className="flex flex-col items-center text-center gap-3 p-5 md:p-6 bg-edb-card border border-edb-border rounded-xl hover:border-edb-gold/50 transition-colors"
            >
              <Icon
                className="h-11 w-auto text-edb-gold-readable"
                aria-hidden="true"
              />
              <span className="text-sm text-edb-text font-medium leading-tight">{name}</span>
            </div>
          ))}
        </motion.div>

        {/* Nota honesta sobre el alcance por estilo — no omitir */}
        <motion.p
          {...fadeUp(0.18)}
          className="text-xs text-edb-muted max-w-2xl leading-relaxed"
        >
          El alcance completo es nuestra Experiencia Completa. También podés elegir un estilo
          más acotado (por ejemplo, solo barra y cervezas, o solo vinos y espumantes).
        </motion.p>

      </div>
    </section>
  );
}
