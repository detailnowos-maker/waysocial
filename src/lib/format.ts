/** Formatação de texto em pt-BR. Funções puras (recebem `now` para serem testáveis). */

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function timeAgo(iso: string | number | Date, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  const date = new Date(t);
  return `${date.getDate()} de ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "há 5 minutos" por extenso — usado nos cartões do mapa. */
export function timeAgoLong(iso: string | number | Date, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

export function formatDateTime(iso: string | number | Date): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]} · ${hh}:${mm}`;
}

export function formatDateShort(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** 1234 → "1,2 mil" · 1500000 → "1,5 mi" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',').replace(',0', '')} mil`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} mi`;
}

/** 12400 → "12,4 km" · 850 → "850 m" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 100 ? 1 : 0).replace('.', ',')} km`;
}

/** 872 → "00:14:32" — cronômetro da viagem ativa. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

/** 6120 → "1h42" · 840 → "14 min" */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Remove acentos e caixa — busca tolerante ("balneario camboriu" acha "Balneário Camboriú"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
