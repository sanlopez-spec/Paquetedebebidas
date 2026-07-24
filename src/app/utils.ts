export function trackClarity(eventName: string) {
  try {
    const w = window as any;
    if (typeof w.clarity === 'function') {
      w.clarity('event', eventName);
    }
  } catch { /* nunca romper la app por analytics */ }
}

export function trackGA(eventName: string, params?: Record<string, string | number>) {
  try {
    const w = window as any;
    if (typeof w.gtag === 'function') w.gtag('event', eventName, params || {});
  } catch { /* nunca romper la app por analytics */ }
}

export function trackPixel(eventName: string, params?: Record<string, any>, eventID?: string) {
  try {
    const w = window as any;
    if (typeof w.fbq === 'function') {
      if (eventID) {
        w.fbq('track', eventName, params || {}, { eventID });
      } else {
        w.fbq('track', eventName, params || {});
      }
    }
  } catch { /* nunca romper la app por analytics */ }
}
