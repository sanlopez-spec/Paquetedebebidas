import { useEffect, useRef } from 'react';
import Nav from './Nav';
import Footer from './Footer';
import StickyCTA from './StickyCTA';
import Hero from './sections/Hero';
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

        {/* ── SLOT: Fears ────── ¿Que falta o que sobre? */}
        {/* <FearsSection onStart={onStart} /> */}

        {/* ── SLOT: Comparison ─ vs barra libre tradicional */}
        {/* <ComparisonSection /> */}

        {/* ── SLOT: HowItWorks ─ 3 pasos simples */}
        {/* <HowItWorksSection /> */}

        {/* ── SLOT: CalcProof ── transparencia del cálculo */}
        {/* <CalcProofSection /> */}

        {/* ── SLOT: WhyEDB ───── 13 años, 2 locales, 400+ eventos */}
        {/* <WhyEDBSection /> */}

        {/* ── SLOT: SocialProof ─ testimonios */}
        {/* <SocialProofSection /> */}

        {/* ── SLOT: FAQ */}
        {/* <FAQSection /> */}

        {/* ── SLOT: FinalCTA */}
        {/* <FinalCTASection onStart={onStart} /> */}
      </main>

      <Footer />
      <StickyCTA startWizard={onStart} heroRef={heroRef} />
    </div>
  );
}
