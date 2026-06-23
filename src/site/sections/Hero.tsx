import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { eventTypes } from '../../app/data';
import { trackGA, trackClarity } from '../../app/utils';
import type { WizardEventType } from '../../app/App';

interface HeroProps {
  onStart: (eventType?: WizardEventType) => void;
}

const REASSURANCES = [
  '14 años de experiencia',
  'Envío sin cargo en CABA y GBA',
  '6 cuotas sin interés con BBVA y Banco Ciudad',
];

export default function Hero({ onStart }: HeroProps) {
  const reducedMotion = !!useReducedMotion();

  const slide = (delay = 0) =>
    reducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, ease: 'easeOut', delay },
        };

  const handleSelect = (key: WizardEventType, label: string) => {
    trackGA('opcion_elegida', { paso: 1, campo: 'tipo_evento', opcion: label });
    trackGA('cotizador_iniciado', { origen: 'hero', tipo_evento: key });
    trackClarity('cotizador_iniciado_hero');
    onStart(key);
  };

  return (
    <div className="py-10 md:py-16">
      <div className="max-w-6xl mx-auto w-full px-4 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 items-start">

        {/* ── Columna izquierda: copy ─────────────────────────────────── */}
        <div className="flex flex-col gap-4 lg:gap-8">
          <motion.h1
            {...slide(0)}
            className="font-display text-3xl md:text-5xl lg:text-[3.25rem] font-semibold text-edb-text leading-[1.1] tracking-tight"
          >
            La barra completa para tu evento,{' '}
            calculada al detalle.{' '}
            <span className="block mt-2 text-edb-gold-readable">
              Y lo que sobra, es tuyo.
            </span>
          </motion.h1>

          <motion.p
            {...slide(0.1)}
            className="text-sm md:text-lg text-edb-muted leading-relaxed max-w-lg"
          >
            Decinos qué evento organizás y en 2 minutos te armamos el paquete
            exacto: ni te quedás corto, ni pagás de más. Hasta{' '}
            <strong className="font-semibold text-edb-text">
              30% más barato
            </strong>{' '}
            que una barra libre tradicional.
          </motion.p>
        </div>

        {/* ── Columna derecha: paso 1 + reaseguros ─────────────────────── */}
        <motion.div {...slide(0.15)} className="flex flex-col gap-5">
          {/* Tarjeta paso 1 */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 shadow-2xl ring-1 ring-gray-200">
            <h2 className="text-base font-bold text-gray-900 mb-1 text-center">
              ¿Qué tipo de evento estás organizando?
            </h2>
            <p className="text-sm text-gray-600 mb-5 text-center">
              Para personalizar tu experiencia y calcular las proporciones ideales
            </p>

            <div className="grid grid-cols-2 gap-3">
              {eventTypes.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => handleSelect(key as WizardEventType, label)}
                  className="group flex flex-col items-center justify-center gap-2 p-4 min-h-[88px] rounded-xl border-2 border-gray-200 bg-white hover:border-edb-orange hover:bg-edb-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-orange focus-visible:ring-offset-2 focus-visible:ring-offset-white transition-colors"
                  aria-label={`Cotizá tu ${label}`}
                >
                  <Icon
                    size={22}
                    className="text-gray-400 group-hover:text-edb-orange transition-colors"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-gray-900 leading-tight text-center">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-xs text-gray-600 text-center">
              Empezás acá mismo. Sin registrarte, sin compromiso.
            </p>
          </div>

          {/* Reaseguros debajo de la tarjeta */}
          <ul className="flex flex-wrap gap-x-5 gap-y-2 justify-center lg:justify-start">
            {REASSURANCES.map((text) => (
              <li key={text} className="flex items-center gap-2 text-sm text-edb-muted">
                <Check size={13} className="text-edb-gold-readable flex-shrink-0" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </motion.div>

      </div>
    </div>
  );
}
