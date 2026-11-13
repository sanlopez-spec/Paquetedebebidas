// /club/condiciones: las condiciones del Club EDB. Los montos que definen el acuerdo van en USD, con su equivalente en pesos
// (modo comercial, dólar oficial del mes que trae /api/cava) al lado y en gris.
import { useEffect } from 'react';
import { Link } from 'react-router';
import './club.css';
import './condiciones.css';
import { ponerDolar, useDinero } from './montos';
import { LineaComercial } from './Dinero';

// "(hoy desde $79.000)" en gris; sin dólar no se muestra nada
function Hoy({ monto, desde = false }: { monto: string; desde?: boolean }) {
  return <span className="cond-peso"> (hoy {desde ? 'desde ' : ''}{monto})</span>;
}

export default function ClubCondiciones() {
  const { dolar, cuota, chico } = useDinero();
  useEffect(() => {
    document.title = 'Condiciones del Club EDB';
    fetch('/api/cava').then(r => r.json()).then((d: any) => ponerDolar(d?.dolar)).catch(() => {});
  }, []);

  return (
    <div className="club-root cond-root">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="crest" viewBox="0 0 60 72">
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="currentColor" strokeWidth="2.5"/>
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="rgba(169,132,60,.08)"/>
          <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M30 34 V48 M23 49 H37" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="30" cy="14" r="1.6" fill="currentColor"/>
        </symbol>
      </svg>

      <div className="wrap">
        <div className="topbar">
          <div className="brandmark">
            <svg className="crest" style={{ color: 'var(--burgundy)' }}><use href="#crest" /></svg>
            <b>Club EDB</b>
            <span className="reg-small reg">Vinos de guarda · desde 2021</span>
          </div>
          <div className="topbar-acc">
            <Link to="/club" className="btn btn-ghost">← Volver al club</Link>
          </div>
        </div>
      </div>

      <main className="cond-wrap">
        <h1 className="cond-h1">Condiciones del Club EDB</h1>

        <h2>1. Qué es el club</h2>
        <p>El Club EDB arma y cuida tu cava. Vos fijás un presupuesto mensual y EDB elige y compra los vinos según tu gusto, los guarda y los deja añejar. No es una caja mensual: no hay una cantidad fija de botellas por mes y no elegís vinos de un catálogo. EDB compra cuando aparece una buena oportunidad, con todos los estilos y regiones.</p>
        <p>Podés sumarte solo (cava individual) o con amigos (cava grupal). Los dos formatos tienen los mismos beneficios. En la cava grupal, el contacto con EDB es el presidente del club, y las juntadas las organiza el grupo por su cuenta.</p>

        <h2>2. Planes</h2>
        <div className="cond-tabla">
          <table>
            <thead>
              <tr><th></th><th>Reserva</th><th>Gran Reserva</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Cuota mensual</th>
                <td>USD 50 a 99{dolar && <Hoy monto={cuota(50)} desde />}</td>
                <td>USD 100 en adelante{dolar && <Hoy monto={cuota(100)} desde />}</td>
              </tr>
              <tr>
                <th scope="row">Descuento sobre el precio sugerido de bodega</th>
                <td>Hasta 30 %</td>
                <td>Hasta 40 %</td>
              </tr>
              <tr>
                <th scope="row">Guarda incluida</th>
                <td>30 botellas</td>
                <td>60 botellas</td>
              </tr>
              <tr>
                <th scope="row">Guarda extra, por botella al mes</th>
                <td>USD 0,15{dolar && <Hoy monto={chico(0.15)} />}</td>
                <td>USD 0,10{dolar && <Hoy monto={chico(0.10)} />}</td>
              </tr>
              <tr>
                <th scope="row">Prioridad en vinos escasos</th>
                <td>—</td>
                <td>✓</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LineaComercial texto="condiciones" />
        <p>El monto lo elegís vos y el plan sale solo: desde USD 100 es Gran Reserva. En una cava grupal cuenta la suma de las cuotas de todos.</p>

        <h2>3. Cuota</h2>
        <p>La cuota se define en dólares y se paga del 1 al 10 de cada mes, en efectivo o por transferencia, en dólares o en pesos al dólar oficial del mes (Banco Nación, tipo vendedor). El primer día hábil de cada mes se fija el tipo de cambio que vale para todo ese mes. Así tu presupuesto de compra mantiene su valor y nunca hay que avisarte un aumento: el monto en pesos se mueve solo, junto con el dólar.</p>
        <p>Es una suscripción mensual: se compra todos los meses, sin pausas.</p>

        <h2>4. Presupuesto de compra</h2>
        <ul>
          <li>La cuota es tu presupuesto de compra. Lo que no se usa en un mes queda a tu favor para el mes siguiente, y puede tardar hasta dos meses en usarse.</li>
          <li>Si aparece una buena oportunidad, EDB puede adelantar parte del presupuesto del mes siguiente.</li>
          <li>En la app ves todo: qué se compró, cuánto se usó y el saldo de cada mes.</li>
        </ul>

        <h2>5. Si no se paga la cuota</h2>
        <p>La cuota corre como deuda y las compras siguen. Mientras haya deuda no se retiran ni se envían botellas. La deuda se salda en dinero o con botellas de tu cava, al precio que se pagaron.</p>

        <h2>6. Guarda</h2>
        <ul>
          <li>Elegís dónde guardar: en la cava del club, en tu casa o una parte en cada lugar.</li>
          <li>La guarda incluida (30 o 60 botellas) se cuenta solo sobre lo que está guardado con el club, en botellas de 750 ml: un Magnum cuenta como 2 y un Jeroboam como 4.</li>
          <li>Por lo que pase de la guarda incluida se paga el precio de guarda extra de tu plan. Hasta ese número, la guarda no se cobra.</li>
          <li>Retiros con 72 horas de aviso. Tenés un envío sin cargo cada dos meses dentro del AMBA.</li>
        </ul>

        <h2>7. Baja</h2>
        <ul>
          <li>Se pide con aviso antes del día 1 del mes.</li>
          <li>Tenés 90 días para retirar tus botellas sin costo. Pasado ese plazo, como ya no tenés plan, la guarda se cobra a USD 0,15{dolar && <Hoy monto={chico(0.15)} />} por botella al mes.</li>
          <li>El saldo a tu favor se usa en una última compra.</li>
          <li>En una cava grupal, la cava es del grupo: el reparto de las botellas lo acuerda el grupo.</li>
        </ul>

        <h2>8. La app</h2>
        <p>Desde el celular ves tu cava: las compras de cada mes, tu presupuesto y saldo, la evolución de la colección y un informe anual. Marcás las botellas que abrís y las puntuás, para que EDB conozca tu gusto. Todos los montos se registran en dólares y la app te los muestra en pesos al dólar oficial del mes; con el botón $ / USD podés verlos en dólares.</p>

        <h2>9. Referidos</h2>
        <p>Si traés a alguien al club, sumás beneficios. Detalle en <Link className="ref" to="/club/referidos">edb.com.ar/club/referidos</Link>.</p>

        <h2>10. Cambios en estas condiciones</h2>
        <p>Cualquier cambio se avisa por escrito con 30 días de anticipación.</p>

        <div className="cond-pie">
          <p className="cond-act">Última actualización: noviembre 2026</p>
          <a className="btn btn-solid" href="https://wa.me/5491165803342" target="_blank" rel="noopener noreferrer">Quiero sumarme</a>
        </div>
      </main>
    </div>
  );
}
