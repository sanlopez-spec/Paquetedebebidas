import { packagesData, bottleSizes, pricePercentages } from './data';

type Categories = {
  spirits: boolean;
  vinos: boolean;
  espumante: boolean;
  gaseosas: boolean;
  cerveza: boolean;
};

type IntensityData = typeof packagesData[keyof typeof packagesData];
export type PackageItem = IntensityData['packages'][0];

export function calculateLitersPerPerson(
  intensity: keyof typeof packagesData | null,
  selectedCategories: Categories
): string {
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
  return (totalMl / 1000 / 100).toFixed(1);
}

export function calculateAdjustedPrice(
  basePrice: number,
  quality: string,
  selectedCategories: Categories
): number {
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
}

export function getTotalVarieties(pkg: PackageItem): number {
  return pkg.bebidasBase + pkg.bebidasPremium + pkg.bebidasIcon;
}

export function calculateAdjustedQuantities(
  intensityData: IntensityData,
  pax: number
): Record<keyof IntensityData['quantities'], number> {
  const multiplier = pax / 100;
  return {
    spirits: Math.floor(intensityData.quantities.spirits * multiplier),
    vinos: Math.floor(intensityData.quantities.vinos * multiplier),
    espumante: Math.floor(intensityData.quantities.espumante * multiplier),
    gaseosas: Math.floor(intensityData.quantities.gaseosas * multiplier),
    cerveza: Math.floor(intensityData.quantities.cerveza * multiplier),
  };
}
