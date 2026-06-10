export function trackClarity(eventName: string) {
  try {
    const w = window as any;
    if (typeof w.clarity === 'function') {
      w.clarity('event', eventName);
    }
  } catch { /* nunca romper la app por analytics */ }
}
