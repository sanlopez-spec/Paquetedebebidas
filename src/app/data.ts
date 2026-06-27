import { Heart, Cake, Briefcase, PartyPopper } from 'lucide-react';

export const bebidasOptions = {
  base:    ['Fernet Branca', 'Aperol', 'Campari', 'Cynar', 'Smirnoff', 'Skyy', 'Gin Brightons', 'Gin Gordons', 'Cachaza Velho Barreiro', 'Ron Havana Club', 'Cinzano Rosso', 'Lunfa', 'Malibu'],
  premium: ['Johnnie Walker Red Label', 'Gin Tanqueray', 'Bombay', 'Beefeater', 'Absolut Blue', 'Havana 7 años', 'Vermut Vincenzo', 'Baileys', 'Jagermeister', 'Jose Cuervo'],
  icon:    ['Johnnie Walker Double Black Label', 'Johnnie Walker Black Label', 'Jack Daniels', 'Chivas 12 Años', 'Gin Hendricks', 'Beefeater 24', 'Nordes Gin', 'Vermut Yzaguirre', 'Sheridans', 'Amarula', 'Vodka Pravda', 'Ron Santa Teresa Añejo', 'Tequila Herradura'],
};

export const vinosOptions = {
  base:    ['Nicasia', 'Escorihuela Gascon', 'Saint Felicien'],
  premium: ['DV Catena', 'Salentein Numina', 'Escorihuela GR', 'Luigi Bosca'],
  icon:    ['Angelica Zapata', 'El Enemigo', 'Yacochuya', 'Bressia', 'Pulenta'],
};

export const espumanteOptions = {
  base:    ['Salentein', 'Cruzat Premier'],
  premium: ['Cruzat Cuvee', 'Salentein Alyda', 'Casa Boher'],
  icon:    ['Cruzat Single Vineyard', 'DV Catena', 'Baron B Extra Brut'],
};

export const cervezasOptions = {
  base:    ['Heineken', 'Stella Artois'],
  premium: ['Heineken', 'Stella Artois', 'Corona'],
  icon:    ['Heineken', 'Stella', 'Corona', 'Peroni', 'Estrella de Galicia', 'Bitburger'],
};

export const paxOptions = [50, 75, 100, 150, 200, 250, 300, 400];

export const eventTypes = [
  { key: 'casamiento', label: 'Casamiento',           icon: Heart       },
  { key: 'cumpleanos', label: 'Cumpleaños / 15 Años', icon: Cake        },
  { key: 'empresarial', label: 'Evento Empresarial',  icon: Briefcase   },
  { key: 'juntada',    label: 'Juntada / Otro',       icon: PartyPopper },
];

export const packageConfig = {
  bodega: {
    key: 'bodega',
    title: 'Vinos & Espumantes',
    emoji: '🍷',
    includes: ['Vinos Tintos y Blancos', 'Espumantes', 'Agua Mineral'],
    categories: { spirits: false, vinos: true, espumante: true, gaseosas: false, cerveza: false },
  },
  cocktails: {
    key: 'cocktails',
    title: 'Barra & Cerveza',
    emoji: '🍹',
    includes: ['Destilados y Aperitivos', 'Mixers para tus tragos', 'Cervezas'],
    categories: { spirits: true, vinos: false, espumante: false, gaseosas: true, cerveza: true },
  },
  completo: {
    key: 'completo',
    title: 'Experiencia Completa',
    emoji: '👑',
    includes: ['Destilados y Aperitivos', 'Mixers para tus tragos', 'Cervezas', 'Vinos Tintos y Blancos', 'Espumantes', 'Gaseosas y Aguas'],
    categories: { spirits: true, vinos: true, espumante: true, gaseosas: true, cerveza: true },
  },
};

// Cuántas marcas elige el cliente por tier, según el plan. Dato de presentación, no de cálculo.
export const spiritsSelection = {
  BASE:    { base: 4, premium: 0, icon: 0 },
  PREMIUM: { base: 4, premium: 2, icon: 0 },
  ICON:    { base: 4, premium: 4, icon: 2 },
} as const;

export const WHATSAPP_NUMBER = '5491165803342';
export const TIENDA_URL = 'https://estaciondebebidas.com';
