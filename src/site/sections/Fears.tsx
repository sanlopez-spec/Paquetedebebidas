import { motion, useReducedMotion } from 'motion/react';

const CARDS = [
  {
    title: 'Que falte',
    body: 'Calculamos según el tipo de evento, la duración, las personas y el ritmo de tu barra. No te quedás corto.',
    highlighted: false,
  },
  {
    title: 'Que sobre',
    body: 'La medida justa. No pagás de más por lo que no se toma.',
    highlighted: false,
  },
  {
    title: 'Lo que sobra es tuyo',
    body: 'Las botellas sin abrir te las quedás. No las perdés como en una barra libre tradicional.',
    highlighted: true,
  },
];

export default function Fears() {
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
    <section className="py-16 md:py-24" aria-label="Resolvemos tus dos miedos">
      <div className="max-w-6xl mx-auto w-full px-4">

        <motion.div {...fadeUp(0)} className="mb-10 md:mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-semibold text-edb-text leading-tight mb-3">
            El que organiza un evento tiene dos miedos.{' '}
            <span className="text-edb-gold-readable">Los resolvemos los dos.</span>
          </h2>
          <p className="text-edb-muted text-base md:text-lg max-w-2xl">
            Que falte y quedar mal, o que sobre y haber tirado la plata.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CARDS.map(({ title, body, highlighted }, i) => (
            <motion.div
              key={title}
              {...fadeUp(0.1 + i * 0.08)}
              className={`p-6 rounded-2xl border flex flex-col gap-3 ${
                highlighted
                  ? 'bg-edb-card border-edb-gold'
                  : 'bg-edb-card border-edb-border'
              }`}
            >
              <h3
                className={`font-semibold text-base ${
                  highlighted ? 'text-edb-gold-readable' : 'text-edb-text'
                }`}
              >
                {title}
              </h3>
              <p className="text-edb-muted text-sm leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
