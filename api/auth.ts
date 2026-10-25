// Login de socios: /api/auth?accion=pedir | entrar | salir | sesion
//   pedir  (POST {email})   → manda el código de 6 dígitos por mail. Responde siempre lo mismo, sea o no socio.
//   entrar (POST {codigo})  → si el código es el del desafío vigente, abre la sesión (cookie de 90 días).
//   salir  (POST)           → cierra la sesión.
//   sesion (GET)            → quién está entrado y a qué cavas puede entrar.
import {
  COOKIE_DESAFIO, COOKIE_SESION, CODIGO_MIN, MAX_INTENTOS, MAX_PEDIDOS_IP, MAX_PEDIDOS_MAIL,
  anotar, borrarCookie, cavasDe, codigoDe, contar, cookie, cookieSesion, dormir, firmar, huella, ipDe,
  leerCookies, leerJson, mandarCodigo, normalizarMail, nuevoNonce, ponerCookies, sesionDe, usuarioPorMail, verificar,
} from './_lib/sesion.js';

const MENSAJE_PEDIDO = 'Si tu mail está registrado, te llega el código.';

function responder(res: any, estado: number, cuerpo: object) {
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(estado).json(cuerpo);
}

export default async function handler(req: any, res: any) {
  const accion = String(req.query?.accion ?? '');
  try {
    if (accion === 'sesion') return await sesion(req, res);
    if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido' });
    if (accion === 'pedir') return await pedir(req, res);
    if (accion === 'entrar') return await entrar(req, res);
    if (accion === 'salir') {
      ponerCookies(res, borrarCookie(COOKIE_SESION), borrarCookie(COOKIE_DESAFIO, '/api'));
      return responder(res, 200, { ok: true });
    }
    return responder(res, 404, { error: 'No existe' });
  } catch (e) {
    console.error('[api/auth]', accion, String(e).slice(0, 200));
    return responder(res, 500, { error: 'No pudimos procesar el pedido. Probá de nuevo en unos minutos.' });
  }
}

async function pedir(req: any, res: any) {
  const body = await leerJson(req);
  const email = normalizarMail(body.email);
  if (!email) return responder(res, 400, { error: 'Revisá el mail: no parece válido.' });

  // límites: por mail y por IP
  const claveMail = huella(`mail|${email}`), claveIp = huella(`ip|${ipDe(req)}`);
  if (await contar(claveMail, 'pedido', 15 * 60_000) >= MAX_PEDIDOS_MAIL || await contar(claveIp, 'pedido-ip', 3600_000) >= MAX_PEDIDOS_IP) {
    return responder(res, 429, { error: 'Pediste varios códigos seguidos. Esperá unos minutos y probá de nuevo.' });
  }
  await anotar(claveMail, 'pedido');
  await anotar(claveIp, 'pedido-ip');

  // el desafío se emite siempre (sea o no socio); el código sale de él, no se guarda
  const nonce = nuevoNonce();
  const desafio = firmar({ e: email, n: nonce, x: Date.now() + CODIGO_MIN * 60_000 }, 'desafio');
  const usuario = await usuarioPorMail(email);
  if (usuario) {
    try { await mandarCodigo(email, codigoDe(nonce, email)); }
    catch (e) { console.error('[api/auth] no se pudo mandar el mail:', String(e).slice(0, 160)); }
  } else {
    await dormir(450);   // parecido a lo que tarda mandar un mail: no delata quién es socio
  }
  ponerCookies(res, cookie(COOKIE_DESAFIO, desafio, CODIGO_MIN * 60, '/api'));
  return responder(res, 200, { ok: true, mensaje: MENSAJE_PEDIDO, venceEnMin: CODIGO_MIN });
}

async function entrar(req: any, res: any) {
  const body = await leerJson(req);
  const codigo = String(body.codigo ?? '').replace(/\D/g, '');
  const d = verificar<{ e: string; n: string }>(leerCookies(req)[COOKIE_DESAFIO], 'desafio');
  if (!d || codigo.length !== 6) {
    return responder(res, 400, { error: d ? 'El código tiene 6 números.' : 'El código venció o no lo pediste. Pedí uno nuevo.', nuevo: !d });
  }
  const claveDesafio = huella(`desafio|${d.n}`);
  if (await contar(claveDesafio, 'intento', CODIGO_MIN * 60_000) >= MAX_INTENTOS) {
    ponerCookies(res, borrarCookie(COOKIE_DESAFIO, '/api'));
    return responder(res, 429, { error: 'Demasiados intentos. Pedí un código nuevo.', nuevo: true });
  }
  await anotar(claveDesafio, 'intento');
  const esperado = codigoDe(d.n, d.e);
  const bien = esperado.length === codigo.length && esperado.split('').every((c, i) => c === codigo[i]);
  const usuario = bien ? await usuarioPorMail(d.e) : null;
  if (!bien || !usuario) {
    await dormir(350);
    const usados = await contar(claveDesafio, 'intento', CODIGO_MIN * 60_000);
    return responder(res, 401, { error: 'Ese código no es correcto.', intentosRestantes: Math.max(0, MAX_INTENTOS - usados) });
  }
  ponerCookies(res, cookieSesion(usuario.id), borrarCookie(COOKIE_DESAFIO, '/api'));
  const cavas = await cavasDe(usuario);
  return responder(res, 200, { ok: true, usuario: { nombre: usuario.nombre, email: usuario.email, admin: usuario.admin }, cavas });
}

async function sesion(req: any, res: any) {
  const u = await sesionDe(req);
  if (!u) {
    if (leerCookies(req)[COOKIE_SESION]) ponerCookies(res, borrarCookie(COOKIE_SESION));   // cookie vieja o de alguien que ya no está
    return responder(res, 200, { sesion: false });
  }
  const cavas = await cavasDe(u);
  return responder(res, 200, { sesion: true, usuario: { nombre: u.nombre, email: u.email, admin: u.admin }, cavas });
}
