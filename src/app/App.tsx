import { useState } from 'react';
import { Wine, Beer, Droplet, ChevronRight, ChevronLeft, Check, Users, Calendar, Cake, Briefcase, Heart, PartyPopper, X } from 'lucide-react';

const pricePercentages = {
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

const bottleSizes = {
  spirits: 750,
  vinos: 750,
  espumante: 750,
  gaseosas: 2250,
  cerveza: 333.33
};

const packagesData = {
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

const bebidasOptions = {
  base: ['Fernet Branca', 'Aperol', 'Campari', 'Cynar', 'Smirnoff', 'Skyy', 'Gin Brightons', 'Gin Gordons', 'Cachaza Velho Barreiro', 'Ron Havana Club', 'Cinzano Rosso', 'Lunfa', 'Malibu'],
  premium: ['Johnnie Walker Red Label', 'Gin Tanqueray', 'Bombay', 'Beefeater', 'Absolut Blue', 'Havana 7 años', 'Vermut Vincenzo', 'Baileys', 'Jagermeister', 'Jose Cuervo'],
  icon: ['Johnnie Walker Double Black Label', 'Johnnie Walker Black Label', 'Jack Daniels', 'Chivas 12 Años', 'Gin Hendricks', 'Beefeater 24', 'Nordes Gin', 'Vermut Yzaguirre', 'Sheridans', 'Amarula', 'Vodka Pravda', 'Ron Santa Teresa Añejo', 'Tequila Herradura']
};

const vinosOptions = {
  base: ['Nicasia', 'Escorihuela Gascon', 'Saint Felicien'],
  premium: ['DV Catena', 'Salentein Numina', 'Escorihuela GR', 'Luigi Bosca'],
  icon: ['Angelica Zapata', 'El Enemigo', 'Yacochuya', 'Bressia', 'Pulenta']
};

const espumanteOptions = {
  base: ['Salentein', 'Cruzat Premier'],
  premium: ['Cruzat Cuvee', 'Salentein Alyda', 'Casa Boher'],
  icon: ['Cruzat Single Vineyard', 'DV Catena', 'Baron B Extra Brut']
};

const cervezasOptions = {
  base: ['Heineken', 'Stella Artois'],
  premium: ['Heineken', 'Stella Artois', 'Corona'],
  icon: ['Heineken', 'Stella', 'Corona', 'Peroni', 'Estrella de Galicia', 'Bitburger']
};

const paxOptions = [50, 75, 100, 150, 200, 250, 300, 400];

const eventTypes = [
  { key: 'casamiento', label: 'Casamiento', icon: Heart },
  { key: 'cumpleanos', label: 'Cumpleaños / 15 Años', icon: Cake },
  { key: 'empresarial', label: 'Evento Empresarial', icon: Briefcase },
  { key: 'juntada', label: 'Juntada / Otro', icon: PartyPopper }
];

export default function App() {
  const [showHero, setShowHero] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [selectedPax, setSelectedPax] = useState(100);
  const [selectedIntensity, setSelectedIntensity] = useState<'social' | 'fiesta' | 'barraLibre' | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'bodega' | 'cocktails' | 'completo' | null>(null);
  const [selectedCategories, setSelectedCategories] = useState({
    spirits: true,
    vinos: true,
    espumante: true,
    gaseosas: true,
    cerveza: true
  });
  const [selectedQuality, setSelectedQuality] = useState<string | null>('PREMIUM');
  const [expandedSpirits, setExpandedSpirits] = useState<{[key: string]: boolean}>({});
  const [expandedPlans, setExpandedPlans] = useState<string[]>(['PREMIUM']);

  const togglePlanExpand = (quality: string) => {
    setExpandedPlans(prev =>
      prev.includes(quality) ? prev.filter(q => q !== quality) : [...prev, quality]
    );
  };

  const handlePaxAdjustment = (delta: number) => {
    const newPax = selectedPax + delta;
    if (newPax >= 25 && newPax <= 600) {
      setSelectedPax(newPax);
    }
  };

  const packageConfig = {
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

  const getPackageBadge = () => {
    if (!selectedEventType) return 'Recomendado para Casamientos';

    const eventBadges = {
      casamiento: 'Recomendado para Casamientos',
      cumpleanos: 'Recomendado para Cumpleaños',
      empresarial: 'Recomendado para Eventos Corporativos',
      juntada: 'Recomendado para Juntadas'
    };

    return eventBadges[selectedEventType as keyof typeof eventBadges] || 'Recomendado';
  };

  const handlePackageSelection = (packageKey: 'bodega' | 'cocktails' | 'completo') => {
    setSelectedPackage(packageKey);
    setSelectedCategories(packageConfig[packageKey].categories);
  };

  const BottleIcon = ({ className, size = 24 }: { className?: string; size?: number }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6v4H9z"/>
      <path d="M8 6h8l1 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l1-2z"/>
    </svg>
  );

  const categoryConfig = [
    { key: 'spirits', label: 'Spirits', icon: BottleIcon, tooltip: 'Fernet, vodka, gin, ron, etc.' },
    { key: 'vinos', label: 'Vinos', icon: Wine, tooltip: 'Tintos y blancos' },
    { key: 'espumante', label: 'Espumantes', icon: BottleIcon, tooltip: 'Imprescindible para el brindis' },
    { key: 'gaseosas', label: 'Gaseosas', icon: Droplet, tooltip: 'Mixers necesarios para spirits' },
    { key: 'cerveza', label: 'Cervezas', icon: Beer, tooltip: 'Porrones de cerveza' }
  ];

  const currentIntensityData = selectedIntensity ? packagesData[selectedIntensity] : packagesData.fiesta;
  const multiplier = selectedPax / 100;

  const adjustedQuantities = {
    spirits: Math.floor(currentIntensityData.quantities.spirits * multiplier),
    vinos: Math.floor(currentIntensityData.quantities.vinos * multiplier),
    espumante: Math.floor(currentIntensityData.quantities.espumante * multiplier),
    gaseosas: Math.floor(currentIntensityData.quantities.gaseosas * multiplier),
    cerveza: Math.floor(currentIntensityData.quantities.cerveza * multiplier)
  };

  const calculateLitersPerPerson = (intensity: keyof typeof packagesData | null) => {
    if (!intensity) return '0.0';

    const data = packagesData[intensity];
    let totalMl = 0;

    Object.entries(selectedCategories).forEach(([cat, isSelected]) => {
      if (isSelected) {
        const quantity = data.quantities[cat as keyof typeof data.quantities];
        const bottleSize = bottleSizes[cat as keyof typeof bottleSizes];
        totalMl += quantity * bottleSize;
      }
    });

    const totalLiters = totalMl / 1000;
    const litersPerPerson = totalLiters / 100;

    return litersPerPerson.toFixed(1);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const calculateAdjustedPrice = (basePrice: number, quality: string) => {
    const qualityKey = quality.toLowerCase() as keyof typeof pricePercentages;
    const percentages = pricePercentages[qualityKey];
    let adjustedPrice = basePrice;

    Object.entries(selectedCategories).forEach(([category, isSelected]) => {
      if (!isSelected) {
        const percentage = percentages[category as keyof typeof percentages];
        adjustedPrice -= basePrice * percentage;
      }
    });

    return Math.round(adjustedPrice);
  };

  const getTotalVarieties = (pkg: typeof currentIntensityData.packages[0]) => {
    return pkg.bebidasBase + pkg.bebidasPremium + pkg.bebidasIcon;
  };

  const generateWhatsAppMessage = (quality: string) => {
    const price = calculateAdjustedPrice(
      currentIntensityData.packages.find(p => p.quality === quality)?.price || 0,
      quality
    );

    const eventTypeLabel = eventTypes.find(e => e.key === selectedEventType)?.label || 'evento';
    const packageLabel = selectedPackage ? packageConfig[selectedPackage].title : 'paquete';

    const message = `Hola! Ya configuré mi evento:\n\n` +
      `• Tipo: ${eventTypeLabel}\n` +
      `• Personas: ${selectedPax}\n` +
      `• Intensidad: ${currentIntensityData.name}\n` +
      `• Estilo: ${packageLabel}\n` +
      `• Plan: ${quality}\n` +
      `• Precio por Persona: $${price.toLocaleString('es-AR')}\n\n` +
      `¿Continuamos con la confirmación del paquete?`;

    return encodeURIComponent(message);
  };

  const handleConsultar = (quality: string) => {
    const whatsappUrl = `https://wa.me/5491165803342?text=${generateWhatsAppMessage(quality)}`;
    window.open(whatsappUrl, '_blank');
  };

  const canAdvance = () => {
    if (currentStep === 1) return selectedEventType !== null;
    if (currentStep === 2) return selectedPax > 0;
    if (currentStep === 3) return selectedIntensity !== null;
    if (currentStep === 4) return selectedPackage !== null;
    return true;
  };

  const getNextButtonText = () => {
    if (currentStep === 1) return 'Pasar a Cantidad de Personas';
    if (currentStep === 2) return 'Pasar a Intensidad de Consumo';
    if (currentStep === 3) return 'Pasar a Estilo de Bebidas';
    if (currentStep === 4) return 'Ver Planes';
    return 'Siguiente';
  };

  const handleClose = () => {
    setShowHero(true);
    setCurrentStep(1);
    setSelectedEventType(null);
    setSelectedPax(100);
    setSelectedIntensity(null);
    setSelectedPackage(null);
    setSelectedQuality('PREMIUM');
    setSelectedCategories({ spirits: true, vinos: true, espumante: true, gaseosas: true, cerveza: true });
    setExpandedSpirits({});
    setExpandedPlans(['PREMIUM']);
  };

  return (
    <>
      {/* Hero — siempre renderizada en el fondo */}
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center px-4 py-4 relative overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 opacity-40">
          <img
            src="https://images.unsplash.com/photo-1777063660032-162781794588?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxsdXh1cnklMjBiYXIlMjBwcmVtaXVtJTIwY29ja3RhaWxzJTIwZWxlZ2FudHxlbnwxfHx8fDE3Nzg2NDI2MTR8MA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="Premium bar"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/80 to-slate-900/90"></div>

        <div className="max-w-2xl w-full text-center relative z-10">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full text-white/90 text-xs font-medium mb-3 md:mb-4">
            <Check size={14} className="text-green-400" />
            <span>Más de 400 eventos organizados</span>
          </div>

          {/* Hero Content */}
          <h1 className="text-2xl md:text-4xl font-black text-white mb-2 md:mb-3 leading-tight">
            Organizá la barra de tu evento en minutos
          </h1>

          <p className="text-sm md:text-lg text-gray-200 mb-4 md:mb-6 max-w-xl mx-auto">
            Calculamos automáticamente cantidades, estilos y niveles de bebidas para casamientos, fiestas y eventos corporativos.
          </p>

          {/* Benefits - Compact List */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mb-4 md:mb-6 text-xs md:text-sm text-gray-200">
            <div className="flex items-center gap-1.5">
              <Check size={14} className="text-green-400" />
              <span>Propuesta personalizada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check size={14} className="text-green-400" />
              <span>Entrega gratuita CABA y GBA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check size={14} className="text-green-400" />
              <span>+50 marcas premium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check size={14} className="text-green-400" />
              <span>Asesoramiento por WhatsApp</span>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={() => setShowHero(false)}
            className="inline-flex items-center gap-2 px-6 md:px-8 py-3 bg-white text-gray-900 font-bold rounded-xl hover:bg-gray-100 transition-colors text-sm md:text-base shadow-xl"
          >
            Calcular mi evento
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Modal Cotizador */}
      {!showHero && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="relative w-full md:max-w-4xl h-[95dvh] md:h-[90vh] flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 rounded-t-3xl md:rounded-2xl overflow-hidden shadow-2xl">

            {/* Botón cerrar */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
              aria-label="Cerrar cotizador"
            >
              <X size={18} className="text-gray-700" />
            </button>

            {/* Progress Bar */}
            <div className="bg-white shadow-md flex-shrink-0">
              <div className="max-w-5xl mx-auto px-3 py-3 pr-14">
                {/* Progress Steps */}
                <div className="flex items-center justify-center mb-2">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <div key={step} className="flex items-center">
                        <div className={`flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-bold text-xs md:text-sm transition-all ${
                          currentStep >= step ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {currentStep > step ? <Check size={14} /> : step}
                        </div>
                        {step < 5 && (
                          <div className={`w-6 md:w-12 h-1 mx-0.5 md:mx-1 transition-all ${currentStep > step ? 'bg-gray-900' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="text-center">
                  <div className="flex flex-wrap justify-center gap-1 mb-1">
                    {currentStep >= 1 && selectedEventType && (
                      <div className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 px-2 py-1 rounded-full text-xs font-medium">
                        {eventTypes.find(e => e.key === selectedEventType)?.label}
                      </div>
                    )}
                    {currentStep >= 2 && (
                      <div className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-2 py-1 rounded-full text-xs font-medium">
                        <Users size={12} />
                        {selectedPax} personas
                      </div>
                    )}
                    {currentStep >= 3 && (
                      <>
                        <div className="inline-flex items-center gap-1 bg-green-100 text-green-900 px-2 py-1 rounded-full text-xs font-medium">
                          <Calendar size={12} />
                          {currentIntensityData.name}
                        </div>
                        <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2 py-1 rounded-full text-xs font-medium">
                          {calculateLitersPerPerson(selectedIntensity)}L por persona
                        </div>
                      </>
                    )}
                  </div>
                  {currentStep >= 4 && selectedPackage && (
                    <div className="flex flex-wrap justify-center gap-1">
                      <div className="inline-flex items-center gap-1 bg-gray-900 text-white px-2 py-1 rounded-full text-xs font-medium">
                        <span>{packageConfig[selectedPackage].emoji}</span>
                        <span>{packageConfig[selectedPackage].title}</span>
                      </div>
                      {currentStep >= 5 && selectedQuality && (
                        <div className="inline-flex items-center gap-1 bg-indigo-600 text-white px-2 py-1 rounded-full text-xs font-medium">
                          <span>{selectedQuality}</span>
                          <span>•</span>
                          <span>${calculateAdjustedPrice(currentIntensityData.packages.find(p => p.quality === selectedQuality)?.price || 0, selectedQuality).toLocaleString('es-AR')}/p</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content — scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 pt-5 pb-4 w-full">
        {/* PASO 1: Tipo de Evento */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Qué tipo de evento estás organizando?</h2>
            <p className="text-sm text-gray-600 mb-5 text-center">Para personalizar tu experiencia y calcular las proporciones ideales</p>

            <div className="grid grid-cols-2 gap-3">
              {eventTypes.map(({ key, label, icon: Icon }) => {
                const isSelected = selectedEventType === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedEventType(key)}
                    className={`p-4 md:p-6 rounded-2xl border-2 transition-all flex items-center justify-center min-h-[90px] ${
                      isSelected
                        ? 'border-gray-900 bg-white shadow-xl'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <Icon className={`mb-2 ${isSelected ? 'text-gray-900' : 'text-gray-400'}`} size={30} />
                      <div className={`font-bold text-sm md:text-base text-center ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                        {label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PASO 2: Cantidad de Personas */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Cuántas personas?</h2>
            <p className="text-sm text-gray-600 mb-4 text-center">Indicá la cantidad de invitados</p>

            <div className="grid grid-cols-4 gap-2 md:gap-3 mb-5">
              {paxOptions.map((pax) => {
                const isSelected = selectedPax === pax;
                return (
                  <button
                    key={pax}
                    onClick={() => setSelectedPax(pax)}
                    className={`p-2 md:p-4 rounded-2xl border-2 transition-all ${
                      isSelected
                        ? 'border-gray-900 bg-white shadow-xl'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="text-center">
                      <div className={`font-bold text-lg md:text-2xl ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                        {pax}
                      </div>
                      <div className={`text-xs ${isSelected ? 'text-gray-700' : 'text-gray-500'}`}>
                        personas
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fine Adjustment */}
            <div className="bg-white p-3 md:p-4 rounded-2xl border-2 border-gray-200 max-w-md mx-auto">
              <div className="text-center">
                <div className="text-xs md:text-sm text-gray-600 mb-2">Ajustá selección</div>
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <button
                    onClick={() => handlePaxAdjustment(-5)}
                    disabled={selectedPax <= 25}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl font-bold text-base md:text-lg transition-all ${
                      selectedPax <= 25
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md'
                    }`}
                  >
                    -5
                  </button>
                  <div className="text-3xl md:text-4xl font-black text-gray-900 min-w-[80px] md:min-w-[100px]">
                    {selectedPax}
                  </div>
                  <button
                    onClick={() => handlePaxAdjustment(5)}
                    disabled={selectedPax >= 600}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl font-bold text-base md:text-lg transition-all ${
                      selectedPax >= 600
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md'
                    }`}
                  >
                    +5
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PASO 3: Intensidad */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Cómo imaginás el ritmo de la barra?</h2>
            <p className="text-sm text-gray-600 mb-4 text-center">Elegí según el consumo esperado</p>

            <div className="space-y-2">
              {/* Social */}
              <button
                onClick={() => setSelectedIntensity('social')}
                className={`w-full p-3 md:p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedIntensity === 'social'
                    ? 'border-gray-900 bg-white shadow-xl'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-base md:text-lg font-bold ${selectedIntensity === 'social' ? 'text-gray-900' : 'text-gray-700'}`}>
                    SOCIAL
                  </h3>
                  <div className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ml-2">
                    Consumo Moderado
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  Ideal para grupos con variedad de edades o perfiles más tranquilos. Barra bien provista a un ritmo sin excesos.
                </p>
              </button>

              {/* Fiesta - destacado */}
              <button
                onClick={() => setSelectedIntensity('fiesta')}
                className={`w-full p-3 md:p-4 rounded-2xl border-2 transition-all text-left bg-gradient-to-br from-yellow-50 to-orange-50 ${
                  selectedIntensity === 'fiesta'
                    ? 'border-gray-900 shadow-xl'
                    : 'border-gray-900 hover:shadow-md'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base md:text-lg font-bold text-gray-900">
                    FIESTA
                  </h3>
                  <div className="bg-orange-500 text-white px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ml-2">
                    El Más Elegido
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  La medida perfecta para la mayoría de los eventos. Para grupos animados con idas constantes a la barra durante toda la noche.
                </p>
              </button>

              {/* Barra Libre */}
              <button
                onClick={() => setSelectedIntensity('barraLibre')}
                className={`w-full p-3 md:p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedIntensity === 'barraLibre'
                    ? 'border-gray-900 bg-white shadow-xl'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-base md:text-lg font-bold ${selectedIntensity === 'barraLibre' ? 'text-gray-900' : 'text-gray-700'}`}>
                    BARRA LIBRE
                  </h3>
                  <div className="bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ml-2">
                    Consumo Intenso
                  </div>
                </div>
                <p className="text-xs text-gray-600">
                  Para un público muy fiestero donde los vasos nunca están vacíos. Máxima cobertura para que no falte absolutamente nada.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* PASO 4: Elección de Paquetes */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Qué estilo de bebidas buscás?</h2>
            <p className="text-sm text-gray-600 mb-5 text-center">Seleccioná el formato que mejor se adapte a tu menú y al perfil de tus invitados.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Paquete 1: Experiencia Completa - DESTACADO */}
              <button
                onClick={() => handlePackageSelection('completo')}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left bg-gradient-to-br from-yellow-50 to-orange-50 ${
                  selectedPackage === 'completo'
                    ? 'border-gray-900 shadow-xl'
                    : 'border-gray-900 hover:shadow-md'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shadow-md">
                  🔥 {getPackageBadge()}
                </div>

                {selectedPackage === 'completo' && (
                  <div className="absolute top-3 right-3 bg-gray-900 text-white rounded-full p-1">
                    <Check size={14} />
                  </div>
                )}
                <div className="text-3xl mb-2 mt-2">👑</div>
                <h3 className="text-base md:text-lg font-bold mb-2 text-gray-900">
                  Experiencia Completa
                </h3>
                <div className="space-y-1">
                  {packageConfig.completo.includes.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs text-gray-700">
                      <Check size={13} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </button>

              {/* Paquete 2: Barra & Cerveza */}
              <button
                onClick={() => handlePackageSelection('cocktails')}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedPackage === 'cocktails'
                    ? 'border-gray-900 bg-white shadow-xl'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                {selectedPackage === 'cocktails' && (
                  <div className="absolute top-3 right-3 bg-gray-900 text-white rounded-full p-1">
                    <Check size={14} />
                  </div>
                )}
                <div className="text-3xl mb-2">🍹</div>
                <h3 className="text-base md:text-lg font-bold mb-2 text-gray-900">
                  Barra & Cerveza
                </h3>
                <div className="space-y-1">
                  {packageConfig.cocktails.includes.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs text-gray-700">
                      <Check size={13} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </button>

              {/* Paquete 3: Vinos & Espumantes */}
              <button
                onClick={() => handlePackageSelection('bodega')}
                className={`relative p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedPackage === 'bodega'
                    ? 'border-gray-900 bg-white shadow-xl'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                {selectedPackage === 'bodega' && (
                  <div className="absolute top-3 right-3 bg-gray-900 text-white rounded-full p-1">
                    <Check size={14} />
                  </div>
                )}
                <div className="text-3xl mb-2">🍷</div>
                <h3 className="text-base md:text-lg font-bold mb-2 text-gray-900">
                  Vinos & Espumantes
                </h3>
                <div className="space-y-1">
                  {packageConfig.bodega.includes.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs text-gray-700">
                      <Check size={13} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* PASO 5: Planes */}
        {currentStep === 5 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">Elegí tu paquete</h2>
            <p className="text-sm text-gray-600 mb-3 text-center">Seleccioná la calidad ideal</p>

            <div className="space-y-2">
              {['PREMIUM', 'BASE', 'ICON'].map((qualityName) => {
                const pkg = currentIntensityData.packages.find(p => p.quality === qualityName);
                if (!pkg) return null;
                const isSelected = selectedQuality === pkg.quality;
                const isExpanded = expandedPlans.includes(pkg.quality);
                const adjustedPrice = calculateAdjustedPrice(pkg.price, pkg.quality);
                const qualityLevel = pkg.quality.toLowerCase();

                return (
                  <div
                    key={pkg.quality}
                    className={`rounded-2xl border-2 transition-all overflow-hidden ${
                      isSelected ? 'border-gray-900 shadow-xl' : 'border-gray-300'
                    }`}
                  >
                    {/* Header — click siempre selecciona Y expande */}
                    <div
                      onClick={() => { setSelectedQuality(pkg.quality); if (!isExpanded) togglePlanExpand(pkg.quality); }}
                      className={`w-full p-3 md:p-4 text-left transition-colors cursor-pointer ${
                        isSelected ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <h3 className="text-base md:text-lg font-black">{pkg.quality}</h3>
                            {pkg.quality === 'PREMIUM' && (
                              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded font-bold">El más elegido</span>
                            )}
                            {pkg.quality === 'BASE' && (
                              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded font-bold">Todo lo esencial</span>
                            )}
                            {pkg.quality === 'ICON' && (
                              <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded font-bold">La experiencia definitiva</span>
                            )}
                          </div>
                          <div className="text-xl md:text-2xl font-black">
                            ${adjustedPrice.toLocaleString('es-AR')}
                          </div>
                          <div className={`text-xs mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                            por persona
                          </div>
                        </div>
                        {/* Ocultar solo cuando está expandido */}
                        {isExpanded ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePlanExpand(pkg.quality); }}
                            className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                              isSelected ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Ocultar
                          </button>
                        ) : (
                          <span className={`flex-shrink-0 text-xs font-medium ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                            Ver detalle →
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detalle — se abre/cierra independientemente */}
                    {isExpanded && (
                      <div className="bg-white p-3 space-y-2">
                        {selectedCategories.spirits && (
                          <div className="p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-start gap-2 mb-1.5">
                              <BottleIcon size={15} className="text-gray-700 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <div className="font-bold text-xs text-gray-900">Destilados y Aperitivos — {adjustedQuantities.spirits} botellas • {getTotalVarieties(pkg)} variedades</div>
                                <div className="space-y-1.5 mt-1.5">
                                  <div>
                                    <div className="font-semibold text-xs text-gray-900 mb-1">✓ Base • Elegí {pkg.bebidasBase} marcas</div>
                                    <div className="flex flex-wrap gap-1">
                                      {(expandedSpirits[`${pkg.quality}-base`] ? bebidasOptions.base : bebidasOptions.base.slice(0, 4)).map((bebida, i) => (
                                        <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{bebida}</span>
                                      ))}
                                      {!expandedSpirits[`${pkg.quality}-base`] && bebidasOptions.base.length > 4 && (
                                        <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-base`]: true}); }} className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-300 transition-colors">
                                          +{bebidasOptions.base.length - 4}
                                        </button>
                                      )}
                                      {expandedSpirits[`${pkg.quality}-base`] && (
                                        <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-base`]: false}); }} className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-300 transition-colors">
                                          Ver menos
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {pkg.bebidasPremium > 0 ? (
                                    <div>
                                      <div className="font-semibold text-xs text-gray-900 mb-1">✓ Premium • Elegí {pkg.bebidasPremium} marcas</div>
                                      <div className="flex flex-wrap gap-1">
                                        {(expandedSpirits[`${pkg.quality}-premium`] ? bebidasOptions.premium : bebidasOptions.premium.slice(0, 3)).map((bebida, i) => (
                                          <span key={i} className="text-xs bg-blue-100 px-2 py-0.5 rounded text-blue-900">{bebida}</span>
                                        ))}
                                        {!expandedSpirits[`${pkg.quality}-premium`] && bebidasOptions.premium.length > 3 && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-premium`]: true}); }} className="text-xs bg-blue-200 px-2 py-0.5 rounded text-blue-900 hover:bg-blue-300 transition-colors">
                                            +{bebidasOptions.premium.length - 3}
                                          </button>
                                        )}
                                        {expandedSpirits[`${pkg.quality}-premium`] && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-premium`]: false}); }} className="text-xs bg-blue-200 px-2 py-0.5 rounded text-blue-900 hover:bg-blue-300 transition-colors">
                                            Ver menos
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">✗ No incluye premium</div>
                                  )}
                                  {pkg.bebidasIcon > 0 ? (
                                    <div>
                                      <div className="font-semibold text-xs text-gray-900 mb-1">✓ Icono • Elegí {pkg.bebidasIcon} marcas</div>
                                      <div className="flex flex-wrap gap-1">
                                        {(expandedSpirits[`${pkg.quality}-icon`] ? bebidasOptions.icon : bebidasOptions.icon.slice(0, 3)).map((bebida, i) => (
                                          <span key={i} className="text-xs bg-purple-100 px-2 py-0.5 rounded text-purple-900">{bebida}</span>
                                        ))}
                                        {!expandedSpirits[`${pkg.quality}-icon`] && bebidasOptions.icon.length > 3 && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-icon`]: true}); }} className="text-xs bg-purple-200 px-2 py-0.5 rounded text-purple-900 hover:bg-purple-300 transition-colors">
                                            +{bebidasOptions.icon.length - 3}
                                          </button>
                                        )}
                                        {expandedSpirits[`${pkg.quality}-icon`] && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${pkg.quality}-icon`]: false}); }} className="text-xs bg-purple-200 px-2 py-0.5 rounded text-purple-900 hover:bg-purple-300 transition-colors">
                                            Ver menos
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">✗ No incluye icono</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-1.5">
                          {selectedCategories.vinos && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Wine size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Vinos · {adjustedQuantities.vinos} bot.</div>
                                <div className="text-xs text-gray-600 leading-snug">{vinosOptions[qualityLevel].join(', ')}</div>
                              </div>
                            </div>
                          )}
                          {selectedCategories.espumante && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <BottleIcon size={14} className="text-gray-700 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Espumantes · {adjustedQuantities.espumante} bot.</div>
                                <div className="text-xs text-gray-600 leading-snug">{espumanteOptions[qualityLevel].join(', ')}</div>
                              </div>
                            </div>
                          )}
                          {selectedCategories.gaseosas && selectedPackage !== 'bodega' && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Droplet size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Gaseosas · {adjustedQuantities.gaseosas} bot.</div>
                                <div className="text-xs text-gray-600 leading-snug">Coca-Cola y Villavicencio</div>
                              </div>
                            </div>
                          )}
                          {selectedPackage === 'bodega' && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Droplet size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Agua Mineral</div>
                                <div className="text-xs text-gray-600">Villavicencio</div>
                              </div>
                            </div>
                          )}
                          {selectedCategories.cerveza && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Beer size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Cervezas · {adjustedQuantities.cerveza} porr.</div>
                                <div className="text-xs text-gray-600 leading-snug">{cervezasOptions[qualityLevel].join(', ')}</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleConsultar(pkg.quality); }}
                          className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors text-sm"
                        >
                          Confirmar {pkg.quality} por WhatsApp
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
              </div>
            </div>

            {/* Bottom Navigation */}
            <div className="bg-white border-t-2 border-gray-200 shadow-2xl flex-shrink-0">
              <div className="max-w-4xl mx-auto px-3 py-3 flex gap-2 md:gap-3">
                {currentStep > 1 && (
                  <button
                    onClick={() => setCurrentStep(currentStep - 1)}
                    className="flex items-center gap-1 md:gap-2 px-4 md:px-6 py-2 md:py-3 border-2 border-gray-900 rounded-xl font-bold text-sm md:text-base text-gray-900 hover:bg-gray-50"
                  >
                    <ChevronLeft size={18} />
                    <span className="hidden md:inline">Anterior</span>
                  </button>
                )}
                {currentStep < 5 && (
                  <button
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={!canAdvance()}
                    className={`flex-1 flex items-center justify-center gap-1 md:gap-2 px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-white transition-all text-sm md:text-base ${
                      canAdvance() ? 'bg-gray-900 hover:bg-gray-800 shadow-lg' : 'bg-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {getNextButtonText()}
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
