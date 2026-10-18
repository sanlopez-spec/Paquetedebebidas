import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import '../club.css';
import './negocios.css';
import { trackClarity, trackGA, trackPixel } from '../../app/utils';

type TipoNeg = 'Restaurante' | 'Wine bar' | 'Hotel' | 'Otro';
type Plan = 'Reserva' | 'Gran Reserva' | 'Ícono';
type BottleType = 'T' | 'B' | 'E';

function planNegocios(b: number): Plan {
  if (b >= 2_000_000) return 'Ícono';
  if (b >= 500_000)   return 'Gran Reserva';
  return 'Reserva';
}

const PLAN_INFO: Record<Plan, { descuento: string; cava: string; frecuencia: string }> = {
  'Reserva':     { descuento: '30%', cava: '30 botellas', frecuencia: 'Mensual' },
  'Gran Reserva':{ descuento: '35%', cava: '50 botellas', frecuencia: 'Cada 15 días' },
  'Ícono':       { descuento: '40%', cava: '130 botellas', frecuencia: 'Cada 15 días' },
};

const TIPOS: TipoNeg[] = ['Restaurante', 'Wine bar', 'Hotel', 'Otro'];

const CARTA_WINES = [
  { nombre: '[Etiqueta y añada]', cepa: 'Cabernet Franc · Valle de Uco', maridaje: 'Va con carnes rojas y guisos', stock: 'Quedan 3', precio: '$ [precio]' },
  { nombre: '[Etiqueta y añada]', cepa: 'Semillón · Mendoza',            maridaje: 'Va con pescados y quesos',     stock: 'Quedan 2', precio: '$ [precio]' },
  { nombre: '[Etiqueta y añada]', cepa: 'Pinot Noir · Patagonia',         maridaje: 'Va con cerdo y hongos',        stock: 'Queda 1',  precio: '$ [precio]' },
  { nombre: '[Etiqueta y añada]', cepa: 'Malbec · Salta',                 maridaje: 'Va con empanadas y parrilla',  stock: 'Quedan 3', precio: '$ [precio]' },
];

// Cava SVG illustration data
const NEG_BOTTLE_ROWS: BottleType[][] = [
  ['T','B','T','B','E','T'],
  ['B','E','T','B','T','B'],
  ['T','B','E','T','B','T'],
  ['E','T','B','T','E','B'],
  ['B','T','B','E','T','B'],
];
const NEG_BOTTLE_XS = [28, 57, 86, 115, 144, 173];
const NEG_BOTTLE_YS = [63, 115, 164, 212, 262];
const NEG_BOTTLE_COLORS: Record<BottleType, { fill: string; inner: string }> = {
  T: { fill: '#52101e', inner: '#2d0810' },
  B: { fill: '#1a3d2e', inner: '#0e1e15' },
  E: { fill: '#8a6d18', inner: '#5a4810' },
};

