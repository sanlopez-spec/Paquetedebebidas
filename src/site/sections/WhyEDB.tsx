import { motion, useReducedMotion } from 'motion/react';

const PILLARS = [
  {
    title: 'Vinoteca desde 2013',
    body: 'Trece años con las puertas abiertas y recorrido real en el rubro.',
  },
  {
    title: 'Dos locales a la calle',
    body: 'Barracas y Flores. Cuando quieras, venís y nos conocés.',
  },
  {
    title: 'Marcas de primera',
    body: 'Catena Zapata, Baron B, Johnnie Walker, Absolut, Fernet Branca, Gin Bombay y más.',
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

        {/* Título — dos oraciones, segunda en dorado */}
        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12 max-w-3xl">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            Detrás de cada paquete, toda nuestra experiencia.{' '}
            <span className="text-edb-gold-readable">Una vinoteca con 14 años.</span>
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

        {/* Franja de reseñas — de las vinotecas físicas, no del servicio de eventos */}
        <motion.div
          {...fadeUp(0.32)}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 p-5 md:p-6 rounded-xl border border-edb-gold/25 bg-edb-card"
        >
          {/* Izquierda: estrellas + claim + aclaración */}
          <div className="flex flex-col gap-1">
            <span className="text-edb-gold-readable text-lg leading-none" aria-hidden="true">
              ★★★★★
            </span>
            <p className="text-edb-text font-semibold text-base leading-snug">
              +300 reseñas reales en Google
            </p>
            <p className="text-edb-muted text-xs">De nuestras dos vinotecas físicas.</p>
          </div>

          {/* Derecha: píldoras por local */}
          <div className="flex flex-row gap-2 flex-shrink-0">
            {REVIEWS.map(({ location, rating }) => (
              <div
                key={location}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-edb-border bg-edb-elevated text-sm"
              >
                <span className="text-edb-muted">{location}</span>
                <span className="text-edb-gold-readable font-bold">{rating} ★</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
