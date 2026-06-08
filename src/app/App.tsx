import { useState, useRef, useEffect, Fragment, type ReactNode } from 'react';
import { Wine, Beer, Droplet, ChevronRight, ChevronLeft, Check, Users, Calendar, X } from 'lucide-react';
import {
  bebidasOptions,
  vinosOptions,
  espumanteOptions,
  cervezasOptions,
  paxOptions,
  eventTypes,
  packageConfig,
  spiritsSelection,
  WHATSAPP_NUMBER,
} from './data';
import {
  calculateQuote,
  calculateLitersPerPersonDisplay,
  getTotalVarieties,
} from './calculator';
import type { EventType, Duration, Style, Quality } from './calculator';
import { quoterConfig } from './quoter-config';

// Mapeo de los valores de estado de duración a las claves del config
const durationMap = { short: 'corta', standard: 'media', long: 'larga' } as const;

// ---------------------------------------------------------------------------
// PdfModal — captura de datos para descarga de cotización (Etapa 1: stub)
// ---------------------------------------------------------------------------
interface PdfQuoteData {
  inputs: {
    tipoEvento: string | null;
    tipoEventoLabel: string | null;
    duracion: string;
    duracionLabel: string;
    personas: number;
    intensidad: string | null;
    intensidadLabel: string | null;
    estilo: string | null;
    estiloLabel: string | null;
    plan: string | null;
  };
  precios: { precioPorPersona: number; total: number; cuota: number } | null;
}

