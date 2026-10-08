import { formatDistance, formatDuration, plural } from '@/lib/format';

export interface TripFacts {
  origin: string;
  destination?: string | null;
  distanceM: number;
  durationS: number;
  stopCount: number;
  momentCount: number;
}

/**
 * Texto-padrão do "Resumo da viagem" (usado pelo mock de IA e como fallback).
 * Escrito em terceira pessoa neutra: o mesmo texto é exibido para o dono e para quem vê a viagem.
 */
export function tripSummaryText(f: TripFacts): string {
  const route = f.destination && f.destination !== f.origin ? `entre ${f.origin} e ${f.destination}` : `saindo de ${f.origin}`;
  const parts = [`Foram ${formatDistance(f.distanceM)} ${route} em ${formatDuration(f.durationS)}.`];
  const extras: string[] = [];
  extras.push(f.stopCount === 0 ? 'sem paradas' : plural(f.stopCount, 'parada', 'paradas'));
  extras.push(f.momentCount === 0 ? 'nenhum momento registrado' : `${plural(f.momentCount, 'momento registrado', 'momentos registrados')}`);
  parts.push(`Durante o trajeto: ${extras.join(' e ')}.`);
  return parts.join(' ');
}
