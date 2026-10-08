# Mapas

## Como está hoje

`SocialMap` (`src/map/index.ts`) é um contrato; a implementação atual é `RasterMap`:

- **Web Mercator em JS** (`lib/geo.ts`: `project/unproject/fitBounds`), com arrastar, pinça, roda do mouse, botões de zoom, animações e *fit bounds*.
- **Base ilustrativa** (`DemoBasemap`): mar, costa, estradas e cidades do litoral norte de SC + Curitiba — **offline e sem chave**. É só "papel de parede": os dados reais (publicações, lugares, eventos, viagens ao vivo) são desenhados por cima.
- **Tiles raster XYZ** quando configurado: `EXPO_PUBLIC_MAP_PROVIDER=tiles` + `EXPO_PUBLIC_MAP_TILE_URL=https://.../{z}/{x}/{y}.png`. Serve Mapbox (Static Tiles), MapTiler, servidor próprio...
  > ⚠️ O servidor público `tile.openstreetmap.org` **não** é para uso em produção (política de uso). Use um provedor com plano adequado e preencha `EXPO_PUBLIC_MAP_ATTRIBUTION`.
- **Marcadores** (foto, lugar, evento, viagem ao vivo, momento, parada), **clusters** em grade (`map/cluster.ts`), linhas de rota e ponto "você está aqui".

## Contrato

```ts
interface SocialMapProps {
  markers: MapMarker[];            // { id, kind, lat, lng, media?, avatar?, category?, label?, count?, pinned? }
  lines?: MapLine[];               // rotas
  selectedId?: string | null;
  userLocation?: LatLng | null;    // só quando o usuário permitiu
  initial?: { center?; zoom?; fit?: LatLng[] };
  focus?: { key; center?; zoom?; fit? };   // mude `key` para animar até lá
  interactive?; controls?; padding?;
  onMarkerPress?; onMapPress?; onGestureStart?; onViewportChange?; onLocatePress?;
}
```

Nenhuma tela conhece o provedor: elas montam `MapMarker[]` (`features/map/mapItems.ts`) e passam para `SocialMap`.

## Trocar para MapLibre / Mapbox (vetorial, rotação, 3D)

1. `npx expo install @maplibre/maplibre-react-native` (ou `@rnmapbox/maps`) — exige **development build** (`npx expo run:ios|android` ou EAS), não roda no Expo Go.
2. Crie `src/map/MapLibreMap.tsx` implementando `SocialMapProps`:
   - `MapView` + `Camera` (use `focus`/`initial.fit` → `Camera.fitBounds`/`setCamera`);
   - `ShapeSource` + `LineLayer` para `lines`;
   - `MarkerView` para `markers` (reaproveite `MarkerView` de `map/markers.tsx`);
   - `onRegionDidChange` → `onViewportChange({ center, zoom, radiusM })` (use `radiusM` de `lib/geo.viewportRadiusM`);
   - clusters nativos via `ShapeSource cluster` (opcional — o cluster em JS continua válido).
3. Exporte em `src/map/index.ts`: `export const SocialMap = MapLibreMap;`
4. Estilo/tiles: um estilo MapLibre (MapTiler, Protomaps, OpenFreeMap, self-host) — `EXPO_PUBLIC_MAP_STYLE_URL`.

Na web, mantenha o `RasterMap` (ou MapLibre GL JS) por arquivo de plataforma: `index.ts` (nativo) e `index.web.ts`.

## Geocodificação e rotas

- `services/geocoding.ts` define `GeocodingProvider.reverse()`; hoje só há o `DemoGeocoder` (cidade mais próxima). Implemente com Mapbox/Nominatim (respeitando limites) para nomear origem/destino reais.
- **"Como chegar"** abre o app de mapas do aparelho (`lib/links.ts`, URL universal do Google Maps) — não há navegação própria.

## Consultas por área

`repo.getMapItems({ center, radiusM, filter })` já recebe o raio da viewport. No Postgres a consulta usa caixa (lat/lng) com índices; para escala maior, adicione PostGIS (`geography` + GiST) nas tabelas `posts`/`locations` sem alterar a interface.
