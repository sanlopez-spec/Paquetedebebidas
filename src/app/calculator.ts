import { quoterConfig } from './quoter-config';
import { spiritsSelection } from './data';

export type EventType  = keyof typeof quoterConfig.eventTypes;
export type Duration   = keyof typeof quoterConfig.duration;
export type Intensity  = keyof typeof quoterConfig.intensity;
export type Style      = keyof typeof quoterConfig.style;
export type Quality    = keyof typeof quoterConfig.markup;
export type Category   = keyof typeof quoterConfig.baseConsumption;

export interface CategoryResult {
  envases: number;
  subtotal: number;
}

export interface QuoteResult {
  categories: Partial<Record<Category, CategoryResult>>;
  total: number;
  pricePerPerson: number;
}

export function calculateQuote(input: {
  eventType: EventType;
  duration: Duration;
  pax: number;
  intensity: Intensity;
  style: Style;
  quality: Quality;
}): QuoteResult {
  const { eventType, duration, pax, intensity, style, quality } = input;
  const cfg = quoterConfig;
  const markupFactor = cfg.markup[quality];
  const categories = Object.keys(cfg.baseConsumption) as Category[];
  const result: Partial<Record<Category, CategoryResult>> = {};
  let total = 0;

  for (const cat of categories) {
    const styleMult = cfg.style[style][cat];
    if (styleMult === 0) continue;

    const base = cfg.baseConsumption[cat];
    const litros =
      pax *
      base.litrosPorPersona *
      cfg.eventTypes[eventType][cat] *
      cfg.duration[duration].coef *
      cfg.intensity[intensity].coef *
      styleMult;

    const envases = Math.ceil(litros / base.litrosPorEnvase);

    let costoUnitario: number;
    if (cat === 'destilados') {
      const mix = cfg.spiritsMix[quality];
      costoUnitario =
        cfg.costs.destilados.base    * mix.base +
        cfg.costs.destilados.premium * mix.premium +
        cfg.costs.destilados.icon    * mix.icon;
    } else {
      const qualityKey = quality.toLowerCase() as 'base' | 'premium' | 'icon';
      costoUnitario = (cfg.costs[cat] as Record<'base' | 'premium' | 'icon', number>)[qualityKey];
    }

    const subtotal = envases * costoUnitario * markupFactor;
    result[cat] = { envases, subtotal };
    total += subtotal;
  }

  const pricePerPerson = Math.round(total / pax / 100) * 100;
  return { categories: result, total, pricePerPerson };
}

export function calculateLitersPerPersonDisplay(input: {
  eventType: EventType;
  duration: Duration;
  pax: number;
  intensity: Intensity;
  style?: Style;
}): string {
  const cfg = quoterConfig;
  const style = input.style ?? 'completo';
  const categories = Object.keys(cfg.baseConsumption) as Category[];
  let totalLitros = 0;

  for (const cat of categories) {
    const styleMult = cfg.style[style][cat];
    if (styleMult === 0) continue;
    totalLitros +=
      input.pax *
      cfg.baseConsumption[cat].litrosPorPersona *
      cfg.eventTypes[input.eventType][cat] *
      cfg.duration[input.duration].coef *
      cfg.intensity[input.intensity].coef *
      styleMult;
  }

  return (totalLitros / input.pax).toFixed(1);
}

export function getTotalVarieties(quality: Quality): number {
  const sel = spiritsSelection[quality];
  return sel.base + sel.premium + sel.icon;
}
