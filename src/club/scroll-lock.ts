// Bloqueo del scroll de la página de atrás cuando hay un modal abierto.
//
// Un contador con un único dueño: el primero que pide el bloqueo guarda el
// overflow que había y lo pone en 'hidden'; el último que lo suelta lo
// restaura. Así dos modales superpuestos no se pisan y, sobre todo, nunca
// queda el <body> bloqueado si alguien se olvida de liberar.
//
// Usalo siempre desde un efecto de React, para que el cleanup lo libere
// también al desmontar:
//
//   useEffect(() => { if (!abierto) return; lockScroll(); return unlockScroll; }, [abierto]);

let locks = 0;
let overflowPrevio = '';

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks++ === 0) {
    overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  if (locks === 0) return;
  if (--locks === 0) {
    document.body.style.overflow = overflowPrevio;
    overflowPrevio = '';
  }
}

// Para tests y para salidas de emergencia: suelta todo de una.
export function resetScrollLock(): void {
  if (typeof document === 'undefined') return;
  locks = 0;
  document.body.style.overflow = overflowPrevio;
  overflowPrevio = '';
}
