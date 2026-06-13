import { useState, useEffect, lazy, Suspense, useCallback, useRef } from 'react';
import Landing from './Landing';
import type { WizardEventType } from '../app/App';

const Wizard = lazy(() => import('../app/App'));

export default function Site() {
  const [view, setView] = useState<'landing' | 'wizard'>('landing');
  const [prefillEventType, setPrefillEventType] = useState<WizardEventType | undefined>();

  // Prefetch del chunk del wizard — se llama una sola vez
  const prefetched = useRef(false);
  const prefetch = useCallback(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    import('../app/App').catch(() => {});
  }, []);

  const startWizard = useCallback((eventType?: WizardEventType) => {
    setPrefillEventType(eventType);
    setView('wizard');
    history.pushState({ wizard: true }, '');
  }, []);

  // Cierre desde el botón X del wizard
  const closeWizard = useCallback(() => {
    setView('landing');
    setPrefillEventType(undefined);
    // Reemplazamos el estado wizard para que el back-button no lo reabra
    if (history.state?.wizard) {
      history.replaceState(null, '');
    }
  }, []);

  // Cierre desde el botón ATRÁS del navegador
  useEffect(() => {
    const handlePop = () => {
      setView('landing');
      setPrefillEventType(undefined);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  return (
    <>
      <Landing startWizard={startWizard} onPrefetch={prefetch} />
      {view === 'wizard' && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-edb-base/95 flex items-center justify-center z-50">
              <div className="text-edb-muted text-sm">Cargando cotizador…</div>
            </div>
          }
        >
          <Wizard initialEventType={prefillEventType} onExit={closeWizard} />
        </Suspense>
      )}
    </>
  );
}
