import { motion, useReducedMotion } from 'motion/react';

// Cargá los testimonios acá. Si el array está vacío, la sección no se renderiza (return null).
// Formato de cada objeto:
//   foto:       ruta relativa desde /public — ej. '/images/testimonios/ana.jpg'
//   texto:      el texto de la reseña/testimonio
//   autor:      nombre de quien da el testimonio
//   tipoEvento: tipo de evento — ej. 'Casamiento', '15 Años', 'Evento Corporativo'
// Las imágenes van en public/images/testimonios/
const testimonios: { foto: string; texto: string; autor: string; tipoEvento: string }[] = [];

export default function SocialProof() {
  const reducedMotion = !!useReducedMotion();

  if (testimonios.length === 0) return null;

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
      className="bg-edb-base border-t border-edb-border/30 py-16 md:py-24"
      aria-label="Testimonios de eventos"
    >
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            Eventos que ya confiaron en EDB.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonios.map(({ foto, texto, autor, tipoEvento }, i) => (
            <motion.figure
              key={autor}
              {...fadeUp(0.08 + i * 0.08)}
              className="flex flex-col gap-4 p-5 md:p-6 bg-edb-card border border-edb-border rounded-xl"
            >
              <div className="flex items-center gap-3">
                <img
                  src={foto}
                  alt={autor}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <figcaption className="flex flex-col">
                  <span className="text-edb-text font-semibold text-sm">{autor}</span>
                  <span className="text-edb-muted text-xs">{tipoEvento}</span>
                </figcaption>
              </div>
              <blockquote>
                <p className="text-edb-muted text-sm leading-relaxed">"{texto}"</p>
              </blockquote>
            </motion.figure>
          ))}
        </div>

      </div>
    </section>
  );
}
