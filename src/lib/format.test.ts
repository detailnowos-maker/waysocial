import { formatClock, formatCount, formatDistance, formatDuration, normalize, plural, timeAgo, timeAgoLong } from './format';

const NOW = new Date(2026, 9, 8, 15, 0, 0).getTime();
const ago = (min: number) => NOW - min * 60_000;

describe('formatação pt-BR', () => {
  it('timeAgo', () => {
    expect(timeAgo(ago(0.2), NOW)).toBe('agora');
    expect(timeAgo(ago(5), NOW)).toBe('há 5 min');
    expect(timeAgo(ago(180), NOW)).toBe('há 3 h');
    expect(timeAgo(ago(60 * 30), NOW)).toBe('ontem');
    expect(timeAgo(ago(60 * 24 * 3), NOW)).toBe('há 3 dias');
    expect(timeAgo(ago(60 * 24 * 30), NOW)).toMatch(/^\d{1,2} de (set|ago)$/);
  });
  it('timeAgoLong (cartões do mapa)', () => {
    expect(timeAgoLong(ago(5), NOW)).toBe('há 5 minutos');
    expect(timeAgoLong(ago(1), NOW)).toBe('há 1 minuto');
    expect(timeAgoLong(ago(120), NOW)).toBe('há 2 horas');
  });
  it('distância, cronômetro e duração', () => {
    expect(formatDistance(12_400)).toBe('12,4 km');
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(128_000)).toBe('128 km');
    expect(formatClock(872)).toBe('00:14:32');
    expect(formatDuration(6120)).toBe('1h42');
    expect(formatDuration(840)).toBe('14 min');
  });
  it('contagens e plural', () => {
    expect(formatCount(124)).toBe('124');
    expect(formatCount(1234)).toBe('1,2 mil');
    expect(formatCount(15_000)).toBe('15 mil');
    expect(plural(1, 'parada', 'paradas')).toBe('1 parada');
    expect(plural(2, 'parada', 'paradas')).toBe('2 paradas');
  });
  it('normalize ignora acento e caixa', () => {
    expect(normalize('Balneário Camboriú')).toBe('balneario camboriu');
  });
});
