import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Testimonios de eventos reales.
// Campos: foto (ruta web desde /public), autor, evento, personas, plan, texto.
// Imágenes en: public/testimonios/ → ej. '/testimonios/wanda-agustin.jpg'
// Si la imagen no existe aún en el servidor, la card cae al placeholder automáticamente
// (onError) y aparece sola cuando se suba el archivo, sin tocar más código.
const testimonios: {
  foto: string;
  autor: string;
  evento: string;
  personas: number;
  plan: string;
  texto: string;
}[] = [
  {
    foto: '/testimonios/wanda-agustin.jpg',
    autor: 'Wanda y Agustín',
    evento: 'Casamiento',
    personas: 80,
    plan: 'ICON',
    texto: 'Perfecto todo, la atención, las entregas, los tiempos y el cumplimiento, IMPECABLES!! RECOMIENDO 100%',
  },
  {
    foto: '/testimonios/sol-federico.jpg',
    autor: 'Sol y Federico',
    evento: 'Casamiento',
    personas: 130,
    plan: 'Premium',
    texto: 'Armamos el plan Premium para nuestro casamiento y nos asesoraron para sumar una selección de vinos de guarda. Se notó tener una vinoteca de verdad atrás. Todos quedaron chochos con la barra.',
  },
  {
    foto: '/testimonios/ornella-guido.jpg',
    autor: 'Ornella y Guido',
    evento: 'Casamiento',
    personas: 100,
    plan: 'Premium',
    texto: 'Nuestro casamiento fue de día así que armamos una barra más tranquila y nos calcularon justo lo que necesitábamos. Otros nos querían cobrar como si fuera una fiesta de noche con barra libre, así que acá terminamos pagando bastante menos. Recomendadísimos.',
  },
];

function PhotoOrPlaceholder({
  foto,
  autor,
  evento,
}: {
  foto: string;
  autor: string;
  evento: string;
}) {
  const [imgError, setImgError] = useState(false);

  if (!foto || imgError) {
    return (
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
    );
  }

  return (
    <img
      src={foto}
      alt={`${evento} de ${autor}`}
      loading="lazy"
      onError={() => setImgError(true)}
      className="w-full aspect-square object-cover"
    />
  );
}

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
          {testimonios.map(({ foto, autor, evento, personas, plan, texto }, i) => (
            <motion.figure
              key={autor}
              {...fadeUp(0.08 + i * 0.08)}
              className="flex flex-col bg-edb-card border border-edb-border rounded-xl overflow-hidden"
            >
              <PhotoOrPlaceholder foto={foto} autor={autor} evento={evento} />

              <div className="flex flex-col gap-3 p-5">
                <figcaption className="flex flex-col gap-1.5">
                  <span className="text-edb-text font-semibold text-sm">{autor}</span>
                  <span className="self-start text-xs px-2 py-0.5 rounded-full border border-edb-gold/40 text-edb-gold-readable">
                    {evento} · {personas} personas · {plan}
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
