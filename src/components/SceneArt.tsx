import { type ReactNode, useId, useMemo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import type { SceneSpec } from '@/domain/types';
import { mulberry32 } from '@/lib/random';

/**
 * Ilustrações procedurais usadas como "fotos" nos dados de demonstração.
 * Não dependem de rede, de licenças de terceiros nem de arquivos de imagem: cada `SceneSpec`
 * (tipo + semente + variação) gera sempre a mesma cena, em qualquer proporção (modo "cover").
 */

type Variant = NonNullable<SceneSpec['variant']>;

const SKY: Record<Variant, { top: string; bottom: string; sun: string; hill: string; far: string }> = {
  day: { top: '#4FB0F2', bottom: '#C9ECFF', sun: '#FFF4B8', hill: '#6E8DB8', far: '#9DB4D6' },
  golden: { top: '#FF8A5B', bottom: '#FFDDA6', sun: '#FFF8D8', hill: '#9A6A8C', far: '#D79A9C' },
  dusk: { top: '#3F3A8C', bottom: '#F4A092', sun: '#FFD9A8', hill: '#5B4980', far: '#9A7AA8' },
  night: { top: '#080D28', bottom: '#2B2E78', sun: '#F4F1E1', hill: '#1B1F4D', far: '#2A2F6B' },
};

const f = (n: number) => Math.round(n * 10) / 10;

interface Ctx {
  uid: string;
  v: Variant;
  rand: () => number;
  r: (min: number, max: number) => number;
}

function sky(c: Ctx, sunAt?: { x: number; y: number; r: number }): ReactNode {
  const p = SKY[c.v];
  const stars =
    c.v === 'night'
      ? Array.from({ length: 46 }, (_, i) => (
          <Circle key={`s${i}`} cx={f(c.r(6, 394))} cy={f(c.r(6, 300))} r={f(c.r(0.6, 1.8))} fill="#FFFFFF" opacity={f(c.r(0.4, 1))} />
        ))
      : null;
  const clouds =
    c.v === 'night'
      ? null
      : Array.from({ length: 3 }, (_, i) => {
          const x = c.r(30, 340);
          const y = c.r(50, 170);
          const s = c.r(0.7, 1.3);
          return (
            <G key={`c${i}`} opacity={c.v === 'day' ? 0.9 : 0.55} fill="#FFFFFF">
              <Ellipse cx={f(x)} cy={f(y)} rx={f(34 * s)} ry={f(11 * s)} />
              <Ellipse cx={f(x + 20 * s)} cy={f(y - 8 * s)} rx={f(22 * s)} ry={f(10 * s)} />
              <Ellipse cx={f(x - 22 * s)} cy={f(y - 4 * s)} rx={f(18 * s)} ry={f(8 * s)} />
            </G>
          );
        });
  return (
    <>
      <Defs>
        <LinearGradient id={`${c.uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.top} />
          <Stop offset="1" stopColor={p.bottom} />
        </LinearGradient>
      </Defs>
      <Rect width="400" height="500" fill={`url(#${c.uid}sky)`} />
      {stars}
      {sunAt ? (
        <>
          <Circle cx={sunAt.x} cy={sunAt.y} r={f(sunAt.r * 2.2)} fill={p.sun} opacity={0.22} />
          <Circle cx={sunAt.x} cy={sunAt.y} r={f(sunAt.r * 1.5)} fill={p.sun} opacity={0.3} />
          <Circle cx={sunAt.x} cy={sunAt.y} r={sunAt.r} fill={p.sun} />
        </>
      ) : null}
      {clouds}
    </>
  );
}

function ridge(c: Ctx, baseY: number, amp: number, fill: string, peaks = 6, snow = false): ReactNode {
  const pts: [number, number][] = [[-10, 520]];
  const step = 420 / peaks;
  for (let i = 0; i <= peaks; i++) {
    pts.push([f(-10 + i * step + c.r(-12, 12)), f(baseY - c.r(amp * 0.3, amp))]);
    if (i < peaks) pts.push([f(-10 + i * step + step / 2), f(baseY + c.r(0, amp * 0.25))]);
  }
  pts.push([410, 520]);
  const caps = snow
    ? pts
        .filter((p, i) => i > 0 && i < pts.length - 1 && p[1] < baseY - amp * 0.7)
        .map((p, i) => <Polygon key={`sn${i}`} points={`${p[0]},${p[1]} ${p[0] - 13},${p[1] + 20} ${p[0] - 3},${p[1] + 15} ${p[0] + 4},${p[1] + 22} ${p[0] + 13},${p[1] + 18}`} fill="#FFFFFF" opacity={0.92} />)
    : null;
  return (
    <>
      <Polygon points={pts.map((p) => p.join(',')).join(' ')} fill={fill} />
      {caps}
    </>
  );
}

function pine(x: number, y: number, s: number, fill: string, key: string): ReactNode {
  return (
    <G key={key}>
      <Rect x={f(x - 2 * s)} y={f(y)} width={f(4 * s)} height={f(10 * s)} fill="#3B2A1E" />
      <Polygon points={`${x},${f(y - 42 * s)} ${f(x - 15 * s)},${f(y - 8 * s)} ${f(x + 15 * s)},${f(y - 8 * s)}`} fill={fill} />
      <Polygon points={`${x},${f(y - 30 * s)} ${f(x - 19 * s)},${f(y + 2 * s)} ${f(x + 19 * s)},${f(y + 2 * s)}`} fill={fill} />
    </G>
  );
}

// --- cenas ---------------------------------------------------------------------------------------

function beach(c: Ctx, skyline: boolean): ReactNode {
  const horizon = 292;
  const sunY = c.v === 'golden' || c.v === 'dusk' ? horizon - 34 : c.r(110, 170);
  const buildings = skyline
    ? Array.from({ length: 15 }, (_, i) => {
        const w = c.r(16, 34);
        const h = c.r(46, 150);
        const x = i * 28 + c.r(-4, 4);
        return <Rect key={`b${i}`} x={f(x)} y={f(horizon - h)} width={f(w)} height={f(h)} fill={c.v === 'day' ? '#8CA2C6' : c.v === 'night' ? '#202556' : '#6E5688'} opacity={0.92} />;
      })
    : null;
  const waves = Array.from({ length: 9 }, (_, i) => {
    const y = horizon + 14 + i * 11 + c.r(-2, 2);
    const x = c.r(-20, 340);
    return <Path key={`w${i}`} d={`M${f(x)} ${f(y)} q 14 -7 28 0 t 28 0 t 28 0`} stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={f(c.r(0.25, 0.6))} />;
  });
  const sea = c.v === 'night' ? ['#16347A', '#0B1844'] : c.v === 'day' ? ['#37BEE0', '#1583B5'] : ['#F0A07C', '#8E4C86'];
  const flip = c.rand() < 0.5;
  const umbrellaX = flip ? c.r(210, 270) : c.r(30, 110);
  const umbrellaColor = ['#FF5A6E', '#FFB03D', '#7A5CFF', '#16C47F'][Math.floor(c.rand() * 4)];
  const boatX = c.r(40, 300);
  const boat =
    c.rand() < 0.65 && c.v !== 'night' ? (
      <G key="boat">
        <Path d={`M${f(boatX)} ${horizon + 34} h46 l-6 9 h-34 z`} fill="#FFFFFF" />
        <Polygon points={`${f(boatX + 22)},${horizon + 4} ${f(boatX + 22)},${horizon + 32} ${f(boatX + 4)},${horizon + 32}`} fill="#FFFFFF" opacity={0.95} />
        <Polygon points={`${f(boatX + 25)},${horizon + 10} ${f(boatX + 25)},${horizon + 32} ${f(boatX + 40)},${horizon + 32}`} fill="#FFD9A0" />
      </G>
    ) : null;
  const birds =
    c.v === 'night'
      ? null
      : Array.from({ length: 3 }, (_, i) => {
          const bx = c.r(40, 330);
          const by = c.r(70, 150);
          return <Path key={`bd${i}`} d={`M${f(bx)} ${f(by)} q 6 -7 12 0 q 6 -7 12 0`} stroke="#3B4256" strokeWidth={1.8} fill="none" opacity={0.55} />;
        });
  return (
    <>
      {sky(c, { x: f(c.r(90, 310)), y: f(sunY), r: 36 })}
      {buildings}
      <Defs>
        <LinearGradient id={`${c.uid}sea`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sea[0]} />
          <Stop offset="1" stopColor={sea[1]} />
        </LinearGradient>
        <LinearGradient id={`${c.uid}sand`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F6DFAE" />
          <Stop offset="1" stopColor="#E3BE82" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y={horizon} width="400" height="130" fill={`url(#${c.uid}sea)`} />
      {waves}
      <Path d={`M0 ${horizon + 118} Q 80 ${horizon + 96} 170 ${horizon + 112} T 400 ${horizon + 100} L400 500 L0 500 Z`} fill="#FFFFFF" opacity={0.7} />
      <Path d={`M0 ${horizon + 126} Q 90 ${horizon + 104} 180 ${horizon + 120} T 400 ${horizon + 110} L400 500 L0 500 Z`} fill={`url(#${c.uid}sand)`} />
      {boat}
      {birds}
      <G transform={flip ? 'translate(400 0) scale(-1 1)' : undefined}>
        <Path d="M332 500 C 336 440 322 390 300 338" stroke="#6B4A2B" strokeWidth={9} fill="none" strokeLinecap="round" />
        {[-60, -20, 25, 65, 110, 150].map((a, i) => (
          <G key={`lf${i}`} transform={`rotate(${a} 300 338)`}>
            <Ellipse cx={300} cy={f(318 - (i % 2) * 4)} rx={9} ry={f(44)} fill={i % 2 ? '#2F9E5B' : '#3DB36B'} />
          </G>
        ))}
      </G>
      <G transform={`translate(${umbrellaX} 0)`}>
        <Path d="M0 452 Q 48 392 98 452 Z" fill={umbrellaColor} />
        <Path d="M48 392 L48 452" stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
        <Path d="M48 392 L48 492" stroke="#7B5A3A" strokeWidth={3} />
        <Ellipse cx={48} cy={496} rx={46} ry={7} fill="#000000" opacity={0.08} />
      </G>
    </>
  );
}

function sunsetRoad(c: Ctx): ReactNode {
  const horizon = 282;
  const dashes = Array.from({ length: 8 }, (_, i) => {
    const t0 = (i / 8) ** 1.7;
    const t1 = t0 + ((1 / 8) ** 1.0) * (0.22 + (i / 8) * 0.9) * 0.55;
    const y0 = horizon + (500 - horizon) * t0;
    const y1 = horizon + (500 - horizon) * Math.min(1, t1);
    const w0 = 1 + 7 * t0;
    const w1 = 1 + 7 * Math.min(1, t1);
    return <Polygon key={`d${i}`} points={`${200 - w0 / 2},${f(y0)} ${200 + w0 / 2},${f(y0)} ${200 + w1 / 2},${f(y1)} ${200 - w1 / 2},${f(y1)}`} fill="#FFE08A" opacity={0.95} />;
  });
  const p = SKY[c.v];
  return (
    <>
      {sky(c, { x: 200, y: horizon - 6, r: 62 })}
      {ridge(c, horizon + 6, 46, p.far, 7)}
      {ridge(c, horizon + 22, 34, p.hill, 9)}
      <Rect x="0" y={horizon + 18} width="400" height="240" fill={c.v === 'night' ? '#0D1030' : '#2B2342'} />
      <Polygon points={`192,${horizon + 10} 208,${horizon + 10} 372,500 28,500`} fill="#1B1829" />
      <Path d={`M192 ${horizon + 10} L28 500`} stroke="#FFFFFF" strokeWidth={2.5} opacity={0.45} />
      <Path d={`M208 ${horizon + 10} L372 500`} stroke="#FFFFFF" strokeWidth={2.5} opacity={0.45} />
      {dashes}
      {[-1, 1].map((side) =>
        [0.1, 0.3, 0.6].map((t, i) => {
          const y = horizon + 12 + (500 - horizon) * t * t * 1.15;
          const x = 200 + side * (14 + 150 * t * t * 1.2);
          const h = 14 + 120 * t * t;
          return <Rect key={`p${side}${i}`} x={f(x)} y={f(y - h)} width={f(1.5 + 4 * t)} height={f(h)} fill="#120F1E" />;
        }),
      )}
    </>
  );
}

function mountain(c: Ctx, withSea: boolean): ReactNode {
  const p = SKY[c.v];
  const forest = c.v === 'night' ? '#0E2A2A' : c.v === 'day' ? '#2F6B58' : '#3A4B5E';
  const trees = Array.from({ length: 9 }, (_, i) => pine(f(20 + i * 44 + c.r(-10, 10)), f(c.r(396, 440)), f(c.r(0.9, 1.5)), c.v === 'night' ? '#0A2020' : '#1E4D3E', `t${i}`));
  return (
    <>
      {sky(c, { x: f(c.r(90, 310)), y: f(c.r(100, 150)), r: 32 })}
      {ridge(c, 290, 110, p.far, 5, true)}
      {ridge(c, 336, 90, p.hill, 6)}
      {withSea ? (
        <>
          <Defs>
            <LinearGradient id={`${c.uid}sea`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.v === 'day' ? '#46C6E2' : '#F0A07C'} />
              <Stop offset="1" stopColor={c.v === 'day' ? '#1B86B8' : '#8E4C86'} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="360" width="400" height="60" fill={`url(#${c.uid}sea)`} opacity={0.95} />
        </>
      ) : null}
      {ridge(c, 410, 58, forest, 7)}
      {trees}
      <Rect x="0" y="448" width="400" height="60" fill={c.v === 'night' ? '#0A1E1E' : '#244F42'} />
      <Rect x="0" y="452" width="400" height="6" fill="#B58B5C" opacity={0.9} />
      {Array.from({ length: 12 }, (_, i) => (
        <Rect key={`rl${i}`} x={f(i * 36 + 6)} y={438} width={4} height={26} rx={2} fill="#2A2018" />
      ))}
    </>
  );
}

function cityScene(c: Ctx): ReactNode {
  const dark = c.v === 'night' || c.v === 'dusk';
  const layer = (n: number, hMin: number, hMax: number, base: number, fill: string, lit: number, keyP: string) =>
    Array.from({ length: n }, (_, i) => {
      const w = c.r(22, 48);
      const h = c.r(hMin, hMax);
      const x = (i * 410) / n + c.r(-8, 8);
      const wins: ReactNode[] = [];
      for (let gy = base - h + 10; gy < base - 10; gy += 14) {
        for (let gx = x + 5; gx < x + w - 6; gx += 10) {
          if (c.rand() < lit) wins.push(<Rect key={`${keyP}w${i}-${f(gx)}-${f(gy)}`} x={f(gx)} y={f(gy)} width={4} height={6} fill="#FFD36B" opacity={0.9} />);
        }
      }
      return (
        <G key={`${keyP}${i}`}>
          <Rect x={f(x)} y={f(base - h)} width={f(w)} height={f(h)} fill={fill} />
          {wins}
        </G>
      );
    });
  return (
    <>
      {sky(c, { x: f(c.r(80, 320)), y: f(c.r(120, 190)), r: 30 })}
      {layer(11, 70, 190, 360, dark ? '#2A2F63' : '#8FA2C4', dark ? 0.45 : 0.1, 'b')}
      {layer(9, 90, 260, 410, dark ? '#171B45' : '#5E7399', dark ? 0.5 : 0.18, 'f')}
      {[0, 1, 2].map((i) => {
        const x = 40 + i * 140 + c.r(-10, 10);
        return (
          <G key={`h${i}`}>
            <Rect x={x} y={400} width={88} height={64} fill="#F0DFC0" />
            <Polygon points={`${x - 8},400 ${x + 44},350 ${x + 96},400`} fill="#B5443B" />
            <Rect x={x + 14} y={418} width={16} height={22} fill="#5E3B2A" />
            <Rect x={x + 52} y={418} width={20} height={16} fill="#FFD36B" opacity={dark ? 0.95 : 0.6} />
            <Path d={`M${x} 420 L${x + 88} 420 M${x + 44} 400 L${x + 44} 464`} stroke="#7A4B30" strokeWidth={2} opacity={0.6} />
          </G>
        );
      })}
      <Rect x="0" y="462" width="400" height="40" fill={dark ? '#14152E' : '#6B6F82'} />
      <Path d="M0 482 L400 482" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="14 14" opacity={0.5} />
    </>
  );
}

function food(c: Ctx): ReactNode {
  const items = ['#E8A23B', '#D9792E', '#E5C15A'];
  const garnish = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + c.rand() * 0.4;
    const rr = c.r(52, 100);
    return <Circle key={`g${i}`} cx={f(200 + Math.cos(a) * rr)} cy={f(252 + Math.sin(a) * rr)} r={f(c.r(7, 15))} fill={i % 3 === 0 ? '#D94A3D' : i % 3 === 1 ? '#4CAF63' : '#F2E27A'} opacity={0.95} />;
  });
  return (
    <>
      <Defs>
        <LinearGradient id={`${c.uid}wood`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B27B4A" />
          <Stop offset="1" stopColor="#8B5A33" />
        </LinearGradient>
        <LinearGradient id={`${c.uid}plate`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E9E4DA" />
        </LinearGradient>
        <LinearGradient id={`${c.uid}glass`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE6A3" />
          <Stop offset="1" stopColor="#E7A53A" />
        </LinearGradient>
      </Defs>
      <Rect width="400" height="500" fill={`url(#${c.uid}wood)`} />
      {[70, 160, 250, 340, 430].map((y) => (
        <Path key={`pl${y}`} d={`M0 ${y} L400 ${y}`} stroke="#6E4527" strokeWidth={2} opacity={0.35} />
      ))}
      <Ellipse cx={206} cy={282} rx={162} ry={158} fill="#000000" opacity={0.18} />
      <Circle cx={200} cy={262} r={158} fill={`url(#${c.uid}plate)`} />
      <Circle cx={200} cy={262} r={122} fill="#F4F1EA" stroke="#E2DCCF" strokeWidth={3} />
      <Circle cx={200} cy={254} r={74} fill={items[Math.floor(c.rand() * items.length)]} />
      <Circle cx={182} cy={238} r={26} fill="#F6C76B" opacity={0.7} />
      <Circle cx={222} cy={270} r={22} fill="#C96B25" opacity={0.6} />
      {garnish}
      <Rect x={22} y={140} width={9} height={220} rx={4} fill="#CFCFD6" />
      <Rect x={20} y={110} width={13} height={50} rx={5} fill="#D9D9E0" />
      <Rect x={370} y={150} width={9} height={210} rx={4} fill="#CFCFD6" />
      <Path d="M366 110 h20 v50 h-20 z" fill="#D9D9E0" />
      <Path d="M300 40 h66 l-8 120 h-50 z" fill={`url(#${c.uid}glass)`} opacity={0.95} />
      <Rect x={300} y={40} width={66} height={14} fill="#FFFFFF" opacity={0.7} />
    </>
  );
}

function park(c: Ctx): ReactNode {
  const tree = (x: number, y: number, s: number, key: string) => (
    <G key={key}>
      <Rect x={f(x - 4 * s)} y={f(y)} width={f(8 * s)} height={f(34 * s)} fill="#6B4A2B" />
      <Circle cx={x} cy={f(y - 8 * s)} r={f(26 * s)} fill="#2F9E5B" />
      <Circle cx={f(x - 16 * s)} cy={f(y + 4 * s)} r={f(18 * s)} fill="#3DB36B" />
      <Circle cx={f(x + 16 * s)} cy={f(y + 2 * s)} r={f(19 * s)} fill="#37A862" />
    </G>
  );
  const night = c.v === 'night';
  return (
    <>
      {sky(c, { x: f(c.r(90, 300)), y: f(c.r(100, 150)), r: 30 })}
      <Ellipse cx={90} cy={330} rx={300} ry={90} fill={night ? '#0F3B2C' : '#8BCB6B'} />
      <Ellipse cx={330} cy={360} rx={280} ry={80} fill={night ? '#0C3225' : '#6FBF5E'} />
      <Rect x="0" y="380" width="400" height="130" fill={night ? '#0A2A20' : '#4EA652'} />
      {[tree(52, 330, 1.1, 't1'), tree(340, 320, 1.3, 't2'), tree(260, 345, 0.8, 't3'), tree(130, 352, 0.7, 't4')]}
      <Ellipse cx={210} cy={430} rx={110} ry={26} fill="#5CC0E6" opacity={0.95} />
      <Ellipse cx={200} cy={426} rx={60} ry={9} fill="#FFFFFF" opacity={0.35} />
      <Path d="M-10 500 C 80 470 150 450 230 480 C 290 500 340 470 420 440 L420 510 L-10 510 Z" fill="#E7D4A6" opacity={0.9} />
      {Array.from({ length: 26 }, (_, i) => (
        <Circle key={`fl${i}`} cx={f(c.r(0, 400))} cy={f(c.r(440, 500))} r={f(c.r(2.5, 4.5))} fill={['#FF7AA8', '#FFD84D', '#FFFFFF', '#B692FF'][i % 4]} />
      ))}
    </>
  );
}

function nightEvent(c: Ctx): ReactNode {
  const crowd = Array.from({ length: 18 }, (_, i) => {
    const x = (i * 400) / 17 + c.r(-10, 10);
    const y = 438 + c.r(-10, 18);
    const s = c.r(0.9, 1.4);
    return (
      <G key={`cr${i}`}>
        <Circle cx={f(x)} cy={f(y - 22 * s)} r={f(11 * s)} fill="#06081A" />
        <Path d={`M${f(x - 20 * s)} ${f(y + 40)} Q ${f(x)} ${f(y - 22 * s)} ${f(x + 20 * s)} ${f(y + 40)} Z`} fill="#06081A" />
      </G>
    );
  });
  const colors = ['#FF3D77', '#7A5CFF', '#33C6FF', '#FFB03D'];
  return (
    <>
      {sky(c, { x: f(c.r(280, 340)), y: f(c.r(80, 120)), r: 22 })}
      {[0, 1, 2, 3].map((i) => {
        const x = 70 + i * 86;
        return <Polygon key={`beam${i}`} points={`${x},0 ${x - 56 + i * 12},330 ${x + 70 - i * 12},330`} fill={colors[i]} opacity={0.2} />;
      })}
      <Path d="M-10 70 Q 200 150 410 70" stroke="#2B2B3F" strokeWidth={2} fill="none" />
      {Array.from({ length: 14 }, (_, i) => {
        const t = i / 13;
        const x = -10 + t * 420;
        const y = 70 + Math.sin(t * Math.PI) * 52;
        return (
          <G key={`ls${i}`}>
            <Circle cx={f(x)} cy={f(y + 6)} r={9} fill="#FFD36B" opacity={0.28} />
            <Circle cx={f(x)} cy={f(y + 6)} r={4} fill="#FFE9A8" />
          </G>
        );
      })}
      <Rect x="40" y="330" width="320" height="22" rx={4} fill="#14153A" />
      <Rect x="40" y="326" width="320" height="6" fill={colors[Math.floor(c.rand() * 4)]} opacity={0.9} />
      <Rect x="0" y="352" width="400" height="160" fill="#0B0D26" />
      {crowd}
    </>
  );
}

function viewpoint(c: Ctx): ReactNode {
  const p = SKY[c.v];
  return (
    <>
      {sky(c, { x: f(c.r(100, 300)), y: f(c.r(120, 180)), r: 34 })}
      {ridge(c, 250, 70, p.far, 5, false)}
      <Defs>
        <LinearGradient id={`${c.uid}sea`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.v === 'day' ? '#4CC8E4' : '#F2A68A'} />
          <Stop offset="1" stopColor={c.v === 'day' ? '#1D8DBE' : '#93507F'} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="262" width="400" height="86" fill={`url(#${c.uid}sea)`} />
      {ridge(c, 372, 70, p.hill, 6)}
      {ridge(c, 440, 54, c.v === 'night' ? '#0E2A2A' : '#2E6B54', 8)}
      <Rect x="0" y="446" width="400" height="60" fill="#1D3F33" />
      <Rect x="0" y="426" width="400" height="8" fill="#3A2A20" />
      {Array.from({ length: 10 }, (_, i) => (
        <Rect key={`rp${i}`} x={f(i * 44 + 8)} y={400} width={6} height={50} fill="#3A2A20" />
      ))}
      <Path d="M0 410 L400 410" stroke="#3A2A20" strokeWidth={5} />
    </>
  );
}

function renderScene(scene: SceneSpec, uid: string): ReactNode {
  const rand = mulberry32(scene.seed);
  const defaultVariant: Record<SceneSpec['kind'], Variant> = {
    beach: 'day',
    sunset: 'dusk',
    mountain: 'day',
    city: 'dusk',
    food: 'day',
    park: 'day',
    night: 'night',
    viewpoint: 'golden',
  };
  const v = scene.variant ?? defaultVariant[scene.kind];
  const c: Ctx = { uid, v, rand, r: (min, max) => min + rand() * (max - min) };
  switch (scene.kind) {
    case 'beach':
      return beach(c, scene.skyline === true);
    case 'sunset':
      return sunsetRoad(c);
    case 'mountain':
      return mountain(c, false);
    case 'city':
      return cityScene(c);
    case 'food':
      return food(c);
    case 'park':
      return park(c);
    case 'night':
      return nightEvent(c);
    case 'viewpoint':
      return viewpoint(c);
  }
}

interface SceneArtProps {
  scene: SceneSpec;
  style?: StyleProp<ViewStyle>;
}

export function SceneArt({ scene, style }: SceneArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const body = useMemo(() => renderScene(scene, uid), [scene.kind, scene.seed, scene.variant, scene.skyline, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[styles.box, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
        {body}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#CFE3F2' },
});
