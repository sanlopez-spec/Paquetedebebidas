import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import './club.css';
import { trackClarity, trackGA, trackPixel } from '../app/utils';

const LazyClubCava = lazy(() => import('./ClubCava'));

const SLIDES = [
  { src: '/club/tablero-resumen.jpg', alt: 'Tablero: Resumen de la cava' },
  { src: '/club/tablero-cepas.jpg', alt: 'Tablero: Cepas' },
  { src: '/club/tablero-anadas.jpg', alt: 'Tablero: Añadas' },
  { src: '/club/tablero-etiquetas.jpg', alt: 'Tablero: Etiquetas' },
];

function planLabel(total: number) {
  return total >= 100 ? 'Plan Gran Reserva' : 'Plan Reserva';
}

function money(v: number) {
  return v.toLocaleString('es-AR');
}

export default function Club() {
  const [searchParams] = useSearchParams();

  // Slider
  const [slide, setSlide] = useState(0);
  const touchX0 = useRef<number | null>(null);
  const N = SLIDES.length;

  function goSlide(k: number) {
    setSlide(((k % N) + N) % N);
  }

  // Form
  const [fmt, setFmt] = useState<'Individual' | 'Grupal'>('Individual');
  const [home, setHome] = useState('');
  const [budget, setBudget] = useState(50);
  const [count, setCount] = useState(4);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [refVal, setRefVal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);

  // Tablero modal
  type ModalState = 'closed' | 'open' | 'closing';
  const [modalState, setModalState] = useState<ModalState>('closed');
  const scrollYRef = useRef(0);
  const closingRef = useRef(false);
  const isModalVisible = modalState !== 'closed';

  function openModal() {
    scrollYRef.current = window.scrollY;
    document.body.style.overflow = 'hidden';
    history.pushState({ tableroModal: true }, '');
    closingRef.current = false;
    setModalState('open');
    trackClarity('tablero_open');
    trackGA('tablero_open');
    trackPixel('tablero_open');
  }

  function closeModal() {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setModalState('closing');
    setTimeout(() => {
      closingRef.current = false;
      setModalState('closed');
      document.body.style.overflow = '';
      window.scrollTo(0, scrollYRef.current);
    }, reduced ? 0 : 220);
  }

  function closeModalAndPop() {
    if (closingRef.current) return;
    closeModal();
    history.back();
  }

  useEffect(() => {
    if (!isModalVisible) return;

    function onPop() { closeModal(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeModalAndPop(); }

    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [isModalVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill ?ref= URL param
  useEffect(() => {
    const r = searchParams.get('ref');
    if (r) setRefVal(r);
  }, [searchParams]);

  // Derived
  const isGrupal = fmt === 'Grupal';
  const total = isGrupal ? budget * count : budget;
  const isGR = total >= 100;

  function handleSubmit() {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    if (!contact.trim()) { contactRef.current?.focus(); return; }
    setSubmitted(true);
    setTimeout(() => {
      document.getElementById('alta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  const confirmChannel = contact.includes('@') ? 'email' : 'WhatsApp';

  return (
    <div className="club-root">
      <div className="club-bg-gradient" aria-hidden="true" />

      {/* SVG sprite */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="crest" viewBox="0 0 60 72">
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="currentColor" strokeWidth="2.5"/>
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="rgba(169,132,60,.08)"/>
          <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M30 34 V48 M23 49 H37" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="30" cy="14" r="1.6" fill="currentColor"/>
        </symbol>
        <symbol id="ic-person" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </symbol>
        <symbol id="ic-group" viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M2.5 19c0-3.4 2.9-5.4 6.5-5.4s6.5 2 6.5 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M16 5.5a3.4 3.4 0 0 1 0 6.6M17.5 13.8c2.6.4 4.5 2.2 4.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </symbol>
      </svg>

      {/* Topbar */}
      <div className="wrap">
        <div className="topbar">
          <div className="brandmark">
            <svg className="crest" style={{ color: 'var(--burgundy)' }}>
              <use href="#crest" />
            </svg>
            <b>Club EDB</b>
            <span className="reg-small reg">Vinos de guarda · desde 2021</span>
          </div>
          <a href="#alta" className="btn btn-ghost">Sumarme</a>
        </div>
      </div>

      {/* Hero */}
      <header className="wrap hero">
        <div className="hero-grid">
          <div className="hero-text">
            <svg className="hero-crest" style={{ color: 'var(--burgundy)' }}>
              <use href="#crest" />
            </svg>
            <h1>Una cava que crece sola.</h1>
            <p className="lede">
              Definís tu presupuesto y cada mes te asignamos botellas de distintas gamas,
              cepas y añadas, que se añejan en nuestra cava profesional o en tu cava personal.
            </p>
            <p className="lede" style={{ marginTop: 10 }}>
              Arrancá tu colección solo o con un grupo de amigos.
            </p>
            <div className="hero-actions">
              <a href="#alta" className="btn btn-solid">Sumarme al club</a>
              <a href="#colecciones" className="btn btn-ghost">Ver el tablero</a>
            </div>
          </div>
          <figure className="hero-photo ph">
            <span>Foto de la cava</span>
          </figure>
        </div>
      </header>

      {/* Colecciones — tablero del club */}
      <section id="colecciones" className="wrap">
        <div className="tab-grid">
          <div>
            <h2 className="sec-title">Así vas a ver tu cava</h2>
            <p className="sec-intro">
              Este es el tablero del Club EDB #001, donde empezó todo: cada botella que guardan
              y que consumieron. Es la misma herramienta que vas a tener vos.
            </p>
            <div className="tab-stats">
              <div><div className="n">~400</div><div className="l">botellas en guarda</div></div>
              <div><div className="n">~200</div><div className="l">botellas abiertas</div></div>
              <div><div className="n">2021</div><div className="l">guardando desde</div></div>
              <div><div className="n">USD 50</div><div className="l">por socio, por mes</div></div>
            </div>
            <div className="tab-cta">
              <button className="btn btn-solid" type="button" onClick={openModal}>Abrir el tablero</button>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone" aria-label="Capturas del tablero en el celular">
              <div className="screen shots">
                <div
                  className="slider"
                  onTouchStart={e => { touchX0.current = e.touches[0].clientX; }}
                  onTouchEnd={e => {
                    if (touchX0.current === null) return;
                    const dx = e.changedTouches[0].clientX - touchX0.current;
                    if (Math.abs(dx) > 40) goSlide(slide + (dx < 0 ? 1 : -1));
                    touchX0.current = null;
                  }}
                >
                  <div
                    className="slides"
                    style={{ transform: `translateX(-${slide * 100}%)` }}
                  >
                    {SLIDES.map(s => (
                      <div className="slide" key={s.src}>
                        <img src={s.src} alt={s.alt} draggable={false} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="dots">
              {SLIDES.map((s, j) => (
                <button
                  key={j}
                  className={`dot${slide === j ? ' on' : ''}`}
                  aria-label={s.alt}
                  onClick={() => goSlide(j)}
                />
              ))}
            </div>
            <p className="phone-note">Capturas del tablero del Club EDB #001.</p>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section id="beneficios" className="wrap">
        <h2 className="sec-title">Beneficios de Club EDB</h2>
        <div className="bgroups">
          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.4" />
              </svg>
              Pagás menos
            </h3>
            <div className="bitem">
              <b>Hasta 40% de descuento sobre sugerido de bodega</b>
              <span>Ves el ahorro en cada botella.</span>
            </div>
            <div className="bitem">
              <b>Todos los estilos y regiones</b>
              <span>Íconos, joyitas de gama media y todas las cepas, sin importar tu presupuesto.</span>
            </div>
          </div>
          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" />
              </svg>
              Añejás más
            </h3>
            <div className="bitem">
              <b>Guarda profesional incluida</b>
              <span>Cuidamos tus vinos como si fueran nuestros, sin ocupar lugar en tu casa.</span>
            </div>
            <div className="bitem">
              <b>Tu colección arranca con años encima</b>
              <span>Desde el primer mes te asignamos botellas añejadas.</span>
            </div>
          </div>
          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3h10c0 5-1.5 8-5 8S7 8 7 3zM12 11v9M8 21h8" />
              </svg>
              Tomás mejor
            </h3>
            <div className="bitem">
              <b>Tu cava en el celular</b>
              <span>Qué tenés, cuánto lleva guardada cada botella, y un informe de tu colección cada año.</span>
            </div>
            <div className="bitem">
              <b>Aprendemos tu gusto</b>
              <span>Puntuás lo que abrís y afinamos lo que te asignamos.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="selector">
        <div className="wrap">
          <h2 className="sec-title">Dos planes, según cuánto pongas</h2>
          <div className="compare">
            <table>
              <thead>
                <tr>
                  <th className="feat"></th>
                  <th>
                    <span className="pname">Reserva</span>
                    <span className="pprice">USD 50–99<br />por mes</span>
                  </th>
                  <th className="hot">
                    <span className="pname">Gran Reserva</span>
                    <span className="pprice">USD 100+<br />por mes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="feat">Descuento sobre sugerido de bodega</td>
                  <td>Hasta 30%</td>
                  <td className="hot">Hasta 40%</td>
                </tr>
                <tr>
                  <td className="feat">Guarda incluida</td>
                  <td>30 botellas</td>
                  <td className="hot">60 botellas</td>
                </tr>
                <tr>
                  <td className="feat">Guarda extra, por botella al mes</td>
                  <td>USD 0,15</td>
                  <td className="hot">USD 0,10</td>
                </tr>
                <tr>
                  <td className="feat">Tablero de tu cava en el celular</td>
                  <td>✓</td>
                  <td className="hot">✓</td>
                </tr>
                <tr>
                  <td className="feat">Prioridad en vinos escasos</td>
                  <td className="no">—</td>
                  <td className="hot">✓</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="compare-note">El monto exacto lo elegís vos dentro de cada rango.</p>

          <div className="fmt3">
            <h3>2 formatos</h3>
            <div className="fmt3-grid">
              <div className="fo">
                <div className="fh">
                  <svg><use href="#ic-person" /></svg>
                  Individual
                </div>
                <p>Tu presupuesto, tu cava.</p>
                <div className="num"><b>USD 50*</b><small>por mes</small></div>
              </div>
              <div className="fo">
                <div className="fh">
                  <svg><use href="#ic-group" /></svg>
                  Grupal
                </div>
                <p>Suman cuotas y llegan más fácil a Gran Reserva.</p>
                <div className="num"><b>USD 350*</b><small>7 × USD 50 por mes</small></div>
              </div>
            </div>
            <p className="fmt-note">* Montos de ejemplo.</p>
          </div>
          <div className="plans-cta">
            <a href="#alta" className="btn btn-brass">Sumarme al club</a>
          </div>
        </div>
      </section>

      {/* Alta */}
      <section id="alta" className="signup">
        <div className="wrap">
          <h2 className="sec-title">Anotate y coordinamos</h2>

          {!submitted ? (
            <div className="su-grid">
              <div className="suform">
                {/* Formato */}
                <div className="field">
                  <span>Cómo entrás</span>
                  <div className="opts">
                    {(['Individual', 'Grupal'] as const).map(f => (
                      <div
                        key={f}
                        className={`opt${fmt === f ? ' on' : ''}`}
                        onClick={() => setFmt(f)}
                      >
                        <b>{f}</b>
                        <small>{f === 'Individual' ? 'Tu cava' : 'Con amigos'}</small>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Count — Grupal only */}
                {isGrupal && (
                  <div className="field">
                    <span>¿Cuántos son?</span>
                    <input
                      className="in"
                      type="number"
                      min={2}
                      step={1}
                      value={count}
                      inputMode="numeric"
                      onChange={e => setCount(Math.max(2, parseInt(e.target.value, 10) || 2))}
                    />
                  </div>
                )}

                {/* Budget */}
                <div className="field">
                  <span>{isGrupal ? 'Cuánto pone cada uno por mes' : 'Cuánto ponés por mes'}</span>
                  <div className="budget-row">
                    <span className="cur">USD</span>
                    <input
                      className="in"
                      type="number"
                      min={50}
                      step={5}
                      value={budget}
                      inputMode="numeric"
                      onChange={e => setBudget(Math.max(50, parseInt(e.target.value, 10) || 50))}
                    />
                    <span className="bandtag reg">{planLabel(total)}</span>
                  </div>
                  {isGrupal && budget > 0 && count > 0 && (
                    <div className="gtotal">
                      Total del grupo: <b>USD {money(total)} por mes</b>
                    </div>
                  )}
                </div>

                {/* Home wine */}
                <div className="field">
                  <span>¿Ya guardás vino en tu casa?</span>
                  <div className="opts">
                    {['Sí', 'No'].map(h => (
                      <div
                        key={h}
                        className={`opt inline${home === h ? ' on' : ''}`}
                        onClick={() => setHome(h)}
                      >
                        <b>{h}</b>
                        <small>{h === 'Sí' ? 'tengo cava o guardo' : 'arranco de cero'}</small>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div className="field tight">
                  <input
                    ref={nameRef}
                    className="in"
                    type="text"
                    placeholder="Nombre"
                    aria-label="Nombre"
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>

                {/* Contact */}
                <div className="field tight">
                  <input
                    ref={contactRef}
                    className="in"
                    type="tel"
                    placeholder="Celular"
                    aria-label="Celular"
                    autoComplete="tel"
                    inputMode="tel"
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                  />
                </div>

                {/* Referral */}
                <div className="field">
                  <input
                    className="in"
                    type="text"
                    placeholder="¿Quién te recomendó? (opcional)"
                    aria-label="Quién te recomendó (opcional)"
                    value={refVal}
                    onChange={e => setRefVal(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-solid"
                  style={{ width: '100%', padding: '14px' }}
                  onClick={handleSubmit}
                >
                  Quiero sumarme
                </button>
              </div>

              {/* Live plan panel — hidden ≤820px via CSS */}
              <aside className="receipt plan-live" aria-live="polite">
                <h3>Tu plan</h3>
                <div className="rline">
                  <span>Cómo entrás</span>
                  <b>{isGrupal ? (count ? `Grupal, ${count} personas` : 'Grupal') : 'Individual'}</b>
                </div>
                <div className="rline">
                  <span>Por mes</span>
                  <b>{isGrupal ? `USD ${money(total)} el grupo` : `USD ${money(budget)}`}</b>
                </div>
                <div className="rline">
                  <span>Plan</span>
                  <b>{isGR ? 'Gran Reserva' : 'Reserva'}</b>
                </div>
                <div className="rline">
                  <span>Descuento sobre sugerido</span>
                  <b>{isGR ? 'Hasta 40%' : 'Hasta 30%'}</b>
                </div>
                <div className="rline">
                  <span>Guarda incluida</span>
                  <b>{isGR ? '60 botellas' : '30 botellas'}</b>
                </div>
                <div className="rline">
                  <span>Prioridad en vinos escasos</span>
                  <b>{isGR ? 'Sí' : '—'}</b>
                </div>
              </aside>
            </div>
          ) : (
            /* Confirmation */
            <div
              className="receipt confirm"
              style={{ display: 'block', maxWidth: 560, marginTop: 34 }}
              aria-live="polite"
            >
              <h3>Listo, te anotamos</h3>
              <div className="rline"><span>Nombre</span><b>{name}</b></div>
              <div className="rline">
                <span>Cómo entrás</span>
                <b>{isGrupal ? 'Grupal · cava compartida' : 'Individual'}</b>
              </div>
              {isGrupal && (
                <div className="rline"><span>Integrantes</span><b>{count}</b></div>
              )}
              <div className="rline">
                <span>Por mes</span>
                <b>
                  {isGrupal
                    ? `USD ${money(budget)} cada uno · USD ${money(total)} el grupo`
                    : `USD ${money(budget)}`}
                </b>
              </div>
              <div className="rline"><span>Plan</span><b>{planLabel(total)}</b></div>
              <div className="rline"><span>Guarda en casa</span><b>{home || '—'}</b></div>
              {refVal && (
                <div className="rline"><span>Te recomendó</span><b>{refVal}</b></div>
              )}
              <div className="stamp">
                Te escribimos por {confirmChannel} para arrancar.
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="wrap">
        <div className="frow">
          <div className="brandmark">
            <svg className="crest" style={{ color: 'var(--burgundy)', width: 26, height: 31 }}>
              <use href="#crest" />
            </svg>
            <span><b>Club EDB</b> — una sección de Estación de Bebidas</span>
          </div>
          <span className="reg">Vinos de guarda · desde 2021</span>
        </div>
        <p style={{ margin: '18px 0 0' }}>
          <a className="ref" href="/club/referidos">Programa de referidos</a>
        </p>
      </footer>

      {/* Tablero modal — lazy-loaded, opens on "Abrir el tablero" */}
      {isModalVisible && (
        <div
          className={`tablero-overlay${modalState === 'closing' ? ' closing' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Tablero de la cava"
          onClick={closeModalAndPop}
        >
          <div
            className={`tablero-modal-panel${modalState === 'closing' ? ' closing' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="tablero-modal-body">
              {/* drag handle — mobile only */}
              <div className="tablero-handle" aria-hidden="true" />
              {/* sticky close button — always visible when scrolling */}
              <div className="tablero-close-row">
                <button
                  className="tablero-modal-close"
                  type="button"
                  aria-label="Cerrar"
                  onClick={closeModalAndPop}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <Suspense fallback={<div className="tablero-modal-loading">Cargando tablero…</div>}>
                <LazyClubCava />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
