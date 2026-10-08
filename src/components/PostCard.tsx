import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import type { PostView } from '@/domain/types';
import { formatCount, formatDateTime, timeAgo } from '@/lib/format';
import { useAppWidth } from '@/lib/layout';
import { useRepo, useSession } from '@/state/ServicesProvider';
import { colors, space } from '@/theme';

import { Avatar } from './Avatar';
import { MediaView } from './MediaView';
import { ActionSheet } from './Sheet';
import { useToast } from './Toast';
import { haptic, Txt } from './ui';

interface PostCardProps {
  post: PostView;
  /** Na tela de detalhe o card não abre a si mesmo. */
  detail?: boolean;
}

const PRECISION_LABEL: Record<PostView['precision'], string | null> = {
  place: null,
  exact: 'localização exata',
  approx: 'localização aproximada',
  none: null,
};

export function PostCard({ post, detail = false }: PostCardProps) {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const { userId } = useSession();
  const width = useAppWidth();
  const mediaHeight = Math.round(width * 1.18);
  const serverKey = `${post.likedByMe}|${post.likeCount}|${post.savedByMe}`;
  const [localState, setLocal] = useState<{ key: string; liked: boolean; count: number; saved: boolean } | null>(null);
  // palpite otimista só vale enquanto o servidor não respondeu com um estado novo
  const local = localState && localState.key === serverKey ? localState : null;
  const [page, setPage] = useState(0);
  const [menu, setMenu] = useState(false);
  const [heart] = useState(() => new Animated.Value(0));
  const lastTap = useRef(0);

  const liked = local?.liked ?? post.likedByMe;
  const likeCount = local?.count ?? post.likeCount;
  const saved = local?.saved ?? post.savedByMe;
  const mine = post.author.id === userId;

  const runLike = async (wantLiked?: boolean) => {
    if (wantLiked !== undefined && wantLiked === liked) return;
    const next = !liked;
    haptic();
    setLocal({ key: serverKey, liked: next, count: likeCount + (next ? 1 : -1), saved });
    try {
      await repo.toggleLike(post.id);
    } catch (e) {
      setLocal(null);
      toast.show(e instanceof Error ? e.message : 'Não foi possível curtir.', { tone: 'error' });
    }
  };

  const onMediaPress = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      heart.setValue(0);
      Animated.sequence([Animated.spring(heart, { toValue: 1, useNativeDriver: true, friction: 5 }), Animated.timing(heart, { toValue: 0, duration: 260, delay: 250, useNativeDriver: true })]).start();
      void runLike(true);
    } else {
      lastTap.current = now;
    }
  };

  const toggleSave = async () => {
    haptic();
    setLocal({ key: serverKey, liked, count: likeCount, saved: !saved });
    try {
      const nowSaved = await repo.toggleSave(post.id);
      toast.show(nowSaved ? 'Publicação salva' : 'Removida dos salvos', { icon: nowSaved ? 'bookmark' : 'bookmark-outline' });
    } catch (e) {
      setLocal(null);
      toast.show(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' });
    }
  };

  const share = async () => {
    const url = Linking.createURL(`/post/${post.id}`);
    const place = post.place ? ` · ${post.place.name}` : '';
    try {
      await Share.share({ message: `${post.author.displayName}${place}: ${post.caption || 'Veja no WaySocial'} ${url}`, url });
    } catch {
      toast.show(Platform.OS === 'web' ? 'Compartilhar não está disponível neste navegador.' : 'Não foi possível compartilhar.', { tone: 'error' });
    }
  };

  const goPost = () => {
    if (!detail) router.push({ pathname: '/post/[id]', params: { id: post.id } });
  };

  const precisionNote = PRECISION_LABEL[post.precision];

  return (
    <View style={styles.card} testID={`post-${post.id}`}>
      <View style={styles.header}>
        <Pressable style={styles.author} onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })} accessibilityRole="link">
          <Avatar profile={post.author} size={38} />
          <View style={{ flexShrink: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {post.author.displayName}
            </Txt>
            {post.place ? (
              <Pressable onPress={() => router.push({ pathname: '/place/[id]', params: { id: post.place!.id } })} hitSlop={6} testID={`post-${post.id}-place`}>
                <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                  📍 {post.place.name}, {post.place.cityName}
                </Txt>
              </Pressable>
            ) : precisionNote ? (
              <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
                📍 {precisionNote}
              </Txt>
            ) : (
              <Txt variant="caption" color={colors.inkMute}>
                Sem localização
              </Txt>
            )}
          </View>
        </Pressable>
        <Txt variant="caption" color={colors.inkMute}>
          {timeAgo(post.createdAt)}
        </Txt>
        {mine ? (
          <Pressable hitSlop={10} onPress={() => setMenu(true)} accessibilityLabel="Mais opções" testID={`post-${post.id}-menu`}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.inkSoft} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ height: mediaHeight, width }}>
        {post.media.length > 1 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))} scrollEventThrottle={32}>
            {post.media.map((m) => (
              <Pressable key={m.id} onPress={onMediaPress} accessibilityLabel="Foto da publicação. Toque duas vezes para curtir">
                <MediaView media={m} playable style={{ width, height: mediaHeight }} />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable onPress={onMediaPress} accessibilityLabel="Foto da publicação. Toque duas vezes para curtir">
            <MediaView media={post.media[0]} playable style={{ width, height: mediaHeight }} />
          </Pressable>
        )}
        <Animated.View pointerEvents="none" style={[styles.heart, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }] }]}>
          <Ionicons name="heart" size={96} color="#fff" />
        </Animated.View>
        {post.media.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {post.media.map((m, i) => (
              <View key={m.id} style={[styles.dot, i === page ? styles.dotActive : null]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => void runLike()} accessibilityLabel={liked ? 'Descurtir' : 'Curtir'} testID={`post-${post.id}-like`}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={27} color={liked ? colors.like : colors.ink} />
          <Txt variant="bodyStrong" testID={`post-${post.id}-likes`}>
            {formatCount(likeCount)}
          </Txt>
        </Pressable>
        <Pressable style={styles.action} onPress={goPost} accessibilityLabel="Comentários" testID={`post-${post.id}-comments`}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.ink} />
          <Txt variant="bodyStrong">{formatCount(post.commentCount)}</Txt>
        </Pressable>
        <Pressable style={styles.action} onPress={() => void share()} accessibilityLabel="Compartilhar">
          <Ionicons name="paper-plane-outline" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => void toggleSave()} hitSlop={8} accessibilityLabel={saved ? 'Remover dos salvos' : 'Salvar'} testID={`post-${post.id}-save`}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={25} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {post.caption ? (
          <Txt variant="body">
            <Txt variant="bodyStrong">{post.author.displayName} </Txt>
            {post.caption}
          </Txt>
        ) : null}
        {!detail && post.commentCount > 0 ? (
          <Pressable onPress={goPost}>
            <Txt variant="caption" color={colors.inkMute}>
              Ver {post.commentCount === 1 ? 'o comentário' : `todos os ${post.commentCount} comentários`}
            </Txt>
          </Pressable>
        ) : null}
        <Txt variant="micro" color={colors.inkMute}>
          {formatDateTime(post.createdAt).toUpperCase()}
        </Txt>
      </View>

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Sua publicação"
        actions={[
          ...(post.precision !== 'none'
            ? [
                {
                  label: 'Excluir localização',
                  subtitle: 'Remove o lugar e as coordenadas desta publicação',
                  icon: 'location-outline' as const,
                  testID: 'post-remove-location',
                  onPress: async () => {
                    try {
                      await repo.removePostLocation(post.id);
                      toast.show('Localização removida', { tone: 'success' });
                    } catch (e) {
                      toast.show(e instanceof Error ? e.message : 'Erro ao remover.', { tone: 'error' });
                    }
                  },
                },
              ]
            : []),
          {
            label: 'Excluir publicação',
            icon: 'trash-outline',
            destructive: true,
            testID: 'post-delete',
            onPress: async () => {
              try {
                await repo.deletePost(post.id);
                toast.show('Publicação excluída');
                if (detail) router.back();
              } catch (e) {
                toast.show(e instanceof Error ? e.message : 'Erro ao excluir.', { tone: 'error' });
              }
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  heart: { position: 'absolute', alignSelf: 'center', top: '38%', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12 },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotActive: { backgroundColor: '#fff', width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, paddingTop: space.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: 4 },
});
