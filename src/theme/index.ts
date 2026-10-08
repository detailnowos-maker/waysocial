import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens do WaySocial. Visual minimalista e "premium": muito espaço em branco,
 * tipografia limpa, imagens e mapa como protagonistas, e um único gradiente de marca
 * (pôr do sol) reservado a ações e destaques.
 */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F6F6F8',
  surfaceAlt: '#EEEEF2',
  line: '#ECECF0',
  ink: '#0E1116',
  inkSoft: '#4B5262',
  inkMute: '#8B92A1',
  inkInverse: '#FFFFFF',

  brand: '#FF3D77',
  brandSoft: '#FFE9F0',
  live: '#16C47F',
  liveSoft: '#E3FAF0',
  like: '#FF3B5C',
  star: '#F5A524',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  info: '#2F6BFF',
  infoSoft: '#E8EFFF',

  sea: '#CDE6F1',
  land: '#F3F0EA',
  road: '#FFFFFF',
  scrim: 'rgba(14,17,22,0.45)',
} as const;

/** Gradiente de marca: laranja → rosa → violeta. */
export const brandGradient = ['#FF9A3D', '#FF3D77', '#7A5CFF'] as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

const fontFamily = Platform.select({ web: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', default: undefined });

export const type = {
  display: { fontFamily, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontFamily, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontFamily, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontFamily, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontFamily, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  micro: { fontFamily, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.3 },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0E1116', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 4 },
    default: { boxShadow: '0 8px 24px rgba(14,17,22,0.10)' } as ViewStyle,
  }) as ViewStyle,
  float: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0E1116', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    android: { elevation: 10 },
    default: { boxShadow: '0 12px 32px rgba(14,17,22,0.22)' } as ViewStyle,
  }) as ViewStyle,
  brand: Platform.select<ViewStyle>({
    ios: { shadowColor: '#FF3D77', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    default: { boxShadow: '0 8px 22px rgba(255,61,119,0.45)' } as ViewStyle,
  }) as ViewStyle,
};

/** Altura da barra de abas (sem a área segura). */
export const TAB_BAR_HEIGHT = 64;
