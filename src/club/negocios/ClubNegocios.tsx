import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import '../club.css';
import './negocios.css';
import { trackClarity, trackGA, trackPixel } from '../../app/utils';

type TipoNeg = 'Restaurante' | 'Wine bar' | 'Hotel' | 'Otro';
type Plan = 'Reserva' | 'Gran Reserva' | 'Ícono';

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

export default function ClubNegocios() {
  const [searchParams] = useSearchParams();

  // Form state
  const [tipo, setTipo]           = useState<TipoNeg>('Restaurante');
  const [budget, setBudget]       = useState(500_000);
  const [negName, setNegName]     = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [contact, setContact]     = useState('');
  const [refVal, setRefVal]       = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<0 | 1 | 2>(1);

  const negNameRef   = useRef<HTMLInputElement>(null);
  const ownerNameRef = useRef<HTMLInputElement>(null);
  const contactRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = searchParams.get('ref');
    if (r) setRefVal(r);
  }, [searchParams]);

  const plan       = planNegocios(budget);
  const planOk     = budget >= 200_000;
  const planInfo   = PLAN_INFO[plan];
  const budgetFmt  = budget.toLocaleString('es-AR');

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
            <svg className="crest">
              <use href="#neg-crest" />
            </svg>
            <b>Club EDB</b>
            <span className="neg-badge">NEGOCIOS</span>
          </div>
          <a href="#alta" className="btn btn-solid">Sumar mi negocio</a>
        </div>
      </div>

      {/* Hero */}
      <header className="wrap hero">
        <div className="hero-grid">
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
        </div>
      </header>

      {/* Carta digital */}
      <section id="carta" className="wrap">
        <div className="tab-grid">
          <div>
            <h2 className="sec-title">Así la ven tus comensales</h2>
            <p className="club-root sec-intro">
              Escanean el QR de la mesa y ven los vinos de tu cava con precio, stock y con qué
              platos van. La carta se actualiza sola cada vez que se despacha una botella.
            </p>
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
              {/* tag / price icon */}
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
          </div>

          <div className="bgroup">
            <h3>
              {/* clock icon */}
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
          </div>

          <div className="bgroup">
            <h3>
              {/* cup icon */}
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
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="selector">
        <div className="wrap">
          <h2 className="sec-title">Planes</h2>

          {/* Mobile tab bar */}
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
                  <th>
                    <div className="plan-tab"><span className="pname">Reserva</span></div>
                  </th>
                  <th>
                    <div className="plan-tab"><span className="pname">Gran Reserva</span></div>
                  </th>
                  <th className="hot">
                    <div className="plan-tab plan-tab-hot"><span className="pname">Ícono</span></div>
                  </th>
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
                  <td>30%</td>
                  <td>35%</td>
                  <td className="hot">40%</td>
                </tr>
                <tr>
                  <td className="feat">Cava en comodato</td>
                  <td>30 botellas</td>
                  <td>50 botellas</td>
                  <td className="hot">130 botellas</td>
                </tr>
                <tr>
                  <td className="feat">Compras y revisión de la cava</td>
                  <td>Mensual</td>
                  <td>Cada 15 días</td>
                  <td className="hot">Cada 15 días</td>
                </tr>
                <tr>
                  <td className="feat">Carta digital con QR</td>
                  <td>✓</td>
                  <td>✓</td>
                  <td className="hot">✓</td>
                </tr>
                <tr>
                  <td className="feat">Prioridad en vinos escasos</td>
                  <td className="no">—</td>
                  <td>✓</td>
                  <td className="hot">✓</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="compare-note" style={{ marginTop: 18 }}>
            El presupuesto se ajusta todos los meses, avisando antes del día 1. Para cambiar de plan
            y de cava hacen falta 3 meses seguidos en el plan nuevo. Facturamos todas las compras.
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

                {/* Tipo de negocio */}
                <div className="field">
                  <span>Tipo de negocio</span>
                  <div className="neg-tipo-grid">
                    {TIPOS.map(t => (
                      <div
                        key={t}
                        className={`opt${tipo === t ? ' on' : ''}`}
                        onClick={() => setTipo(t)}
                      >
                        <b>{t}</b>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Presupuesto ARS */}
                <div className="field">
                  <span>Cuánto ponés por mes</span>
                  <div className="budget-row">
                    <span className="cur">$</span>
                    <input
                      className="in"
                      type="number"
                      min={200_000}
                      step={50_000}
                      value={budget}
                      inputMode="numeric"
                      onChange={e => setBudget(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    />
                    <span className="bandtag reg">
                      {planOk ? `Plan ${plan}` : 'Mínimo $200.000'}
                    </span>
                  </div>
                  <span className="budget-fmt">$ {budgetFmt}</span>
                </div>

                {/* Nombre del negocio */}
                <div className="field tight">
                  <input
                    ref={negNameRef}
                    className="in"
                    type="text"
                    placeholder="Nombre del negocio"
                    aria-label="Nombre del negocio"
                    value={negName}
                    onChange={e => setNegName(e.target.value)}
                  />
                </div>

                {/* Tu nombre */}
                <div className="field tight">
                  <input
                    ref={ownerNameRef}
                    className="in"
                    type="text"
                    placeholder="Tu nombre"
                    aria-label="Tu nombre"
                    autoComplete="name"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                  />
                </div>

                {/* Celular */}
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
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginTop: 10, display: 'inline-block' }}
                    >Escribir por WhatsApp</a>
                  </div>
                )}
              </div>

              {/* Live plan panel */}
              <aside className="receipt plan-live" aria-live="polite">
                <h3>Tu plan</h3>
                <div className="rline">
                  <span>Tipo de negocio</span>
                  <b>{tipo}</b>
                </div>
                <div className="rline">
                  <span>Presupuesto mensual</span>
                  <b>$ {budgetFmt}</b>
                </div>
                <div className="rline">
                  <span>Plan</span>
                  <b>{planOk ? plan : '—'}</b>
                </div>
                <div className="rline">
                  <span>Descuento fijo</span>
                  <b>{planOk ? planInfo.descuento : '—'}</b>
                </div>
                <div className="rline">
                  <span>Cava</span>
                  <b>{planOk ? planInfo.cava : '—'}</b>
                </div>
                <div className="rline">
                  <span>Frecuencia de compra</span>
                  <b>{planOk ? planInfo.frecuencia : '—'}</b>
                </div>
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
