import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: '¿Qué pasa con lo que sobra?',
    a: 'Todo lo que sobra es tuyo: te lo llevás. Las botellas cerradas y también las abiertas que quedaron por la mitad. No perdés nada, a diferencia de una barra libre tradicional.',
  },
  {
    q: '¿A qué zonas hacen envío?',
    a: 'Entregamos en CABA y GBA. El envío sin cargo depende del plan: PREMIUM e ICON incluyen envío sin cargo en CABA y GBA; el plan BASE incluye envío sin cargo en CABA.',
  },
  {
    q: '¿Con cuánta anticipación conviene pedir?',
    // DATO A VALIDAR con Santiago: si hay un mínimo de días de anticipación requerido
    a: 'Cuanto antes mejor para asegurar disponibilidad, sobre todo en temporada alta. Escribinos y coordinamos según la fecha de tu evento.',
  },
  {
    q: '¿Puedo elegir las marcas?',
    a: 'Sí. En cada categoría elegís entre varias marcas, según el nivel de tu paquete. Vos armás tu barra a gusto.',
  },
  {
    q: '¿Atienden eventos de empresa?',
    a: "Sí. Casamientos, cumpleaños y 15, juntadas y eventos corporativos. Podés arrancar el cotizador eligiendo 'Evento Empresarial'.",
  },
];

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
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

  return (
    <section
      className="bg-edb-elevated border-t border-edb-border/30 py-10 md:py-16"
      aria-label="Preguntas frecuentes"
    >
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-8 md:mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            Preguntas frecuentes
          </h2>
        </motion.div>

        <motion.div {...fadeUp(0.08)} className="divide-y divide-edb-border">
          {FAQS.map(({ q, a }, i) => {
            const isOpen = openIdx === i;
            const btnId = `faq-btn-${i}`;
            const panelId = `faq-panel-${i}`;

            return (
              <div key={q}>
                <button
                  id={btnId}
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="w-full flex items-center justify-between gap-4 py-4 text-left text-edb-text font-medium text-sm md:text-base hover:text-edb-gold-readable transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta focus-visible:ring-inset rounded"
                >
                  <span>{q}</span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`flex-shrink-0 text-edb-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-80' : 'max-h-0'}`}
                >
                  <p className="pb-5 text-edb-muted text-sm leading-relaxed">{a}</p>
                </div>
              </div>
            );
          })}
        </motion.div>

      </div>
    </section>
  );
}
