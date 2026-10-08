import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PostView } from '@/domain/types';
import { useAppWidth } from '@/lib/layout';

import { MediaView } from './MediaView';

const GAP = 2;

/** Grade de miniaturas (perfil, lugar, busca). Toque abre a publicação. */
export function PhotoGrid({ posts, columns = 3, onPress }: { posts: PostView[]; columns?: number; onPress?: (p: PostView) => void }) {
  const router = useRouter();
  const width = useAppWidth();
  const size = (width - GAP * (columns - 1)) / columns;
  return (
    <View style={styles.grid}>
      {posts.map((p) => (
        <Pressable
          key={p.id}
          testID={`grid-${p.id}`}
          accessibilityRole="button"
          accessibilityLabel={p.caption || 'Publicação'}
          onPress={() => (onPress ? onPress(p) : router.push({ pathname: '/post/[id]', params: { id: p.id } }))}
          style={{ width: size, height: size * 1.25 }}>
          <MediaView media={p.media[0]} style={StyleSheet.absoluteFill} />
          {p.media.length > 1 ? (
            <View style={styles.multi}>
              <Ionicons name="copy" size={14} color="#fff" />
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  multi: { position: 'absolute', top: 6, left: 6 },
});
