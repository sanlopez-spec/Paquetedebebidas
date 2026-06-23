import { motion, useReducedMotion } from 'motion/react';

// Testimonios de eventos reales.
// Para agregar la foto real: completá el campo `foto` con la ruta desde /public.
//   foto vacío ('') → muestra placeholder dorado.
//   foto con ruta  → muestra la imagen. Ej: '/images/testimonios/wanda-agustin.jpg'
// Imágenes en: public/images/testimonios/
const testimonios: { foto: string; autor: string; tipoEvento: string; texto: string }[] = [
  {
    foto: '',
    autor: 'Wanda y Agustín',
    tipoEvento: 'Casamiento',
    texto: 'Perfecto todo, la atención, las entregas, los tiempos y el cumplimiento, IMPECABLES!! RECOMIENDO 100%',
  },
  {
    foto: '',
    autor: 'Sol y Federico',
    tipoEvento: 'Casamiento',
    texto: 'Armamos el plan Premium para nuestro casamiento y nos asesoraron para sumar una selección de vinos de guarda. Se notó tener una vinoteca de verdad atrás. Todos quedaron chochos con la barra.',
  },
  {
    foto: '',
    autor: 'Ornella y Guido',
    tipoEvento: 'Casamiento',
    texto: 'Nuestro casamiento fue de día así que armamos una barra más tranquila y nos calcularon justo lo que necesitábamos. Otros nos querían cobrar como si fuera una fiesta de noche con barra libre, así que acá terminamos pagando bastante menos. Recomendadísimos.',
  },
];

export default function SocialProof() {
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
      className="bg-edb-base border-t border-edb-border/30 py-10 md:py-16"
      aria-label="Testimonios de eventos"
    >
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight">
            Eventos que ya confiaron en EDB.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonios.map(({ foto, autor, tipoEvento, texto }, i) => (
            <motion.figure
              key={autor}
              {...fadeUp(0.08 + i * 0.08)}
              className="flex flex-col bg-edb-card border border-edb-border rounded-xl overflow-hidden"
            >
              {/* Foto real o placeholder — reemplazá `foto` con la ruta cuando la tengas */}
              {foto ? (
                <img
                  src={foto}
                  alt={autor}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div
                  className="w-full aspect-square bg-edb-base border-b border-edb-gold/25 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-lg border-2 border-dashed border-edb-gold/35 flex items-center justify-center">
                      <span className="text-edb-muted/50 text-xs font-medium">img</span>
                    </div>
                    <span className="text-edb-muted/40 text-[10px] tracking-widest uppercase">
                      Foto
                    </span>
                  </div>
                </div>
              )}

              {/* Contenido de la card */}
              <div className="flex flex-col gap-3 p-5">
                <figcaption className="flex flex-col gap-1.5">
                  <span className="text-edb-text font-semibold text-sm">{autor}</span>
                  <span className="self-start text-xs px-2 py-0.5 rounded-full border border-edb-gold/40 text-edb-gold-readable">
                    {tipoEvento}
                  </span>
                </figcaption>
                <blockquote>
                  <p className="text-edb-muted text-sm leading-relaxed">"{texto}"</p>
                </blockquote>
              </div>
            </motion.figure>
          ))}
        </div>

      </div>
    </section>
  );
}
