import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import './club.css';
import { trackGA, trackClarity } from '../app/utils';

export default function ClubReferidos() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackGA('referidos_view');
    trackClarity('referidos_view');
  }, []);

  async function handleShare() {
    trackGA('referidos_recomendar');
    trackClarity('referidos_recomendar');
    const url = 'https://edb.com.ar/club';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Club EDB · Vinos de guarda', url });
      } catch (_e) { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (_e) { /* silent */ }
    }
  }

  return (
    <div className="club-root ref-root">
      {/* SVG sprite */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="ref-crest" viewBox="0 0 60 72">
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="currentColor" strokeWidth="2.5"/>
          <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="rgba(169,132,60,.08)"/>
          <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M30 34 V48 M23 49 H37" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="30" cy="14" r="1.6" fill="currentColor"/>
        </symbol>
      </svg>

      <div className="ref-wrap">
        <Link to="/club" className="ref-back">← Volver al club</Link>

        <header className="ref-hero">
          <div className="ref-marca">
            <svg style={{ color: 'var(--brass)', width: 26, height: 31, flex: 'none' }}>
              <use href="#ref-crest" />
            </svg>
            Club EDB
          </div>
          <h1>Traé gente al club. Subí de categoría.</h1>
          <p>Cada amigo o conocido que se hace socio del Club EDB por recomendación tuya es un referido. Con cada referido avanzás, y cada categoría trae su premio.</p>
        </header>

        {/* Camino */}
        <section className="ref-camino" aria-label="Las cinco categorías y cuántos referidos pide cada una">
          <ol>
            <li><span className="ref-hito">1</span><span className="ref-hito-n">Catador</span></li>
            <li><span className="ref-hito">2</span><span className="ref-hito-n">Estibador</span></li>
            <li><span className="ref-hito">3</span><span className="ref-hito-n">Guardián de cava</span></li>
            <li><span className="ref-hito">5</span><span className="ref-hito-n">Coleccionista</span></li>
            <li><span className="ref-hito">8</span><span className="ref-hito-n ref-hito-n-last">Embajador</span></li>
          </ol>
          <p>Referidos que necesitás para cada categoría.</p>
        </section>

        {/* Pasos */}
        <ol className="ref-pasos" aria-label="Cómo funciona">
          <li>Recomendás el Club EDB. La persona se hace socia con su propia cava, individual o grupal.</li>
          <li>A los seis meses como socia, cuenta como tu referido.</li>
          <li>Subís de categoría y elegís tu premio: más guarda o una botella.</li>
        </ol>

        {/* Niveles */}
        <section className="ref-niveles">
          <h2>Las categorías</h2>
          <p className="ref-intro">Todos arrancan como Socio. Con el primer referido, empieza el camino.</p>

          <article className="ref-nivel">
            <div className="ref-cabeza"><span className="ref-nombre">Catador</span><span className="ref-cuantos">1 referido</span></div>
            <p className="ref-verbo">Probás.</p>
            <p className="ref-premio">+10 botellas de guarda <span className="ref-o">o</span> <span className="ref-etiqueta">[Etiqueta y añada]</span></p>
          </article>

          <article className="ref-nivel">
            <div className="ref-cabeza"><span className="ref-nombre">Estibador</span><span className="ref-cuantos">2 referidos</span></div>
            <p className="ref-verbo">Guardás.</p>
            <p className="ref-premio">+20 botellas de guarda <span className="ref-o">o</span> <span className="ref-etiqueta">[Etiqueta y añada]</span></p>
          </article>

          <article className="ref-nivel">
            <div className="ref-cabeza"><span className="ref-nombre">Guardián de cava</span><span className="ref-cuantos">3 referidos</span></div>
            <p className="ref-verbo">Custodiás.</p>
            <p className="ref-premio">+30 botellas de guarda <span className="ref-o">o</span> <span className="ref-etiqueta">[Etiqueta y añada]</span></p>
          </article>

          <article className="ref-nivel">
            <div className="ref-cabeza"><span className="ref-nombre">Coleccionista</span><span className="ref-cuantos">5 referidos</span></div>
            <p className="ref-verbo">Coleccionás.</p>
            <p className="ref-premio">+40 botellas de guarda <span className="ref-o">o</span> <span className="ref-etiqueta">[Etiqueta y añada]</span></p>
          </article>

          <article className="ref-nivel ref-embajador">
            <div className="ref-cabeza"><span className="ref-nombre">Embajador</span><span className="ref-cuantos">8 referidos</span></div>
            <p className="ref-verbo">Representás al club.</p>
            <p className="ref-premio">+50 botellas de guarda <span className="ref-o">o</span> <span className="ref-etiqueta">[Etiqueta y añada]</span></p>
            <div className="ref-cena">
              <h3>Ganás la Cena de los Fundadores</h3>
              <p>Participás de una juntada del Club EDB #001, el club donde empezó todo.</p>
            </div>
          </article>
        </section>

        {/* Elección */}
        <section className="ref-eleccion">
          <h2>Guarda o botella, vos elegís</h2>
          <div className="ref-opciones">
            <div className="ref-opcion"><h3>Guarda</h3><p>Más lugar en tu cava, sin costo.</p></div>
            <div className="ref-opcion"><h3>Botella</h3><p>Si guardás en casa, llevate la del nivel.</p></div>
          </div>
          <p className="ref-nota">La categoría la ganás igual.</p>
        </section>

        {/* Letra chica */}
        <section className="ref-letra">
          <h2>Letra chica, corta</h2>
          <ul>
            <li>Un referido cuenta cuando cumple seis meses como socio. Si se da de baja antes, no cuenta.</li>
            <li>Si armás un club grupal, cada miembro cuenta como referido tuyo.</li>
            <li>Cada socio cuenta como referido una sola vez, al entrar.</li>
            <li>La guarda de regalo es para botellas compradas en el club.</li>
            <li>El seguro de las botellas lo paga cada socio.</li>
          </ul>
        </section>

        {/* CTA */}
        <section className="ref-cierre">
          <button className="ref-boton" onClick={handleShare}>
            {copied ? 'Link copiado' : 'Recomendar el club'}
          </button>
          <div className="ref-firma">Club EDB, de Estación de Bebidas</div>
        </section>
      </div>
    </div>
  );
}
