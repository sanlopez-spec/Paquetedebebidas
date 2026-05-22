import { Heart, Cake, Briefcase, PartyPopper } from 'lucide-react';

export const pricePercentages = {
  base: {
    spirits: 0.27,
    cerveza: 0.22,
    vinos: 0.22,
    espumante: 0.12,
    gaseosas: 0.17
  },
  premium: {
    spirits: 0.30,
    cerveza: 0.19,
    vinos: 0.21,
    espumante: 0.15,
    gaseosas: 0.15
  },
  icon: {
    spirits: 0.28,
    cerveza: 0.18,
    vinos: 0.26,
    espumante: 0.185,
    gaseosas: 0.095
  }
};

export const bottleSizes = {
  spirits: 750,
  vinos: 750,
  espumante: 750,
  gaseosas: 2250,
  cerveza: 333.33
};

export const packagesData = {
  social: {
    name: 'SOCIAL',
    description: 'Reuniones íntimas',
    quantities: { spirits: 30, vinos: 30, espumante: 18, gaseosas: 76, cerveza: 120 },
    packages: [
      { quality: 'BASE', price: 15500, bebidasBase: 4, bebidasPremium: 0, bebidasIcon: 0 },
      { quality: 'PREMIUM', price: 19000, bebidasBase: 4, bebidasPremium: 2, bebidasIcon: 0 },
      { quality: 'ICON', price: 30000, bebidasBase: 4, bebidasPremium: 4, bebidasIcon: 2 }
    ]
  },
  fiesta: {
    name: 'FIESTA',
    description: 'Celebraciones medianas',
    quantities: { spirits: 45, vinos: 45, espumante: 24, gaseosas: 114, cerveza: 192 },
    packages: [
      { quality: 'BASE', price: 23500, bebidasBase: 4, bebidasPremium: 0, bebidasIcon: 0 },
      { quality: 'PREMIUM', price: 27500, bebidasBase: 4, bebidasPremium: 2, bebidasIcon: 0 },
      { quality: 'ICON', price: 44000, bebidasBase: 4, bebidasPremium: 4, bebidasIcon: 2 }
    ]
  },
  barraLibre: {
    name: 'BARRA LIBRE',
    description: 'Experiencia completa',
    quantities: { spirits: 60, vinos: 60, espumante: 30, gaseosas: 152, cerveza: 240 },
    packages: [
      { quality: 'BASE', price: 30000, bebidasBase: 4, bebidasPremium: 0, bebidasIcon: 0 },
      { quality: 'PREMIUM', price: 36000, bebidasBase: 4, bebidasPremium: 2, bebidasIcon: 0 },
      { quality: 'ICON', price: 59000, bebidasBase: 4, bebidasPremium: 4, bebidasIcon: 2 }
    ]
  }
};

export const bebidasOptions = {
  base: ['Fernet Branca', 'Aperol', 'Campari', 'Cynar', 'Smirnoff', 'Skyy', 'Gin Brightons', 'Gin Gordons', 'Cachaza Velho Barreiro', 'Ron Havana Club', 'Cinzano Rosso', 'Lunfa', 'Malibu'],
  premium: ['Johnnie Walker Red Label', 'Gin Tanqueray', 'Bombay', 'Beefeater', 'Absolut Blue', 'Havana 7 años', 'Vermut Vincenzo', 'Baileys', 'Jagermeister', 'Jose Cuervo'],
  icon: ['Johnnie Walker Double Black Label', 'Johnnie Walker Black Label', 'Jack Daniels', 'Chivas 12 Años', 'Gin Hendricks', 'Beefeater 24', 'Nordes Gin', 'Vermut Yzaguirre', 'Sheridans', 'Amarula', 'Vodka Pravda', 'Ron Santa Teresa Añejo', 'Tequila Herradura']
};

export const vinosOptions = {
  base: ['Nicasia', 'Escorihuela Gascon', 'Saint Felicien'],
  premium: ['DV Catena', 'Salentein Numina', 'Escorihuela GR', 'Luigi Bosca'],
  icon: ['Angelica Zapata', 'El Enemigo', 'Yacochuya', 'Bressia', 'Pulenta']
};

export const espumanteOptions = {
  base: ['Salentein', 'Cruzat Premier'],
  premium: ['Cruzat Cuvee', 'Salentein Alyda', 'Casa Boher'],
  icon: ['Cruzat Single Vineyard', 'DV Catena', 'Baron B Extra Brut']
};

export const cervezasOptions = {
  base: ['Heineken', 'Stella Artois'],
  premium: ['Heineken', 'Stella Artois', 'Corona'],
  icon: ['Heineken', 'Stella', 'Corona', 'Peroni', 'Estrella de Galicia', 'Bitburger']
};

export const paxOptions = [50, 75, 100, 150, 200, 250, 300, 400];

export const eventTypes = [
  { key: 'casamiento', label: 'Casamiento', icon: Heart },
  { key: 'cumpleanos', label: 'Cumpleaños / 15 Años', icon: Cake },
  { key: 'empresarial', label: 'Evento Empresarial', icon: Briefcase },
  { key: 'juntada', label: 'Juntada / Otro', icon: PartyPopper }
];

export const packageConfig = {
  bodega: {
    key: 'bodega',
    title: 'Vinos & Espumantes',
    emoji: '🍷',
    includes: ['Vinos Tintos y Blancos', 'Espumantes', 'Agua Mineral'],
    categories: { spirits: false, vinos: true, espumante: true, gaseosas: false, cerveza: false }
  },
  cocktails: {
    key: 'cocktails',
    title: 'Barra & Cerveza',
    emoji: '🍹',
    includes: ['Destilados y Aperitivos', 'Cervezas', 'Gaseosas y Mixers', 'Agua Mineral'],
    categories: { spirits: true, vinos: false, espumante: false, gaseosas: true, cerveza: true }
  },
  completo: {
    key: 'completo',
    title: 'Experiencia Completa',
    emoji: '👑',
    includes: ['Destilados y Aperitivos', 'Cervezas', 'Vinos Tintos y Blancos', 'Espumantes', 'Gaseosas y Mixers', 'Agua Mineral'],
    categories: { spirits: true, vinos: true, espumante: true, gaseosas: true, cerveza: true }
  }
};

export const WHATSAPP_NUMBER = '5491165803342';