function PdfModal({ onClose, data }: { onClose: () => void; data: PdfQuoteData }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaEvento, setFechaEvento] = useState('');
  const [telefonoTouched, setTelefonoTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const nombreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => nombreRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const isPhoneValid = (p: string) => p.replace(/\D/g, '').length >= 8;
  const phoneError = telefonoTouched && telefono && !isPhoneValid(telefono)
    ? 'Ingresá un número válido (mínimo 8 dígitos)' : '';
  const canSubmit = nombre.trim().length > 0 && isPhoneValid(telefono);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen: 'PDF',
          lead: { nombre, telefono, fechaEvento: fechaEvento || null },
          inputs: {
            tipoEvento: data.inputs.tipoEventoLabel,
            personas:   data.inputs.personas,
            duracion:   data.inputs.duracionLabel,
            intensidad: data.inputs.intensidadLabel,
            estilo:     data.inputs.estiloLabel,
          },
          precios: {
            plan:             data.inputs.plan,
            precioPorPersona: data.precios?.precioPorPersona,
            total:            data.precios?.total,
          },
        }),
      });
      setSubmitted(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex-1 pr-3">
            <h2 className="text-lg font-black text-gray-900">Descargá tu cotización</h2>
            <p className="text-sm text-gray-500 mt-1">Te enviamos el detalle por PDF para que lo revises con tranquilidad.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0 mt-0.5"
            aria-label="Cerrar"
          >
            <X size={15} className="text-gray-600" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={22} className="text-green-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">¡Listo!</h3>
            <p className="text-sm text-gray-500">Te enviamos tu presupuesto por WhatsApp a la brevedad.</p>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors">
              Volver al cotizador
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto flex-1 px-5 pb-1">
              <div className="space-y-4">

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Nombre</label>
                  <input
                    ref={nombreRef}
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full px-3.5 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">Teléfono</label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={e => setTelefono(e.target.value)}
                    onBlur={() => setTelefonoTouched(true)}
                    placeholder="Ej: 11 1234-5678"
                    className={`w-full px-3.5 py-3 border-2 rounded-xl text-base focus:outline-none transition-colors ${
                      phoneError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-gray-900'
                    }`}
                  />
                  {phoneError && <p className="text-xs text-red-500 mt-1.5">{phoneError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-1.5">
                    Fecha del evento <span className="font-normal text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={fechaEvento}
                    onChange={e => setFechaEvento(e.target.value)}
                    className="w-full px-3.5 py-3 border-2 border-gray-200 rounded-xl text-base focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>

              </div>
            </div>

            <div className="p-5 pt-4 space-y-2">
              {submitError && (
                <p className="text-xs text-red-500 text-center">
                  Algo salió mal. Revisá tu conexión e intentá de nuevo.
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
                  canSubmit && !submitting
                    ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Enviando…' : 'Recibir presupuesto por WhatsApp'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default function App() {
  const [showHero, setShowHero] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [selectedPax, setSelectedPax] = useState(100);
  const [selectedIntensity, setSelectedIntensity] = useState<'social' | 'fiesta' | 'barraLibre' | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'bodega' | 'cocktails' | 'completo' | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [eventDuration, setEventDuration] = useState<'short' | 'standard' | 'long'>('standard');
  const [expandedSpirits, setExpandedSpirits] = useState<{[key: string]: boolean}>({});
  const [expandedPlans, setExpandedPlans] = useState<string[]>([]);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyHeight, setStickyHeight] = useState(64);

  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStickyHeight(el.offsetHeight));
    ro.observe(el);
    setStickyHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const togglePlanExpand = (quality: string) => {
    setExpandedPlans(prev =>
      prev.includes(quality) ? prev.filter(q => q !== quality) : [...prev, quality]
    );
  };

  const handlePaxAdjustment = (delta: number) => {
    const newPax = selectedPax + delta;
    if (newPax >= 25 && newPax <= 600) setSelectedPax(newPax);
  };

  const getPackageBadge = () => {
    if (!selectedEventType) return 'Recomendado para Casamientos';
    const badges = {
      casamiento:  'Recomendado para Casamientos',
      cumpleanos:  'Recomendado para Cumpleaños',
      empresarial: 'Recomendado para Eventos Corporativos',
      juntada:     'Recomendado para Juntadas',
    };
    return badges[selectedEventType as keyof typeof badges] ?? 'Recomendado';
  };

  const handlePackageSelection = (packageKey: 'bodega' | 'cocktails' | 'completo') => {
    setSelectedPackage(packageKey);
  };

  const BottleIcon = ({ className, size = 24 }: { className?: string; size?: number }) => (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6v4H9z"/>
      <path d="M8 6h8l1 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8l1-2z"/>
    </svg>
  );

  const ComparativoBanner = ({ title, body }: { title: string; body: string }) => (
    <div className="px-3 py-3 bg-green-50 border border-green-200 rounded-xl">
      <div className="flex items-start gap-2">
        <Check size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-green-900 leading-snug mb-0.5">{title}</p>
          <p className="text-xs text-green-700 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );

  const FloatingBadge = ({ text, colorClass = 'bg-orange-500 text-white' }: { text: string; colorClass?: string }) => (
    <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap z-10 ${colorClass}`}>
      {text}
    </span>
  );

  const OptionGrid = ({
    options,
    selectedKey,
    onSelect,
  }: {
    options: Array<{
      key: string;
      ribbon?: string;
      title: string;
      descBadge?: { text: string; className: string };
      body: ReactNode;
    }>;
    selectedKey: string | null;
    onSelect: (key: string) => void;
  }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
      {options.map(({ key, ribbon, title, descBadge, body }) => {
        const isSelected = selectedKey === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`relative w-full rounded-2xl border-2 transition-all text-left ${
              isSelected
                ? 'border-gray-900 bg-white shadow-xl'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
          >
            {ribbon && <FloatingBadge text={ribbon} />}
            <div className="p-2 md:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className={`text-base md:text-lg font-bold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                  {title}
                </h3>
                {descBadge && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ml-2 ${descBadge.className}`}>
                    {descBadge.text}
                  </span>
                )}
              </div>
              {body}
            </div>
          </button>
        );
      })}
    </div>
  );

  // Helper: arma el input completo para calculateQuote (válido solo tras pasos 1-4)
  const getQuoteInput = (quality: Quality) => ({
    eventType:  selectedEventType! as EventType,
    duration:   durationMap[eventDuration] as Duration,
    pax:        selectedPax,
    intensity:  selectedIntensity!,
    style:      selectedPackage! as Style,
    quality,
  });

  const generateWhatsAppMessage = (quality: string) => {
    if (!selectedEventType || !selectedIntensity || !selectedPackage) return '';
    const quote        = calculateQuote(getQuoteInput(quality as Quality));
    const displayTotal = quote.pricePerPerson * selectedPax;

    const eventTypeLabel = eventTypes.find(e => e.key === selectedEventType)?.label ?? 'evento';
    const durationLabel  = quoterConfig.duration[durationMap[eventDuration]].label;
    const intensityLabel = quoterConfig.intensity[selectedIntensity].label;
    const styleLabel     = packageConfig[selectedPackage].title;

    const includedCats = Object.entries(quoterConfig.style[selectedPackage as Style])
      .filter(([, mult]) => mult > 0)
      .map(([cat]) => cat);

    const showcaseText = quoterConfig.vidriera[quality as 'BASE' | 'PREMIUM' | 'ICON']
      .filter(item => includedCats.includes(item.categoria))
      .map(item => item.texto)
      .join(', ');

    return [
      `¡Hola! Armé esta cotización en la web y me interesa avanzar:`,
      ``,
      `*MI EVENTO*`,
      `${eventTypeLabel} · ${durationLabel} · ${selectedPax} personas`,
      `Intensidad: ${intensityLabel} · Estilo: ${styleLabel}`,
      ``,
      `*PLAN ${quality}*`,
      `$${quote.pricePerPerson.toLocaleString('es-AR')} por persona`,
      `Total: $${displayTotal.toLocaleString('es-AR')}`,
      `Incluye: ${showcaseText}`,
      ``,
      `Me gustaría coordinar los detalles: elección de marcas, fecha del evento, formas de pago y todo lo que haga falta. ¡Gracias!`,
    ].join('\n');
  };

  const handleConsultar = (quality: string) => {
    const msg = generateWhatsAppMessage(quality);
    if (!msg) return;

    if (selectedEventType && selectedIntensity && selectedPackage) {
      const quote = calculateQuote(getQuoteInput(quality as Quality));
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen: 'WhatsApp',
          lead: { nombre: '', telefono: '', fechaEvento: '' },
          inputs: {
            tipoEvento: eventTypes.find(e => e.key === selectedEventType)?.label ?? selectedEventType,
            personas:   selectedPax,
            duracion:   quoterConfig.duration[durationMap[eventDuration]].label,
            intensidad: quoterConfig.intensity[selectedIntensity].label,
            estilo:     packageConfig[selectedPackage].title,
          },
          precios: {
            plan:             quality,
            precioPorPersona: quote.pricePerPerson,
            total:            quote.pricePerPerson * selectedPax,
          },
        }),
      }).catch(() => {});
    }

    const url = new URL(`https://wa.me/${WHATSAPP_NUMBER}`);
    url.searchParams.set('text', msg);
    window.open(url.href, '_blank');
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
    if (currentStep === 4) return 'Pasar a Calidad de Bebidas';
    return 'Siguiente';
  };

  const handleClose = () => {
    setShowHero(true);
    setCurrentStep(1);
    setSelectedEventType(null);
    setSelectedPax(100);
    setSelectedIntensity(null);
    setSelectedPackage(null);
    setSelectedQuality(null);
    setEventDuration('standard');
    setExpandedSpirits({});
    setExpandedPlans([]);
  };

  return (
    <>
      {/* Hero */}
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900 flex items-center justify-center px-4 py-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <img
            src="https://images.unsplash.com/photo-1777063660032-162781794588?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxsdXh1cnklMjBiYXIlMjBwcmVtaXVtJTIwY29ja3RhaWxzJTIwZWxlZ2FudHxlbnwxfHx8fDE3Nzg2NDI2MTR8MA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="Premium bar"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/80 to-slate-900/90"></div>

        <div className="max-w-2xl w-full text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full text-white/90 text-xs font-medium mb-3 md:mb-4">
            <Check size={14} className="text-green-400" />
            <span>Más de 400 eventos organizados</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-white mb-2 md:mb-3 leading-tight">
            Organizá la barra de tu evento en minutos
          </h1>
          <p className="text-sm md:text-lg text-gray-200 mb-4 md:mb-6 max-w-xl mx-auto">
            Calculamos automáticamente cantidades, estilos y niveles de bebidas para casamientos, fiestas y eventos corporativos.
          </p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mb-4 md:mb-6 text-xs md:text-sm text-gray-200">
            {['Propuesta personalizada', 'Entrega gratuita CABA y GBA', '+50 marcas premium', 'Asesoramiento por WhatsApp'].map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <Check size={14} className="text-green-400" />
                <span>{t}</span>
              </div>
            ))}
          </div>
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

                <div className="text-center">
                  <div className="flex flex-wrap justify-center gap-1 mb-1">
                    {selectedEventType && (
                      <div className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 px-2 py-1 rounded-full text-xs font-medium">
                        {eventTypes.find(e => e.key === selectedEventType)?.label}
                        {currentStep >= 3 && (
                          <>{' · '}{eventDuration === 'short' ? '1-3h' : eventDuration === 'standard' ? '4-6h' : '7+h'}</>
                        )}
                      </div>
                    )}
                    {currentStep >= 2 && (
                      <div className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-2 py-1 rounded-full text-xs font-medium">
                        <Users size={12} />
                        {selectedPax} personas
                      </div>
                    )}
                    {currentStep >= 3 && selectedIntensity && selectedEventType && (
                      <>
                        <div className="inline-flex items-center gap-1 bg-green-100 text-green-900 px-2 py-1 rounded-full text-xs font-medium">
                          <Calendar size={12} />
                          {quoterConfig.intensity[selectedIntensity].label}
                        </div>
                        <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2 py-1 rounded-full text-xs font-medium">
                          {calculateLitersPerPersonDisplay({
                            eventType:  selectedEventType as EventType,
                            duration:   durationMap[eventDuration] as Duration,
                            pax:        selectedPax,
                            intensity:  selectedIntensity,
                            style:      selectedPackage ? selectedPackage as Style : undefined,
                          })}L por persona
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
                      {currentStep >= 5 && selectedQuality && selectedEventType && selectedIntensity && (
                        <div className="inline-flex items-center gap-1 bg-indigo-600 text-white px-2 py-1 rounded-full text-xs font-medium">
                          <span>{selectedQuality}</span>
                          <span>•</span>
                          <span>${calculateQuote(getQuoteInput(selectedQuality as Quality)).pricePerPerson.toLocaleString('es-AR')}/p</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content — scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 pt-5 w-full" style={{ paddingBottom: stickyHeight + 16 }}>

        {/* PASO 1: Tipo de Evento */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Qué tipo de evento estás organizando?</h2>
            <p className="text-sm text-gray-600 mb-6 text-center">Para personalizar tu experiencia y calcular las proporciones ideales</p>

            <div className="grid grid-cols-2 gap-4 md:gap-5">
              {eventTypes.map(({ key, label, icon: Icon }) => {
                const isSelected = selectedEventType === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedEventType(key)}
                    className={`p-4 md:p-6 rounded-2xl border-2 transition-all flex items-center justify-center ${
                      isSelected ? 'border-gray-900 bg-white shadow-xl' : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <Icon className={`w-6 h-6 md:w-8 md:h-8 mb-2 ${isSelected ? 'text-gray-900' : 'text-gray-400'}`} />
                      <div className={`font-bold text-xs md:text-base text-center leading-tight ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
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
                      isSelected ? 'border-gray-900 bg-white shadow-xl' : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="text-center">
                      <div className={`font-bold text-lg md:text-2xl ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>{pax}</div>
                      <div className={`text-xs ${isSelected ? 'text-gray-700' : 'text-gray-500'}`}>personas</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={`bg-white p-3 md:p-4 rounded-2xl border-2 transition-all max-w-md mx-auto ${
              !paxOptions.includes(selectedPax) ? 'border-gray-900' : 'border-gray-200'
            }`}>
              <div className="text-center">
                <div className="text-xs md:text-sm text-gray-600 mb-2">Ajustá selección</div>
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <button
                    onClick={() => handlePaxAdjustment(-5)}
                    disabled={selectedPax <= 25}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl font-bold text-base md:text-lg transition-all ${
                      selectedPax <= 25 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md'
                    }`}
                  >-5</button>
                  <div className="text-3xl md:text-4xl font-black text-gray-900 min-w-[80px] md:min-w-[100px]">{selectedPax}</div>
                  <button
                    onClick={() => handlePaxAdjustment(5)}
                    disabled={selectedPax >= 600}
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-xl font-bold text-base md:text-lg transition-all ${
                      selectedPax >= 600 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md'
                    }`}
                  >+5</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PASO 3: Duración + Intensidad */}
        {currentStep === 3 && (
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Cuánto va a durar el evento?</h3>
            <p className="hidden md:block text-sm text-gray-600 mb-3 text-center">Esto nos ayuda a calcular las cantidades correctas</p>
            <div className="grid grid-cols-3 gap-2 md:gap-3 mt-4 md:mt-0">
              {([
                { value: 'short',    label: '1-3 horas' },
                { value: 'standard', label: '4-6 horas', badge: 'Habitual' },
                { value: 'long',     label: '7+ horas' },
              ] as const).map(({ value, label, badge }) => {
                const isSelected = eventDuration === value;
                return (
                  <button
                    key={value}
                    onClick={() => setEventDuration(value)}
                    className={`relative p-2 md:p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center min-h-[50px] md:min-h-[64px] ${
                      isSelected ? 'border-gray-900 bg-white shadow-xl' : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    {badge && <FloatingBadge text={badge} />}
                    <span className={`font-bold text-sm md:text-base text-center ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 md:mt-5">
              <h2 className="text-base md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Cómo imaginás el ritmo de la barra?</h2>
              <p className="text-xs md:text-sm text-gray-600 mb-2 md:mb-4 text-center">Elegí según el consumo esperado de tus invitados</p>
            </div>
            <OptionGrid
              options={[
                {
                  key: 'social',
                  title: 'SOCIAL',
                  descBadge: { text: 'Consumo Moderado', className: 'bg-blue-100 text-blue-900' },
                  body: <p className="text-xs text-gray-600">Ideal para grupos con variedad de edades o perfiles más tranquilos. Barra bien provista a un ritmo sin excesos.</p>,
                },
                {
                  key: 'fiesta',
                  ribbon: 'El Más Elegido',
                  title: 'FIESTA',
                  descBadge: { text: 'Consumo Regular', className: 'bg-orange-100 text-orange-900' },
                  body: <p className="text-xs text-gray-600">La medida perfecta para la mayoría de los eventos. Para grupos animados con idas constantes a la barra durante toda la noche.</p>,
                },
                {
                  key: 'barraLibre',
                  title: 'BARRA LIBRE',
                  descBadge: { text: 'Consumo Intenso', className: 'bg-purple-100 text-purple-900' },
                  body: <p className="text-xs text-gray-600">Para un público muy fiestero donde los vasos nunca están vacíos. Máxima cobertura para que no falte absolutamente nada.</p>,
                },
              ]}
              selectedKey={selectedIntensity}
              onSelect={(key) => setSelectedIntensity(key as 'social' | 'fiesta' | 'barraLibre')}
            />
          </div>
        )}

        {/* PASO 4: Estilo de Bebidas */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¿Qué estilo de bebidas buscás?</h2>
            <p className="text-sm text-gray-600 mb-5 text-center">Seleccioná el formato que mejor se adapte a tu menú y al perfil de tus invitados.</p>

            {(() => {
              const shortLabel: Record<string, string> = {
                'Destilados y Aperitivos': 'Destilados',
                'Mixers para tus tragos': 'Mixers',
                'Vinos Tintos y Blancos': 'Vinos',
              };
              const label = (item: string) => shortLabel[item] ?? item;
              const cardBtn = (pkg: 'completo' | 'cocktails' | 'bodega', extraClass = '') =>
                `relative p-3 md:p-4 rounded-2xl border-2 transition-all text-left ${extraClass} ${
                  selectedPackage === pkg ? 'border-gray-900 bg-white shadow-xl' : 'border-gray-300 bg-white hover:border-gray-400'
                }`;
              const bullets = (items: string[]) => (
                <div className="grid grid-cols-2 md:grid-cols-1 gap-x-2 gap-y-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <Check size={12} className="text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="md:hidden">{label(item)}</span>
                      <span className="hidden md:inline">{item}</span>
                    </div>
                  ))}
                </div>
              );
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Experiencia Completa — order-1 mobile y desktop */}
                  <button onClick={() => handlePackageSelection('completo')} className={cardBtn('completo', 'order-1')}>
                    <FloatingBadge text={getPackageBadge()} />
                    <div className="hidden md:block text-3xl mb-2">👑</div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="md:hidden text-xl leading-none">👑</span>
                      <h3 className="text-base md:text-lg font-bold text-gray-900">Experiencia Completa</h3>
                    </div>
                    {bullets(packageConfig.completo.includes)}
                  </button>

                  {/* Banner — order-2 mobile (debajo de completo), md:order-4 desktop (debajo de las 3) */}
                  <div className="order-2 md:order-4 md:col-span-3">
                    <ComparativoBanner
                      title="¿Sabías que con un servicio de barra libre tradicional pagás más y no te queda nada?"
                      body="Tu paquete de Experiencia Completa, además de costar hasta un 30% menos, incluye vinos y espumantes, y las botellas que sobran son tuyas."
                    />
                  </div>

                  {/* Barra & Cerveza — order-3 mobile, md:order-2 desktop */}
                  <button onClick={() => handlePackageSelection('cocktails')} className={cardBtn('cocktails', 'order-3 md:order-2')}>
                    <div className="hidden md:block text-3xl mb-2">🍹</div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="md:hidden text-xl leading-none">🍹</span>
                      <h3 className="text-base md:text-lg font-bold text-gray-900">Barra & Cerveza</h3>
                    </div>
                    {bullets(packageConfig.cocktails.includes)}
                  </button>

                  {/* Vinos & Espumantes — order-4 mobile, md:order-3 desktop */}
                  <button onClick={() => handlePackageSelection('bodega')} className={cardBtn('bodega', 'order-4 md:order-3')}>
                    <div className="hidden md:block text-3xl mb-2">🍷</div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="md:hidden text-xl leading-none">🍷</span>
                      <h3 className="text-base md:text-lg font-bold text-gray-900">Vinos & Espumantes</h3>
                    </div>
                    {bullets(packageConfig.bodega.includes)}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* PASO 5: Planes */}
        {currentStep === 5 && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 text-center">¡Listo! Calculamos las cantidades ideales para tu evento</h2>
            <p className="text-sm text-gray-600 mb-3 text-center">Solo falta elegir la calidad de tus bebidas</p>

            <div className="space-y-4 pb-4">
              {(['PREMIUM', 'BASE', 'ICON'] as Quality[]).map((quality) => {
                if (!selectedEventType || !selectedIntensity || !selectedPackage) return null;

                const quote      = calculateQuote(getQuoteInput(quality));
                const isSelected = selectedQuality === quality;
                const isExpanded = expandedPlans.includes(quality);
                const ql         = quality.toLowerCase() as 'base' | 'premium' | 'icon';
                const sel        = spiritsSelection[quality];

                // Referencias directas al resultado del motor por categoría
                const rDestilados = quote.categories.destilados;
                const rVino       = quote.categories.vino;
                const rEspumante  = quote.categories.espumante;
                const rCerveza    = quote.categories.cerveza;
                const rMixers     = quote.categories.mixers;
                const rGaseosas   = quote.categories.gaseosas;

                // "Bebidas sin Alcohol": subtítulo varía según si es bodega (agua) o no (gaseosas)
                const gasSubtitle = selectedPackage === 'bodega'
                  ? 'Agua Mineral · Villavicencio'
                  : 'Gaseosas línea Coca-Cola y Aguas Villavicencio';
                const displayTotal = quote.pricePerPerson * selectedPax;

                return (
                  <Fragment key={quality}>
                  <div className="relative">
                    <FloatingBadge
                      text={quality === 'PREMIUM' ? 'El más elegido' : quality === 'BASE' ? 'Todo lo esencial' : 'La experiencia definitiva'}
                      colorClass={
                        quality === 'PREMIUM' ? 'bg-orange-500 text-white' :
                        quality === 'BASE'    ? 'bg-blue-500 text-white' :
                                               'bg-purple-500 text-white'
                      }
                    />
                    <div
                      className={`rounded-2xl border-2 transition-all overflow-hidden ${
                        isSelected ? 'border-gray-900 shadow-xl' : 'border-gray-300'
                      }`}
                    >
                    {/* Header */}
                    <div
                      onClick={() => { setSelectedQuality(quality); togglePlanExpand(quality); }}
                      className={`w-full p-3 md:p-4 text-left transition-colors cursor-pointer ${
                        isSelected ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-base md:text-lg font-black">{quality}</h3>
                            {isSelected && (
                              <Check size={16} className={
                                quality === 'PREMIUM' ? 'text-orange-500' :
                                quality === 'BASE'    ? 'text-blue-500' :
                                                       'text-purple-500'
                              } />
                            )}
                          </div>
                          <div className="text-xl md:text-2xl font-black">
                            ${quote.pricePerPerson.toLocaleString('es-AR')}
                          </div>
                          <div className={`text-xs mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>por persona</div>
                          <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                            <span className="md:hidden">
                              {quoterConfig.cuotasTextoCorto.replace('{n}', String(quoterConfig.cuotasCantidad))}
                            </span>
                            <span className="hidden md:inline">
                              {quoterConfig.cuotasTexto
                                .replace('{n}', String(quoterConfig.cuotasCantidad))
                                .replace('{monto}', `$${Math.round(displayTotal / quoterConfig.cuotasCantidad).toLocaleString('es-AR')}`)}
                            </span>
                          </div>
                          <div className={`text-xs mt-0.5 ${isSelected ? 'text-gray-400' : 'text-gray-500'}`}>
                            Total ${displayTotal.toLocaleString('es-AR')}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          {quoterConfig.planBadges[quality].map((badge, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium pointer-events-none bg-green-50 border border-green-200 text-green-900">
                              {badge.text}
                            </span>
                          ))}
                          {isExpanded ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePlanExpand(quality); }}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
                                isSelected ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              Ocultar
                            </button>
                          ) : (
                            <span className={`text-xs font-medium ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                              Ver detalle →
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Detalle */}
                    {isExpanded && (
                      <div className="bg-white p-3 space-y-2">

                        {rDestilados && (
                          <div className="p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-start gap-2 mb-1.5">
                              <BottleIcon size={15} className="text-gray-700 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <div className="font-bold text-xs text-gray-900">
                                  Destilados y Aperitivos — {rDestilados.envases} {rDestilados.unitNoun} ({rDestilados.unitLabel}) • {getTotalVarieties(quality)} variedades
                                </div>
                                <div className="space-y-1.5 mt-1.5">
                                  <div>
                                    <div className="font-semibold text-xs text-gray-900 mb-1">✓ Base • Elegí {sel.base} marcas</div>
                                    <div className="flex flex-wrap gap-1">
                                      {(expandedSpirits[`${quality}-base`] ? bebidasOptions.base : bebidasOptions.base.slice(0, 4)).map((b, i) => (
                                        <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{b}</span>
                                      ))}
                                      {!expandedSpirits[`${quality}-base`] && bebidasOptions.base.length > 4 && (
                                        <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-base`]: true}); }} className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-300 transition-colors">
                                          +{bebidasOptions.base.length - 4}
                                        </button>
                                      )}
                                      {expandedSpirits[`${quality}-base`] && (
                                        <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-base`]: false}); }} className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-300 transition-colors">
                                          Ver menos
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {sel.premium > 0 ? (
                                    <div>
                                      <div className="font-semibold text-xs text-gray-900 mb-1">✓ Premium • Elegí {sel.premium} marcas</div>
                                      <div className="flex flex-wrap gap-1">
                                        {(expandedSpirits[`${quality}-premium`] ? bebidasOptions.premium : bebidasOptions.premium.slice(0, 3)).map((b, i) => (
                                          <span key={i} className="text-xs bg-blue-100 px-2 py-0.5 rounded text-blue-900">{b}</span>
                                        ))}
                                        {!expandedSpirits[`${quality}-premium`] && bebidasOptions.premium.length > 3 && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-premium`]: true}); }} className="text-xs bg-blue-200 px-2 py-0.5 rounded text-blue-900 hover:bg-blue-300 transition-colors">
                                            +{bebidasOptions.premium.length - 3}
                                          </button>
                                        )}
                                        {expandedSpirits[`${quality}-premium`] && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-premium`]: false}); }} className="text-xs bg-blue-200 px-2 py-0.5 rounded text-blue-900 hover:bg-blue-300 transition-colors">
                                            Ver menos
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">✗ No incluye premium</div>
                                  )}
                                  {sel.icon > 0 ? (
                                    <div>
                                      <div className="font-semibold text-xs text-gray-900 mb-1">✓ Icono • Elegí {sel.icon} marcas</div>
                                      <div className="flex flex-wrap gap-1">
                                        {(expandedSpirits[`${quality}-icon`] ? bebidasOptions.icon : bebidasOptions.icon.slice(0, 3)).map((b, i) => (
                                          <span key={i} className="text-xs bg-purple-100 px-2 py-0.5 rounded text-purple-900">{b}</span>
                                        ))}
                                        {!expandedSpirits[`${quality}-icon`] && bebidasOptions.icon.length > 3 && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-icon`]: true}); }} className="text-xs bg-purple-200 px-2 py-0.5 rounded text-purple-900 hover:bg-purple-300 transition-colors">
                                            +{bebidasOptions.icon.length - 3}
                                          </button>
                                        )}
                                        {expandedSpirits[`${quality}-icon`] && (
                                          <button onClick={(e) => { e.stopPropagation(); setExpandedSpirits({...expandedSpirits, [`${quality}-icon`]: false}); }} className="text-xs bg-purple-200 px-2 py-0.5 rounded text-purple-900 hover:bg-purple-300 transition-colors">
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
                            {rMixers && (
                              <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-gray-200">
                                <Droplet size={13} className="text-gray-500 flex-shrink-0" />
                                <span className="text-xs text-gray-600">
                                  Mixers · {rMixers.envases} {rMixers.unitNoun} ({rMixers.unitLabel})
                                  <span className="text-gray-400"> · gaseosas o jugos para preparar los tragos</span>
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-1.5">
                          {rVino && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Wine size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Vinos · {rVino.envases} {rVino.unitNoun} ({rVino.unitLabel})</div>
                                <div className="text-xs text-gray-600 leading-snug">{vinosOptions[ql].join(', ')}</div>
                              </div>
                            </div>
                          )}
                          {rEspumante && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <BottleIcon size={14} className="text-gray-700 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Espumantes · {rEspumante.envases} {rEspumante.unitNoun} ({rEspumante.unitLabel})</div>
                                <div className="text-xs text-gray-600 leading-snug">{espumanteOptions[ql].join(', ')}</div>
                              </div>
                            </div>
                          )}
                          {rGaseosas && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Droplet size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Bebidas sin Alcohol · {rGaseosas.envases} {rGaseosas.unitNoun} ({rGaseosas.unitLabel})</div>
                                <div className="text-xs text-gray-600 leading-snug">{gasSubtitle}</div>
                              </div>
                            </div>
                          )}
                          {rCerveza && (
                            <div className="flex items-start gap-1.5 p-2 bg-gray-50 rounded-lg">
                              <Beer size={14} className="text-gray-700 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-gray-900">Cervezas · {rCerveza.envases} {rCerveza.unitNoun} ({rCerveza.unitLabel})</div>
                                <div className="text-xs text-gray-600 leading-snug">{cervezasOptions[ql].join(', ')}</div>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                  </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

              </div>
            </div>

            {/* Bottom Navigation */}
            <div ref={stickyRef} className="bg-white border-t-2 border-gray-200 shadow-2xl flex-shrink-0">
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
                {currentStep === 5 && (
                  <div className="flex-1 flex flex-col gap-2">
                    <button
                      onClick={() => selectedQuality && handleConsultar(selectedQuality)}
                      disabled={!selectedQuality}
                      className={`w-full flex items-center justify-center gap-1 md:gap-2 px-4 md:px-6 py-2 md:py-3 rounded-xl font-bold text-white transition-all text-sm md:text-base ${
                        selectedQuality ? 'bg-gray-900 hover:bg-gray-800 shadow-lg' : 'bg-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedQuality ? `Confirmar ${selectedQuality} por WhatsApp` : 'Elegí un paquete para continuar'}
                      <ChevronRight size={18} />
                    </button>
                    {selectedQuality && (
                      <button
                        onClick={() => setShowPdfModal(true)}
                        className="text-center text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                      >
                        ¿Preferís pensarlo? Recibí tu presupuesto en PDF por WhatsApp
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {showPdfModal && (() => {
        const q = selectedQuality && selectedEventType && selectedIntensity && selectedPackage
          ? calculateQuote(getQuoteInput(selectedQuality as Quality))
          : null;
        return (
          <PdfModal
            onClose={() => setShowPdfModal(false)}
            data={{
              inputs: {
                tipoEvento:      selectedEventType,
                tipoEventoLabel: eventTypes.find(e => e.key === selectedEventType)?.label ?? null,
                duracion:        eventDuration,
                duracionLabel:   quoterConfig.duration[durationMap[eventDuration]].label,
                personas:        selectedPax,
                intensidad:      selectedIntensity,
                intensidadLabel: selectedIntensity ? quoterConfig.intensity[selectedIntensity].label : null,
                estilo:          selectedPackage,
                estiloLabel:     selectedPackage ? packageConfig[selectedPackage].title : null,
                plan:            selectedQuality,
              },
              precios: q ? {
                precioPorPersona: q.pricePerPerson,
                total:            q.pricePerPerson * selectedPax,
                cuota:            Math.round(q.pricePerPerson * selectedPax / quoterConfig.cuotasCantidad),
              } : null,
            }}
          />
        );
      })()}
    </>
  );
}
