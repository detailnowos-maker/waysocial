import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/ui';
import { env } from '@/config/env';
import { type LatLng, boundsOf, fitBounds, project, unproject, viewportRadiusM } from '@/lib/geo';
import { colors, radius, shadow, space } from '@/theme';

import { clusterMarkers } from './cluster';
import { DemoBasemap } from './DemoBasemap';
import { MarkerView, UserDot, markerSize } from './markers';
import { TileLayer } from './TileLayer';
import type { MapMarker, SocialMapProps } from './types';

const MIN_ZOOM = 4;
const MAX_ZOOM = 17;
const DEFAULT_VIEW = { center: { lat: -26.7, lng: -48.9 }, zoom: 8.5 };

interface ViewState {
  center: LatLng;
  zoom: number;
}

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * Implementação do `SocialMap` em Web Mercator puro (sem módulo nativo): funciona no Expo Go, no
 * navegador e em qualquer aparelho. A base é o mapa ilustrativo OU uma camada de tiles raster XYZ
 * configurada por `EXPO_PUBLIC_MAP_TILE_URL`. Marcadores, clusters, rotas e gestos são os mesmos nos dois casos.
 */
export function RasterMap({
  markers,
  lines = [],
  selectedId = null,
  userLocation = null,
  initial,
  focus,
  interactive = true,
  controls = true,
  padding,
  onMarkerPress,
  onMapPress,
  onGestureStart,
  onViewportChange,
  onLocatePress,
  style,
  testID,
}: SocialMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ center: initial?.center ?? DEFAULT_VIEW.center, zoom: initial?.zoom ?? DEFAULT_VIEW.zoom });
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const initialized = useRef(false);
  const anim = useRef<number | null>(null);
  const rootRef = useRef<View>(null);
  const onGestureStartRef = useRef(onGestureStart);
  // "último valor" para os handlers de gesto, que vivem fora do ciclo de render
  useEffect(() => {
    viewRef.current = view;
    sizeRef.current = size;
    onGestureStartRef.current = onGestureStart;
  });

  const pad = useMemo(() => ({ top: padding?.top ?? 56, bottom: padding?.bottom ?? 56, left: padding?.left ?? 40, right: padding?.right ?? 40 }), [padding?.top, padding?.bottom, padding?.left, padding?.right]);

  const fitView = useCallback(
    (points: LatLng[], w: number, h: number): ViewState | null => {
      const b = boundsOf(points);
      if (!b) return null;
      if (points.length === 1 || (b.minLat === b.maxLat && b.minLng === b.maxLng)) return { center: points[0], zoom: 13 };
      // enquadra na área útil e desloca o centro para compensar margens assimétricas (painéis sobre o mapa)
      const innerW = w - pad.left - pad.right;
      const innerH = h - pad.top - pad.bottom;
      const fit = fitBounds(b, innerW, innerH, 8, 15);
      const c = project(fit.center, fit.zoom);
      const shifted = unproject(c.x - (pad.left - pad.right) / 2, c.y - (pad.top - pad.bottom) / 2, fit.zoom);
      return { center: shifted, zoom: fit.zoom };
    },
    [pad],
  );

  const animateTo = useCallback((target: ViewState, ms = 420) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setView({
        center: { lat: from.center.lat + (target.center.lat - from.center.lat) * e, lng: from.center.lng + (target.center.lng - from.center.lng) * e },
        zoom: from.zoom + (target.zoom - from.zoom) * e,
      });
      if (k < 1) anim.current = requestAnimationFrame(step);
      else anim.current = null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  useEffect(
    () => () => {
      if (anim.current) cancelAnimationFrame(anim.current);
    },
    [],
  );

  // visão inicial: enquadra `initial.fit` assim que o tamanho é conhecido
  useEffect(() => {
    if (initialized.current || size.w === 0) return;
    initialized.current = true;
    if (initial?.fit && initial.fit.length) {
      const v = fitView(initial.fit, size.w, size.h);
      if (v) setView(v); // eslint-disable-line react-hooks/set-state-in-effect -- precisa do tamanho medido (onLayout) para enquadrar
    }
  }, [size.w, size.h, initial?.fit, fitView]);

  // foco imperativo (por `key`)
  const lastFocus = useRef<string | number | null>(null);
  useEffect(() => {
    if (!focus || focus.key === lastFocus.current || size.w === 0) return;
    lastFocus.current = focus.key;
    if (focus.fit && focus.fit.length) {
      const v = fitView(focus.fit, size.w, size.h);
      if (v) animateTo(v);
    } else if (focus.center) {
      animateTo({ center: focus.center, zoom: focus.zoom ?? viewRef.current.zoom });
    }
  }, [focus, size.w, size.h, fitView, animateTo]);

  // avisa o pai da área visível (com debounce)
  useEffect(() => {
    if (!onViewportChange || size.w === 0) return;
    const t = setTimeout(() => onViewportChange({ center: view.center, zoom: view.zoom, radiusM: viewportRadiusM(view.center, view.zoom, size.w, size.h) }), 280);
    return () => clearTimeout(t);
  }, [view, size.w, size.h, onViewportChange]);

  // gestos: arrastar (1 dedo) e pinça (2 dedos)
  const gestureRef = useRef({ start: DEFAULT_VIEW as ViewState, pinchDist: 0, pinchStart: DEFAULT_VIEW as ViewState });
  const touchDist = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return 0;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- os handlers só leem refs em eventos de toque, nunca durante o render
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (e, s) => interactive && (Math.abs(s.dx) > 4 || Math.abs(s.dy) > 4 || e.nativeEvent.touches.length > 1),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          onGestureStartRef.current?.();
          if (anim.current) cancelAnimationFrame(anim.current);
          anim.current = null;
          gestureRef.current.start = viewRef.current;
          gestureRef.current.pinchDist = 0;
        },
        onPanResponderMove: (e, s) => {
          const d = touchDist(e);
          if (d > 0) {
            if (!gestureRef.current.pinchDist) {
              gestureRef.current.pinchDist = d;
              gestureRef.current.pinchStart = viewRef.current;
            }
            setView({ center: gestureRef.current.pinchStart.center, zoom: clampZoom(gestureRef.current.pinchStart.zoom + Math.log2(d / gestureRef.current.pinchDist)) });
            gestureRef.current.start = viewRef.current;
            return;
          }
          if (gestureRef.current.pinchDist) {
            // voltou a 1 dedo: recomeça o arraste daqui
            gestureRef.current.pinchDist = 0;
            gestureRef.current.start = viewRef.current;
            return;
          }
          const p0 = project(gestureRef.current.start.center, gestureRef.current.start.zoom);
          setView({ center: unproject(p0.x - s.dx, p0.y - s.dy, gestureRef.current.start.zoom), zoom: gestureRef.current.start.zoom });
        },
      }),
    [interactive],
  );

  // roda do mouse (web)
  useEffect(() => {
    if (Platform.OS !== 'web' || !interactive) return;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = viewRef.current;
      setView({ center: v.center, zoom: clampZoom(v.zoom - ev.deltaY * 0.0022) });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [interactive]);

  const zoomBy = (delta: number) => animateTo({ center: viewRef.current.center, zoom: clampZoom(viewRef.current.zoom + delta) }, 260);

  // projeção -> tela
  const c = project(view.center, view.zoom);
  const toScreen = (p: LatLng) => {
    const w = project(p, view.zoom);
    return { x: size.w / 2 + w.x - c.x, y: size.h / 2 + w.y - c.y };
  };

  const visible = useMemo(() => {
    if (size.w === 0) return { singles: [], clusters: [] };
    const margin = 90;
    const cc = project(view.center, view.zoom);
    const items = markers
      .map((m) => {
        const w = project(m, view.zoom);
        return { marker: m, x: size.w / 2 + w.x - cc.x, y: size.h / 2 + w.y - cc.y };
      })
      .filter((p) => p.x > -margin && p.x < size.w + margin && p.y > -margin && p.y < size.h + margin);
    return clusterMarkers(items.map((p) => (p.marker.id === selectedId ? { ...p, marker: { ...p.marker, pinned: true } } : p)), view.zoom >= 14 ? 1 : 52);
  }, [markers, view, size.w, size.h, selectedId]);

  const onClusterPress = (members: MapMarker[]) => {
    const b = boundsOf(members);
    if (!b) return;
    const v = fitView(members, size.w, size.h);
    if (v) animateTo({ center: v.center, zoom: Math.min(MAX_ZOOM, Math.max(view.zoom + 1.2, v.zoom)) });
  };

  const usingTiles = env.mapProvider === 'tiles' && !!env.mapTileUrl;
  const linePaths = lines.map((l) => ({ ...l, d: l.coords.map((p, i) => `${i ? 'L' : 'M'}${toScreen(p).x.toFixed(1)} ${toScreen(p).y.toFixed(1)}`).join(' ') }));
  const user = userLocation ? toScreen(userLocation) : null;
  const showLabels = view.zoom >= 12;

  return (
    <View
      ref={rootRef}
      testID={testID}
      style={[styles.root, style]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}>
      {size.w > 0 ? (
        <>
          {usingTiles ? <TileLayer urlTemplate={env.mapTileUrl} center={view.center} zoom={view.zoom} width={size.w} height={size.h} /> : <DemoBasemap center={view.center} zoom={view.zoom} width={size.w} height={size.h} />}

          {onMapPress ? <Pressable style={StyleSheet.absoluteFill} onPress={onMapPress} accessibilityLabel="Mapa" /> : null}

          {linePaths.length ? (
            <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
              {linePaths.map((l) => (
                <Path key={`${l.id}-casing`} d={l.d} stroke="#fff" strokeWidth={(l.width ?? 5) + 3} strokeOpacity={0.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {linePaths.map((l) => (
                <Path key={l.id} d={l.d} stroke={l.color} strokeWidth={l.width ?? 5} strokeOpacity={l.opacity ?? 1} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.dashed ? '2 9' : undefined} />
              ))}
            </Svg>
          ) : null}

          {user ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: user.x - 11, top: user.y - 11 }}>
              <UserDot />
            </View>
          ) : null}

          {visible.singles.map(({ marker, x, y }) => {
            const selected = marker.id === selectedId;
            const { w, h } = markerSize(marker.kind, selected);
            const pos = { position: 'absolute' as const, left: x - w / 2, top: y - h / 2, zIndex: selected ? 50 : marker.kind === 'live' ? 20 : marker.kind === 'event' ? 15 : 1 };
            // sem handler (miniaturas), o marcador é só desenho — evita botões aninhados no web
            if (!onMarkerPress) {
              return (
                <View key={marker.id} style={pos} pointerEvents="none">
                  <MarkerView marker={marker} selected={selected} showLabel={showLabels} />
                </View>
              );
            }
            return (
              <Pressable key={marker.id} testID={`marker-${marker.id}`} accessibilityRole="button" accessibilityLabel={marker.label ?? marker.kind} onPress={() => onMarkerPress(marker)} style={pos}>
                <MarkerView marker={marker} selected={selected} showLabel={showLabels} />
              </Pressable>
            );
          })}

          {visible.clusters.map((cl) => (
            <Pressable
              key={cl.id}
              testID="map-cluster"
              accessibilityRole="button"
              accessibilityLabel={`${cl.count} itens`}
              onPress={() => onClusterPress(cl.members)}
              style={{ position: 'absolute', left: cl.x - 23, top: cl.y - 23, zIndex: 5 }}>
              <MarkerView marker={{ id: cl.id, kind: 'cluster', lat: 0, lng: 0, count: cl.count }} selected={false} showLabel={false} />
            </Pressable>
          ))}

          {controls ? (
            <View style={styles.controls} pointerEvents="box-none">
              {onLocatePress ? (
                <Pressable onPress={onLocatePress} style={[styles.ctrl, shadow.card]} accessibilityLabel="Minha localização" testID="map-locate">
                  <Ionicons name="locate" size={22} color={colors.ink} />
                </Pressable>
              ) : null}
              <View style={[styles.zoomGroup, shadow.card]}>
                <Pressable onPress={() => zoomBy(1)} style={styles.zoomBtn} accessibilityLabel="Aproximar" testID="map-zoom-in">
                  <Ionicons name="add" size={22} color={colors.ink} />
                </Pressable>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />
                <Pressable onPress={() => zoomBy(-1)} style={styles.zoomBtn} accessibilityLabel="Afastar" testID="map-zoom-out">
                  <Ionicons name="remove" size={22} color={colors.ink} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {usingTiles || controls ? (
            <View style={styles.attribution} pointerEvents="none">
              <Txt variant="micro" color={colors.inkSoft}>
                {usingTiles ? env.mapAttribution || 'Mapa' : 'Mapa ilustrativo · demonstração'}
              </Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.sea },
  controls: { position: 'absolute', right: space.md, top: '38%', gap: space.sm, alignItems: 'flex-end' },
  ctrl: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  zoomGroup: { width: 44, borderRadius: radius.lg, backgroundColor: '#fff', overflow: 'hidden' },
  zoomBtn: { height: 42, alignItems: 'center', justifyContent: 'center' },
  attribution: { position: 'absolute', left: space.sm, bottom: 4, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 6, borderRadius: 6 },
});