export default function ClubNegocios() {
  const [searchParams] = useSearchParams();

  const [tipo, setTipo]             = useState<TipoNeg>('Restaurante');
  const [budget, setBudget]         = useState(500_000);
  const [negName, setNegName]       = useState('');
  const [ownerName, setOwnerName]   = useState('');
  const [contact, setContact]       = useState('');
  const [refVal, setRefVal]         = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mobileTab, setMobileTab]   = useState<0 | 1 | 2>(1);

  const negNameRef   = useRef<HTMLInputElement>(null);
  const ownerNameRef = useRef<HTMLInputElement>(null);
  const contactRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = searchParams.get('ref');
    if (r) setRefVal(r);
  }, [searchParams]);

  const plan      = planNegocios(budget);
  const planOk    = budget >= 200_000;
  const planInfo  = PLAN_INFO[plan];
  const budgetFmt = budget.toLocaleString('es-AR');

  async function handleSubmit() {
    if (!negName.trim())   { negNameRef.current?.focus();   return; }
    if (!ownerName.trim()) { ownerNameRef.current?.focus(); return; }
    if (!contact.trim())   { contactRef.current?.focus();   return; }
    if (!planOk) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/negocios-lead', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoNegocio:   tipo,
          presupuesto:   budget,
          nombreNegocio: negName.trim(),
          nombre:        ownerName.trim(),
          celular:       contact.trim(),
          recomienda:    refVal.trim() || null,
          urlOrigen:     window.location.href,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Error del servidor');
      }
      const json = await res.json() as { ok?: boolean };
      if (!json.ok) throw new Error('Error del servidor');
      trackGA('Lead', { content_name: `negocios_${plan.toLowerCase().replace(/ /g, '_')}` });
      trackPixel('Lead');
      trackClarity('negocios_lead');
      setSubmitted(true);
    } catch (_e) {
      setSubmitError('No pudimos enviar los datos. Probá de nuevo o escribínos por WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="club-root neg-root">
      <div className="club-bg-gradient" aria-hidden="true" />

      {/* SVG sprite */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="neg-crest" viewBox="0 0 60 72">
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="#1F3D2D" strokeWidth="2.5"/>
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="rgba(31,61,45,.1)"/>
          <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="#B8924A" strokeWidth="2"/>
          <path d="M30 34 V48 M23 49 H37" fill="none" stroke="#B8924A" strokeWidth="2"/>
          <circle cx="30" cy="14" r="1.6" fill="#B8924A"/>
        </symbol>
      </svg>

      {/* Topbar */}
      <div className="wrap">
        <div className="topbar">
          <div className="brandmark">
            <svg className="crest"><use href="#neg-crest" /></svg>
            <b>Club EDB</b>
            <span className="neg-badge">NEGOCIOS</span>
          </div>
          <a href="#alta" className="btn btn-solid">Sumar mi negocio</a>
        </div>
      </div>

      {/* Hero */}
      <header className="wrap hero">
        <div className="neg-hero-grid">
          <div className="hero-text">
            <h1>Una carta de vinos que nadie más tiene, siempre abastecida.</h1>
            <p className="lede">
              Definís tu presupuesto y nosotros elegimos, reponemos y cargamos en tu carta
              vinos de muchas bodegas, pensados para tu menú.
            </p>
            <p className="lede" style={{ marginTop: 10 }}>
              Te ponemos una cava en el salón y tus comensales eligen desde una carta digital con QR.
            </p>
            <div className="hero-actions">
              <a href="#alta"  className="btn btn-solid">Sumar mi negocio</a>
              <a href="#carta" className="btn btn-ghost">Ver planes</a>
            </div>
          </div>

          <div className="neg-hero-visual">
            <svg className="neg-cava-svg" viewBox="0 0 200 310" fill="none" aria-label="Cava eléctrica en comodato" role="img">
              {/* Cabinet outer body */}
              <rect x="8" y="4" width="184" height="302" rx="10" fill="#0f1e15" stroke="#2B5440" strokeWidth="2.5"/>
              {/* Top control panel */}
              <rect x="9" y="5" width="182" height="30" rx="9" fill="#1F3D2D"/>
              <rect x="9" y="24" width="182" height="11" fill="#1F3D2D"/>
              {/* Temperature display */}
              <rect x="70" y="11" width="60" height="14" rx="2.5" fill="#0a160f" stroke="#B8924A" strokeWidth="1"/>
              <text x="100" y="21.5" textAnchor="middle" fill="#B8924A" fontSize="7.5" fontFamily="monospace">12°C</text>
              {/* Decorative status dots */}
              <circle cx="28" cy="18" r="3" fill="#B8924A" opacity="0.55"/>
              <circle cx="20" cy="18" r="3" fill="#B8924A" opacity="0.3"/>
              {/* Glass door */}
              <rect x="16" y="36" width="168" height="252" rx="4" fill="rgba(170,210,185,0.07)" stroke="#2B5440" strokeWidth="1.5"/>
              {/* Glass shine — left edge */}
              <rect x="20" y="40" width="9" height="244" rx="4.5" fill="rgba(255,255,255,0.08)"/>
              {/* Interior top light strip */}
              <rect x="17" y="36" width="166" height="5" rx="2" fill="rgba(255,250,230,0.1)"/>
              {/* Door handle */}
              <rect x="174" y="148" width="9" height="36" rx="4.5" fill="#B8924A" stroke="#9a7a3e" strokeWidth="0.8"/>
              {/* Hinges */}
              <rect x="13" y="52" width="5" height="12" rx="1.5" fill="#B8924A" opacity="0.5"/>
              <rect x="13" y="266" width="5" height="12" rx="1.5" fill="#B8924A" opacity="0.5"/>
              {/* Shelves */}
              {[90, 140, 188, 236].map(y => (
                <rect key={`shelf-${y}`} x="18" y={y} width="164" height="3" rx="1.5" fill="#2B5440"/>
              ))}
              {/* Bottles — circles viewed from front, lying on shelves */}
              {NEG_BOTTLE_YS.map((cy, ri) =>
                NEG_BOTTLE_ROWS[ri].map((type, bi) => {
                  const c = NEG_BOTTLE_COLORS[type];
                  return (
                    <g key={`b-${ri}-${bi}`}>
                      <circle cx={NEG_BOTTLE_XS[bi]} cy={cy} r="10" fill={c.fill} stroke="rgba(0,0,0,0.25)" strokeWidth="1"/>
                      <circle cx={NEG_BOTTLE_XS[bi]} cy={cy} r="4.5" fill={c.inner}/>
                      <circle cx={NEG_BOTTLE_XS[bi] - 3} cy={cy - 3} r="2" fill="rgba(255,255,255,0.18)"/>
                    </g>
                  );
                })
              )}
              {/* Bottom panel */}
              <rect x="9" y="290" width="182" height="15" fill="#1F3D2D" rx="0"/>
            </svg>
            <span className="neg-cava-label">Cava en comodato</span>
          </div>
        </div>
      </header>

      {/* Carta digital */}
      <section id="carta" className="wrap">
        <div className="neg-carta-grid">
          <div className="neg-carta-text">
            <h2 className="sec-title">Así la ven tus comensales</h2>
            <p className="sec-intro">
              Escanean el QR de la mesa y ven los vinos de tu cava con precio, stock y con qué
              platos van. La carta se actualiza sola cada vez que se despacha una botella.
            </p>
            <ul className="neg-carta-points">
              <li className="neg-point">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="16" y="16" width="3" height="3"/><rect x="14" y="14" width="3" height="3"/>
                </svg>
                <span>Un QR en cada mesa, sin bajar ninguna app.</span>
              </li>
              <li className="neg-point">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                <span>Stock en vivo: la carta se actualiza sola cuando se despacha una botella.</span>
              </li>
              <li className="neg-point">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3h8c0 5-2 8-4 9S8 8 8 3z"/><path d="M12 12v8M9 21h6"/>
                </svg>
                <span>Cada vino con una línea de maridaje para tu menú.</span>
              </li>
            </ul>
          </div>

          <div className="phone-wrap">
            <div className="phone" aria-label="Ejemplo de carta digital en el celular">
              <div className="screen">
                <div className="carta-screen">
                  <div className="carta-top">
                    <div className="carta-top-brand">
                      <svg width="16" height="19" viewBox="0 0 60 72" aria-hidden="true">
                        <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="currentColor" strokeWidth="3"/>
                        <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="#B8924A" strokeWidth="2.5"/>
                        <path d="M30 34 V48 M23 49 H37" fill="none" stroke="#B8924A" strokeWidth="2.5"/>
                      </svg>
                      Carta de vinos
                    </div>
                    <span className="carta-top-rest">[Tu restaurante]</span>
                  </div>
                  <div className="carta-chips">
                    <span className="carta-chip active">Todos</span>
                    <span className="carta-chip">Tintos</span>
                    <span className="carta-chip">Blancos</span>
                    <span className="carta-chip">Espumantes</span>
                    <span className="carta-chip">Precio ↑</span>
                  </div>
                  <div className="carta-wines">
                    {CARTA_WINES.map((w, i) => (
                      <div className="carta-wine" key={i}>
                        <div className="carta-wine-info">
                          <div className="carta-wine-name">{w.nombre}</div>
                          <div className="carta-wine-sub">{w.cepa}</div>
                          <div className="carta-wine-maridaje">{w.maridaje}</div>
                        </div>
                        <div className="carta-wine-right">
                          <div className="carta-wine-price">{w.precio}</div>
                          <div className="carta-wine-stock">{w.stock}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="phone-note">Ejemplo de carta digital.</p>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section id="beneficios" className="wrap">
        <h2 className="sec-title">Beneficios para tu negocio</h2>
        <div className="bgroups">
          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.4"/>
              </svg>
              Ganás más
            </h3>
            <div className="bitem">
              <b>Descuento fijo sobre sugerido de vinoteca</b>
              <span>30, 35 o 40% según tu plan. Ves el precio exacto de cada botella antes de comprar.</span>
            </div>
            <div className="bitem">
              <b>Etiquetas que nadie compara</b>
              <span>Cepas y bodegas distintas, sin la referencia de góndola.</span>
            </div>
            <div className="bitem">
              <b>Sin honorarios</b>
              <span>La selección, la reposición y la carta van incluidas. Solo pagás los vinos.</span>
            </div>
          </div>

          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
              </svg>
              Trabajás menos
            </h3>
            <div className="bitem">
              <b>Una sola cuenta, muchas bodegas</b>
              <span>Un proveedor y una factura, sin abrir cuenta con cada bodega.</span>
            </div>
            <div className="bitem">
              <b>Elegimos y reponemos por vos</b>
              <span>La carta se actualiza sola: tu encargado solo marca lo que despacha.</span>
            </div>
            <div className="bitem">
              <b>Te mostramos qué rota</b>
              <span>En cada revisión te contamos qué se vendió y qué cambiamos.</span>
            </div>
          </div>

          <div className="bgroup">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3h10c0 5-1.5 8-5 8S7 8 7 3zM12 11v9M8 21h8"/>
              </svg>
              Tu salón luce
            </h3>
            <div className="bitem">
              <b>Cava en comodato</b>
              <span>De 30 a 130 botellas según tu plan, sin costo.</span>
            </div>
            <div className="bitem">
              <b>Carta digital con QR</b>
              <span>Filtros, orden por precio, stock y una línea de maridaje para cada vino.</span>
            </div>
            <div className="bitem">
              <b>Eventos con sommelier</b>
              <span>En el plan Ícono, una degustación o cena maridaje por mes con nuestro sommelier.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="selector">
        <div className="wrap">
          <h2 className="sec-title">Planes</h2>

          <div className="neg-plan-bar">
            <button className={`neg-ptab${mobileTab === 0 ? ' on' : ''}`} onClick={() => setMobileTab(0)}>Reserva</button>
            <button className={`neg-ptab${mobileTab === 1 ? ' on' : ''}`} onClick={() => setMobileTab(1)}>Gran Reserva</button>
            <button className={`neg-ptab${mobileTab === 2 ? ' on' : ''}`} onClick={() => setMobileTab(2)}>Ícono</button>
          </div>

          <div className={`compare neg-compare tab-m${mobileTab}`}>
            <table>
              <thead>
                <tr>
                  <th className="feat"></th>
                  <th><div className="plan-tab"><span className="pname">Reserva</span></div></th>
                  <th><div className="plan-tab"><span className="pname">Gran Reserva</span></div></th>
                  <th className="hot"><div className="plan-tab plan-tab-hot"><span className="pname">Ícono</span></div></th>
                </tr>
              </thead>
              <tbody>
                <tr className="pricerow">
                  <td className="feat">
                    <span className="pricerow-label">Presupuesto mensual</span>
                    <span className="compare-feat-note">El monto lo elegís vos</span>
                  </td>
                  <td className="pricerow-amt">$200.000 a $499.999</td>
                  <td className="pricerow-amt">$500.000 a $1.999.999</td>
                  <td className="hot pricerow-amt">$2.000.000<span className="pricerow-amt-sub">en adelante</span></td>
                </tr>
                <tr>
                  <td className="feat">Descuento fijo sobre sugerido de vinoteca</td>
                  <td>30%</td><td>35%</td><td className="hot">40%</td>
                </tr>
                <tr>
                  <td className="feat">Cava en comodato</td>
                  <td>30 botellas</td><td>50 botellas</td><td className="hot">130 botellas</td>
                </tr>
                <tr>
                  <td className="feat">Compras y revisión de la cava</td>
                  <td>Mensual</td><td>Cada 15 días</td><td className="hot">Cada 15 días</td>
                </tr>
                <tr>
                  <td className="feat">Carta digital con QR</td>
                  <td>✓</td><td>✓</td><td className="hot">✓</td>
                </tr>
                <tr>
                  <td className="feat">Prioridad en vinos escasos</td>
                  <td className="no">—</td><td>✓</td><td className="hot">✓</td>
                </tr>
                <tr>
                  <td className="feat">Sommelier para tus eventos</td>
                  <td className="no">—</td><td className="no">—</td><td className="hot"><b>1 por mes</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="compare-note" style={{ marginTop: 18 }}>
            El presupuesto se ajusta todos los meses, avisando antes del día 1. Para cambiar de plan
            y de cava hacen falta 3 meses seguidos en el plan nuevo. Facturamos todas las compras.{' '}
            <em>El evento lo organiza y costea el local; nosotros ponemos el sommelier. No es acumulable.</em>
          </p>
        </div>
      </section>

      {/* Alta */}
      <section id="alta" className="signup">
        <div className="wrap">
          <h2 className="sec-title">Sumá tu negocio</h2>

          {!submitted ? (
            <div className="su-grid">
              <div className="suform">

                <div className="field">
                  <span>Tipo de negocio</span>
                  <div className="neg-tipo-grid">
                    {TIPOS.map(t => (
                      <div key={t} className={`opt${tipo === t ? ' on' : ''}`} onClick={() => setTipo(t)}>
                        <b>{t}</b>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <span>Cuánto ponés por mes</span>
                  <div className="budget-row">
                    <span className="cur">$</span>
                    <input
                      className="in"
                      type="text"
                      inputMode="numeric"
                      value={budget > 0 ? budgetFmt : ''}
                      onChange={e => {
                        const digits = e.target.value.replace(/[^\d]/g, '');
                        setBudget(digits ? Math.max(0, parseInt(digits, 10)) : 0);
                      }}
                    />
                    <span className="bandtag reg neg-bandtag-mob">
                      {planOk ? `Plan ${plan}` : 'Mínimo $200.000'}
                    </span>
                  </div>
                </div>

                <div className="field tight">
                  <input
                    ref={negNameRef}
                    className="in" type="text"
                    placeholder="Nombre del negocio" aria-label="Nombre del negocio"
                    value={negName} onChange={e => setNegName(e.target.value)}
                  />
                </div>

                <div className="field tight">
                  <input
                    ref={ownerNameRef}
                    className="in" type="text"
                    placeholder="Tu nombre" aria-label="Tu nombre"
                    autoComplete="name"
                    value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  />
                </div>

                <div className="field tight">
                  <input
                    ref={contactRef}
                    className="in" type="tel"
                    placeholder="Celular" aria-label="Celular"
                    autoComplete="tel" inputMode="tel"
                    value={contact} onChange={e => setContact(e.target.value)}
                  />
                </div>

                <div className="field">
                  <input
                    className="in" type="text"
                    placeholder="¿Quién te recomendó? (opcional)" aria-label="Quién te recomendó (opcional)"
                    value={refVal} onChange={e => setRefVal(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-solid"
                  style={{ width: '100%', padding: '14px' }}
                  onClick={handleSubmit}
                  disabled={submitting || !planOk}
                >
                  {submitting ? 'Enviando…' : 'Quiero sumar mi negocio'}
                </button>
                {!planOk && budget > 0 && (
                  <p style={{ fontSize: 13, color: '#9a5050', marginTop: 8 }}>
                    El presupuesto mínimo es $200.000 por mes.
                  </p>
                )}
                {submitError && (
                  <div className="submit-error">
                    <p>{submitError}</p>
                    <a
                      className="btn btn-ghost"
                      href="https://wa.me/5491165803342"
                      target="_blank" rel="noopener noreferrer"
                      style={{ marginTop: 10, display: 'inline-block' }}
                    >Escribir por WhatsApp</a>
                  </div>
                )}
              </div>

              <aside className="receipt plan-live" aria-live="polite">
                <h3>Tu plan</h3>
                <div className="rline"><span>Tipo de negocio</span><b>{tipo}</b></div>
                <div className="rline"><span>Presupuesto mensual</span><b>$ {budgetFmt}</b></div>
                <div className="rline"><span>Plan</span><b>{planOk ? plan : '—'}</b></div>
                <div className="rline"><span>Descuento fijo</span><b>{planOk ? planInfo.descuento : '—'}</b></div>
                <div className="rline"><span>Cava</span><b>{planOk ? planInfo.cava : '—'}</b></div>
                <div className="rline"><span>Compras y revisión</span><b>{planOk ? planInfo.frecuencia : '—'}</b></div>
                {plan === 'Ícono' && planOk && (
                  <div className="rline"><span>Sommelier para eventos</span><b>1 por mes</b></div>
                )}
              </aside>
            </div>
          ) : (
            <div
              className="receipt confirm"
              style={{ display: 'block', maxWidth: 560, marginTop: 34 }}
              aria-live="polite"
            >
              <h3>¡Listo! Te escribimos por WhatsApp para armar tu primera selección.</h3>
              <div className="rline"><span>Negocio</span><b>{negName}</b></div>
              <div className="rline"><span>Tipo</span><b>{tipo}</b></div>
              <div className="rline"><span>Presupuesto</span><b>$ {budgetFmt} / mes</b></div>
              <div className="rline"><span>Plan</span><b>{plan}</b></div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="wrap">
        <div className="frow">
          <div className="brandmark">
            <svg className="crest" style={{ width: 26, height: 31 }}>
              <use href="#neg-crest" />
            </svg>
            <span><b>Club EDB Negocios</b> — una sección de Estación de Bebidas</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
