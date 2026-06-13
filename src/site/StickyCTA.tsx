import { useEffect, useState, type RefObject } from 'react';
import type { WizardEventType } from '../app/App';

interface StickyCTAProps {
  startWizard: (eventType?: WizardEventType) => void;
  heroRef: RefObject<HTMLElement>;
}

export default function StickyCTA({ startWizard, heroRef }: StickyCTAProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(!entries[0].isIntersecting),
      { threshold: 0.1 }
    );
    io.observe(hero);
    return () => io.disconnect();
  }, [heroRef]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-edb-base/95 backdrop-blur-md border-t border-edb-border px-4 py-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <button
        onClick={() => startWizard()}
        className="w-full bg-edb-gold-cta text-edb-base font-bold py-3.5 rounded-xl text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edb-gold-cta"
        aria-label="Armá tu paquete de bebidas para el evento"
      >
        Armá tu paquete
      </button>
    </div>
  );
}
