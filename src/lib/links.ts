import type { LatLng } from './geo';

/**
 * "Como chegar": abre o app de mapas do aparelho (ou o navegador) com a rota até o destino.
 * É a URL universal do Google Maps (`api=1`), que iOS e Android abrem no app instalado.
 */
export function directionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}
