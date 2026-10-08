import type { IconName } from '@/components/ui';
import type { MapItem } from '@/domain/types';
import { timeAgoLong } from '@/lib/format';
import type { MapMarker } from '@/map';

const firstName = (name: string) => name.split(' ')[0];

export function itemToMarker(item: MapItem): MapMarker {
  switch (item.type) {
    case 'post':
      return { id: item.id, kind: 'post', lat: item.lat, lng: item.lng, media: item.post.media[0], count: item.count, label: item.post.place?.name };
    case 'place':
      return { id: item.id, kind: 'place', lat: item.lat, lng: item.lng, category: item.place.category, label: item.place.name };
    case 'event':
      return { id: item.id, kind: 'event', lat: item.lat, lng: item.lng, category: 'event', label: item.place.name, count: item.pulse.peopleNow, pinned: true };
    case 'live':
      return { id: item.id, kind: 'live', lat: item.lat, lng: item.lng, avatar: item.trip.owner, label: item.trip.owner.displayName };
  }
}

export interface ActivityCard {
  id: string;
  itemId: string;
  icon: IconName;
  tone: 'brand' | 'live' | 'neutral';
  title: string;
  text: string;
  score: number;
}

/**
 * Transforma o que está no mapa em frases curtas ("Pedro publicou uma foto aqui há 5 minutos"),
 * ordenadas por relevância: eventos e viagens ao vivo primeiro, depois os lugares mais movimentados.
 */
export function buildActivityCards(items: MapItem[], now: number = Date.now()): ActivityCard[] {
  const cards: ActivityCard[] = [];
  for (const item of items) {
    if (item.type === 'event') {
      cards.push({ id: `a-${item.id}`, itemId: item.id, icon: 'sparkles', tone: 'brand', title: item.place.name, text: `${item.pulse.peopleNow} pessoas estão aqui agora`, score: 100 + item.pulse.peopleNow });
    } else if (item.type === 'live') {
      const dest = item.trip.plannedDestination;
      cards.push({
        id: `a-${item.id}`,
        itemId: item.id,
        icon: 'navigate',
        tone: 'live',
        title: 'Estrada',
        text: `${firstName(item.trip.owner.displayName)} está viajando${dest ? ` para ${dest}` : ''}`,
        score: 90,
      });
    } else if (item.type === 'post') {
      const place = item.post.place;
      if (!place) continue;
      const ageMin = (now - new Date(item.post.createdAt).getTime()) / 60000;
      const pulse = item.pulse;
      if (pulse && pulse.postsToday >= 8) {
        cards.push({ id: `a-${item.id}-pulse`, itemId: item.id, icon: 'images', tone: 'neutral', title: place.name, text: `${pulse.postsToday} pessoas publicaram fotos hoje`, score: 50 + pulse.postsToday });
      }
      if (ageMin <= 360) {
        cards.push({ id: `a-${item.id}`, itemId: item.id, icon: 'camera', tone: 'neutral', title: place.name, text: `${firstName(item.post.author.displayName)} publicou uma foto aqui ${timeAgoLong(item.post.createdAt, now)}`, score: 80 - ageMin / 10 });
      }
    }
  }
  return cards.sort((a, b) => b.score - a.score).slice(0, 12);
}
