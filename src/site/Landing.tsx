import { useEffect, useRef } from 'react';
import SiteHeader from './SiteHeader';
import Footer from './Footer';
import StickyCTA from './StickyCTA';
import Hero from './sections/Hero';
import Scope from './sections/Scope';
import HowItWorks from './sections/HowItWorks';
import WhyEDB from './sections/WhyEDB';
import SocialProof from './sections/SocialProof';
import FAQ from './sections/FAQ';
import FinalCTA from './sections/FinalCTA';
import { trackClarity, trackGA } from '../app/utils';
import type { WizardEventType } from '../app/App';

interface LandingProps {
  onStart: (eventType?: WizardEventType) => void;
  onPrefetch: () => void;
}

export default function Landing({ onStart, onPrefetch }: LandingProps) {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    trackClarity('landing_vista');
    trackGA('landing_vista');
  }, []);

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
      <SiteHeader openInNewTab={true} />

      <main>
        {/* Hero — bg-edb-base ─────────────────────────────────────────────── */}
        <section ref={heroRef} className="pt-14" aria-label="Hero">
          <Hero onStart={onStart} />
        </section>

        {/* Scope — bg-edb-elevated ─────────────────────────────────────────── */}
        <div className="bg-edb-elevated border-t border-edb-border/30">
          <Scope />
        </div>

        {/* HowItWorks — bg-edb-base ───────────────────────────────────────── */}
        <div className="border-t border-edb-border/30">
          <HowItWorks onStart={onStart} />
        </div>

        {/* WhyEDB — bg-edb-elevated (self-contained) ──────────────────────── */}
        <WhyEDB />

        {/* SocialProof — bg-edb-base (self-contained; returns null si vacío) ─ */}
        <SocialProof />

        {/* FAQ — bg-edb-base (self-contained) ─────────────────────────────── */}
        <FAQ />

        {/* FinalCTA — bg-edb-elevated con acento dorado (self-contained) ───── */}
        <FinalCTA onStart={onStart} />
      </main>

      <Footer />
      <StickyCTA startWizard={onStart} heroRef={heroRef} />
    </div>
  );
}
