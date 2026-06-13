import { useEffect, useRef } from 'react';
import Nav from './Nav';
import Footer from './Footer';
import StickyCTA from './StickyCTA';
import Hero from './sections/Hero';
import Fears from './sections/Fears';
import Scope from './sections/Scope';
import HowItWorks from './sections/HowItWorks';
import { trackClarity, trackGA } from '../app/utils';
import type { WizardEventType } from '../app/App';

interface LandingProps {
  onStart: (eventType?: WizardEventType) => void;
  onPrefetch: () => void;
}

export default function Landing({ onStart, onPrefetch }: LandingProps) {
  const heroRef = useRef<HTMLElement>(null);

  // Evento de vista de la landing
  useEffect(() => {
    trackClarity('landing_vista');
    trackGA('landing_vista');
  }, []);

  // Prefetch del chunk del wizard cuando el hero entra en viewport
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onPrefetch(); },
      { threshold: 0.1 }
    );
    io.observe(hero);
    return () => io.disconnect();
  }, [onPrefetch]);

  return (
    <div className="bg-edb-base text-edb-text min-h-screen">
      <Nav startWizard={onStart} />

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section ref={heroRef} className="min-h-screen pt-14" aria-label="Hero">
          <Hero onStart={onStart} />
        </section>

        {/* ── Miedos del organizador ─────────────────────────────────── */}
        <Fears />

        {/* ── Alcance del paquete (vidriera, sin cantidades) ─────────── */}
        <Scope onStart={onStart} />

        {/* ── Cómo funciona (tira compacta) ──────────────────────────── */}
        <HowItWorks onStart={onStart} />

        {/* ── SLOT: WhyEDB ───── 13 años, 2 locales, 400+ eventos */}
        {/* <WhyEDB onStart={onStart} /> */}

        {/* ── SLOT: SocialProof ─ testimonios */}
        {/* <SocialProof /> */}

        {/* ── SLOT: FAQ */}
        {/* <FAQ /> */}

        {/* ── SLOT: FinalCTA */}
        {/* <FinalCTA onStart={onStart} /> */}
      </main>

      <Footer />
      <StickyCTA startWizard={onStart} heroRef={heroRef} />
    </div>
  );
}
