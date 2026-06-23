import { motion, useReducedMotion } from 'motion/react';
import { MapPin } from 'lucide-react';

const PILLARS = [
  {
    title: 'Vendiendo bebidas desde 2013',
    body: 'Una vinoteca de verdad, con recorrido. No un emprendimiento improvisado.',
  },
  {
    title: '2 locales físicos',
    body: 'Barracas y Flores. Podés venir a vernos.',
  },
  {
    title: 'Marcas que marcan nivel',
    body: 'Trabajamos con marcas como Catena Zapata, Baron B, Johnnie Walker, Absolut, Fernet Branca y Gin Bombay, entre otras.',
  },
];

const REVIEWS = [
  { location: 'Barracas', rating: '4,7' },
  { location: 'Flores',   rating: '4,9' },
];

export default function WhyEDB() {
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
    <section
      className="bg-edb-elevated border-t border-edb-border/30 py-10 md:py-16"
      aria-label="Por qué EDB"
    >
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12 max-w-3xl">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            Detrás del cálculo,{' '}
            <span className="text-edb-gold-readable">una vinoteca con 13 años.</span>
          </h2>
        </motion.div>

        {/* Tres pilares */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 md:mb-12">
          {PILLARS.map(({ title, body }, i) => (
            <motion.div
              key={title}
              {...fadeUp(0.08 + i * 0.08)}
              className="flex flex-col gap-3 p-5 md:p-6 bg-edb-card border border-edb-border rounded-xl"
            >
              <h3 className="text-edb-text font-semibold text-base leading-snug">{title}</h3>
              <p className="text-edb-muted text-sm leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </div>

        {/* Bloque de reseñas — enmarcadas como reseñas de las vinotecas, no de eventos */}
        <motion.div {...fadeUp(0.32)}>
          <p className="text-sm font-semibold text-edb-text mb-4">
            Cientos de reseñas reales en nuestras dos vinotecas
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-3 max-w-md">
            {REVIEWS.map(({ location, rating }) => (
              <div
                key={location}
                className="flex items-center gap-3 p-4 bg-edb-card border border-edb-border rounded-xl flex-1"
              >
                <MapPin
                  size={15}
                  className="text-edb-muted flex-shrink-0"
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-edb-text">{location}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-edb-gold-readable text-sm leading-none"
                      aria-hidden="true"
                    >
                      ★★★★★
                    </span>
                    <span className="text-edb-gold-readable text-sm font-bold">{rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-edb-muted">
            Más de 300 reseñas en Google entre nuestros dos locales.
          </p>
        </motion.div>

      </div>
    </section>
  );
}
