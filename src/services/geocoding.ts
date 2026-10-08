import { CITY_COORDS } from '@/lib/demoGeography';
import { type LatLng, haversine } from '@/lib/geo';

export interface ReverseGeocodeResult {
  /** Rótulo curto para exibir ("Jaraguá do Sul"). */
  label: string;
  cityName: string | null;
}

/**
 * Geocodificação reversa (coordenada → nome do lugar). Ponto de extensão: implemente com
 * Mapbox Geocoding, Nominatim (respeitando a política de uso) ou o provedor que o produto escolher.
 */
export interface GeocodingProvider {
  reverse(point: LatLng): Promise<ReverseGeocodeResult>;
}

const CITIES: { name: string; at: LatLng }[] = [
  { name: 'Jaraguá do Sul', at: CITY_COORDS.jaragua },
  { name: 'Joinville', at: CITY_COORDS.joinville },
  { name: 'Blumenau', at: CITY_COORDS.blumenau },
  { name: 'Balneário Camboriú', at: CITY_COORDS.bc },
  { name: 'Florianópolis', at: CITY_COORDS.floripa },
  { name: 'Curitiba', at: CITY_COORDS.curitiba },
];

/** Geocoder offline do modo demonstração: a cidade conhecida mais próxima (até 45 km). */
export class DemoGeocoder implements GeocodingProvider {
  async reverse(point: LatLng): Promise<ReverseGeocodeResult> {
    let best: { name: string; d: number } | null = null;
    for (const c of CITIES) {
      const d = haversine(point, c.at);
      if (!best || d < best.d) best = { name: c.name, d };
    }
    if (best && best.d <= 45_000) return { label: best.name, cityName: best.name };
    return { label: 'Local atual', cityName: null };
  }
}
