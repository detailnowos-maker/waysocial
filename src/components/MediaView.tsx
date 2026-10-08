import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import type { Media } from '@/domain/types';
import { formatClock } from '@/lib/format';
import { colors, radius } from '@/theme';

import { SceneArt } from './SceneArt';
import { Txt } from './ui';

function VideoClip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="cover" />;
}

interface MediaViewProps {
  media: Omit<Media, 'id'> & { id?: string };
  style?: StyleProp<ViewStyle>;
  /** Vídeos com URI só tocam quando `playable` (feed/detalhe). Em grades, mostram o selo de vídeo. */
  playable?: boolean;
  showBadge?: boolean;
}

/**
 * Renderiza uma mídia: foto/vídeo reais (URI) ou a ilustração de demonstração (`scene`).
 * O container precisa receber tamanho (ex.: `aspectRatio` ou `width/height`) pelo `style`.
 */
export function MediaView({ media, style, playable = false, showBadge = true }: MediaViewProps) {
  const isVideo = media.type === 'video';
  return (
    <View style={[styles.box, style]}>
      {media.uri && !isVideo ? <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityLabel="Foto" /> : null}
      {media.uri && isVideo ? playable ? <VideoClip uri={media.uri} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#14161C' }]} /> : null}
      {!media.uri && media.scene ? <SceneArt scene={media.scene} style={StyleSheet.absoluteFill} /> : null}
      {!media.uri && !media.scene ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} /> : null}
      {isVideo && showBadge && !(playable && media.uri) ? (
        <View style={styles.videoBadge} pointerEvents="none">
          <Ionicons name="play" size={13} color="#fff" />
          {media.durationMs ? (
            <Txt variant="micro" color="#fff">
              {formatClock(media.durationMs / 1000).slice(3)}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  videoBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, height: 22, borderRadius: radius.pill },
});
