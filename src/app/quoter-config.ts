export const quoterConfig = {
  // Matriz tipo de evento: multiplicador por categoria
  eventTypes: {
    casamiento:  { destilados: 1.00, cerveza: 1.00, vino: 1.00, espumante: 1.00, mixers: 1.00, gaseosas: 1.00 },
    cumpleanos:  { destilados: 0.60, cerveza: 0.75, vino: 0.85, espumante: 0.50, mixers: 0.60, gaseosas: 1.35 },
    empresarial: { destilados: 0.75, cerveza: 0.85, vino: 0.90, espumante: 0.70, mixers: 0.75, gaseosas: 1.00 },
    juntada:     { destilados: 0.90, cerveza: 1.10, vino: 0.80, espumante: 0.60, mixers: 0.90, gaseosas: 0.70 },
  },
  // Duracion: coeficiente unico
  duration: {
    corta:    { label: '1-3 horas', coef: 0.70 },
    media:    { label: '4-6 horas', coef: 1.00 },
    larga:    { label: '7+ horas',  coef: 1.25 },
  },
  // Intensidad: coeficiente unico
  intensity: {
    social:     { label: 'SOCIAL',      coef: 1.00 },
    fiesta:     { label: 'FIESTA',      coef: 1.50 },
    barraLibre: { label: 'BARRA LIBRE', coef: 2.00 },
  },
  // Estilo de bebidas: multiplicador por categoria
  style: {
    completo:  { destilados: 1.0, cerveza: 1.0, vino: 1.0, espumante: 1.0, mixers: 1.0, gaseosas: 1.0 },
    cocktails: { destilados: 1.3, cerveza: 1.8, vino: 0.0, espumante: 0.0, mixers: 1.3, gaseosas: 0.0 },
    bodega:    { destilados: 0.0, cerveza: 0.0, vino: 1.6, espumante: 1.4, mixers: 0.0, gaseosas: 1.0 },
  },
  // Consumo base por categoria
  // unitLabel: tamaño del envase legible para el cliente (editable)
  // unitNoun:  sustantivo del envase en plural (editable)
  baseConsumption: {
    destilados: { litrosPorPersona: 0.225, litrosPorEnvase: 0.75, unitLabel: '750ml', unitNoun: 'botellas' },
    cerveza:    { litrosPorPersona: 0.40,  litrosPorEnvase: 0.33, unitLabel: '330ml', unitNoun: 'porrones' },
    vino:       { litrosPorPersona: 0.225, litrosPorEnvase: 0.75, unitLabel: '750ml', unitNoun: 'botellas' },
    espumante:  { litrosPorPersona: 0.12,  litrosPorEnvase: 0.75, unitLabel: '750ml', unitNoun: 'botellas' },
    mixers:     { litrosPorPersona: 0.75,  litrosPorEnvase: 2.00, unitLabel: '2L',    unitNoun: 'botellas' },
    gaseosas:   { litrosPorPersona: 0.75,  litrosPorEnvase: 2.00, unitLabel: '2L',    unitNoun: 'botellas' },
  },
  // Costo mayorista por envase y tier
  costs: {
    destilados: { base: 9200,  premium: 27000, icon: 46000 },
    cerveza:    { base: 2000,  premium: 2200,  icon: 3200  },
    vino:       { base: 7500,  premium: 9000,  icon: 18000 },
    espumante:  { base: 9000,  premium: 13000, icon: 24000 },
    mixers:     { base: 4000,  premium: 4000,  icon: 4000  },
    gaseosas:   { base: 4000,  premium: 4000,  icon: 4000  },
  },
  // Mix de tiers SOLO para destilados (% de botellas en cada tier por plan)
  spiritsMix: {
    BASE:    { base: 1.00,   premium: 0.00,   icon: 0.00   },
    PREMIUM: { base: 0.7333, premium: 0.2667, icon: 0.00   },
    ICON:    { base: 0.60,   premium: 0.2667, icon: 0.1333 },
  },
  // Markup por tier
  markup: { BASE: 1.50, PREMIUM: 1.45, ICON: 1.40 },

  // Banner comparativo en Paso 5 — editar aquí sin tocar el componente
  barraLibreBanner: {
    pctExtra: 30,
    // {pct} se reemplaza con el valor de pctExtra al renderizar
    msgConVinos: '¿Sabías que una barra libre comparable cuesta hasta un {pct}% más, no incluye vinos ni espumantes, y no te quedás con lo que sobra?',
    msgSinVinos: '¿Sabías que una barra libre comparable cuesta hasta un {pct}% más y no te quedás con lo que sobra?',
  },
};
