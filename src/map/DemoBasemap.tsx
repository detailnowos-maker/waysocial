import { memo } from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { CITY_COORDS, ISLAND_COAST, MAINLAND_COAST, RIVER_ITAJAI, ROADS, TOWNS } from '@/lib/demoGeography';
import { type LatLng, project } from '@/lib/geo';
import { colors } from '@/theme';

/**
 * Mapa ilustrativo (offline, sem chave): mar, terra, estradas e nomes das cidades.
 * É só o "papel de parede" do mapa — as publicações, lugares e viagens são desenhados por cima.
 * Em produção, troque por um provedor real (ver docs/MAPS.md).
 */

const LABELS: { name: string; at: LatLng; dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end' }[] = [
  { name: 'Curitiba', at: CITY_COORDS.curitiba, dx: 26, dy: 3 },
  { name: 'Joinville', at: CITY_COORDS.joinville, dx: -26, dy: 3, anchor: 'end' },
  { name: 'Jaraguá do Sul', at: CITY_COORDS.jaragua, dx: -26, dy: 3, anchor: 'end' },
  { name: 'Blumenau', at: CITY_COORDS.blumenau, dx: -26, dy: 3, anchor: 'end' },
  { name: 'Balneário Camboriú', at: CITY_COORDS.bc, dx: -28, dy: 28, anchor: 'end' },
  { name: 'Florianópolis', at: CITY_COORDS.floripa, dx: -26, dy: 3, anchor: 'end' },
];

/** Manchas verdes (serra/parques), só para dar textura. */
const GREEN: LatLng[][] = [
  [
    { lat: -26.0, lng: -49.45 },
    { lat: -26.2, lng: -49.1 },
    { lat: -26.5, lng: -49.2 },
    { lat: -26.7, lng: -49.4 },
    { lat: -26.4, lng: -49.6 },
  ],
  [
    { lat: -27.05, lng: -49.2 },
    { lat: -27.25, lng: -48.85 },
    { lat: -27.5, lng: -48.9 },
    { lat: -27.6, lng: -49.2 },
    { lat: -27.3, lng: -49.4 },
  ],
  [
    { lat: -25.55, lng: -48.95 },
    { lat: -25.8, lng: -48.8 },
    { lat: -26.05, lng: -49.0 },
    { lat: -25.8, lng: -49.25 },
  ],
];

const WEST_EDGE = -53;

interface Props {
  center: LatLng;
  zoom: number;
  width: number;
  height: number;
}

function DemoBasemapBase({ center, zoom, width, height }: Props) {
  const c = project(center, zoom);
  const px = (p: LatLng) => {
    const w = project(p, zoom);
    return { x: width / 2 + w.x - c.x, y: height / 2 + w.y - c.y };
  };
  const path = (pts: LatLng[], close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p).x.toFixed(1)} ${px(p).y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');

  const mainland = [{ lat: -23.2, lng: WEST_EDGE }, ...MAINLAND_COAST, { lat: -28.5, lng: WEST_EDGE }];
  const land = path(mainland, true);
  const island = path(ISLAND_COAST, true);
  const roadW = Math.max(1.2, (zoom - 5.5) * 0.9);
  const showLabels = zoom >= 6.5;
  const fs = Math.max(11, Math.min(15, 8 + zoom * 0.55));

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Rect width={width} height={height} fill={colors.sea} />
      {/* águas rasas */}
      <Path d={land} fill="none" stroke="#DCEEF6" strokeWidth={22} strokeLinejoin="round" />
      <Path d={island} fill="none" stroke="#DCEEF6" strokeWidth={22} strokeLinejoin="round" />
      <Path d={land} fill="none" stroke="#E8F4F9" strokeWidth={10} strokeLinejoin="round" />
      <Path d={island} fill="none" stroke="#E8F4F9" strokeWidth={10} strokeLinejoin="round" />
      <Path d={land} fill={colors.land} stroke="#DAD3C4" strokeWidth={1.4} strokeLinejoin="round" />
      <Path d={island} fill={colors.land} stroke="#DAD3C4" strokeWidth={1.4} strokeLinejoin="round" />
      {GREEN.map((g, i) => (
        <Path key={`g${i}`} d={path(g, true)} fill="#E4ECD8" opacity={0.85} />
      ))}
      <Path d={path(RIVER_ITAJAI)} fill="none" stroke="#C5E0EE" strokeWidth={Math.max(2, (zoom - 6) * 0.8)} strokeLinecap="round" strokeLinejoin="round" />
      {/* estradas */}
      {Object.entries(ROADS).map(([name, pts]) => (
        <Path key={`rc-${name}`} d={path(pts)} fill="none" stroke="#E2DCCF" strokeWidth={roadW + 2.4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {Object.entries(ROADS).map(([name, pts]) => (
        <Path key={`rf-${name}`} d={path(pts)} fill="none" stroke={name === 'br101' ? '#FFFFFF' : '#FBF9F4'} strokeWidth={name === 'br101' ? roadW + 0.6 : roadW} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {showLabels
        ? LABELS.map((l) => {
            const p = px(l.at);
            const x = p.x + (l.dx ?? 9);
            const y = p.y + (l.dy ?? 4);
            const anchor = l.anchor ?? 'start';
            return (
              <G key={l.name}>
                <Circle cx={p.x} cy={p.y} r={3.2} fill="#8B92A1" />
                <SvgText x={x} y={y} fontSize={fs} fontWeight="700" fill="none" stroke="#F3F0EA" strokeWidth={4} textAnchor={anchor} strokeLinejoin="round">
                  {l.name}
                </SvgText>
                <SvgText x={x} y={y} fontSize={fs} fontWeight="700" fill="#4B5262" textAnchor={anchor}>
                  {l.name}
                </SvgText>
              </G>
            );
          })
        : null}
      {zoom >= 9.3
        ? TOWNS.map((t) => {
            const p = px(t.at);
            if (p.x < -60 || p.x > width + 60 || p.y < -20 || p.y > height + 20) return null;
            return (
              <G key={t.name}>
                <Circle cx={p.x} cy={p.y} r={2.4} fill="#A9AFBB" />
                <SvgText x={p.x + 6} y={p.y + 3.5} fontSize={10.5} fontWeight="600" fill="none" stroke="#F3F0EA" strokeWidth={3.5} strokeLinejoin="round">
                  {t.name}
                </SvgText>
                <SvgText x={p.x + 6} y={p.y + 3.5} fontSize={10.5} fontWeight="600" fill="#8B92A1">
                  {t.name}
                </SvgText>
              </G>
            );
          })
        : null}
      {zoom >= 6.5 && zoom < 11 ? (
        <SvgText x={px({ lat: -26.4, lng: -47.95 }).x} y={px({ lat: -26.4, lng: -47.95 }).y} fontSize={13} fontStyle="italic" fill="#8FB7CC" textAnchor="middle" letterSpacing={2}>
          OCEANO ATLÂNTICO
        </SvgText>
      ) : null}
    </Svg>
  );
}

export const DemoBasemap = memo(DemoBasemapBase);
