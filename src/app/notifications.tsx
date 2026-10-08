import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Header } from '@/components/Header';
import { MediaView } from '@/components/MediaView';
import { Button, EmptyState, Loading, Txt } from '@/components/ui';
import type { NotificationView } from '@/domain/types';
import { timeAgo } from '@/lib/format';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, space } from '@/theme';

function sentence(n: NotificationView): string {
  switch (n.type) {
    case 'like':
      return 'curtiu sua publicação.';
    case 'comment':
      return `comentou: “${n.commentText ?? ''}”`;
    case 'follow':
      return 'começou a seguir você.';
    case 'follow_request':
      return 'quer seguir você.';
    case 'follow_accepted':
      return 'aceitou seu pedido para seguir.';
    case 'save':
      return 'salvou sua publicação.';
  }
}

const ICON: Record<NotificationView['type'], { name: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  like: { name: 'heart', color: colors.like },
  comment: { name: 'chatbubble', color: colors.info },
  follow: { name: 'person-add', color: colors.brand },
  follow_request: { name: 'person-add', color: colors.brand },
  follow_accepted: { name: 'checkmark-circle', color: colors.live },
  save: { name: 'bookmark', color: '#7A5CFF' },
};

export default function Notifications() {
  const router = useRouter();
  const repo = useRepo();
  const list = useQuery(() => repo.listNotifications(), []);

  // marca como lidas depois de um instante, para o usuário ainda ver o que era novidade
  useEffect(() => {
    const t = setTimeout(() => void repo.markNotificationsRead(), 1600);
    return () => clearTimeout(t);
  }, [repo]);

  const [now] = useState(() => Date.now());
  const sections = useMemo(() => {
    const buckets: { title: string; data: NotificationView[] }[] = [
      { title: 'Hoje', data: [] },
      { title: 'Esta semana', data: [] },
      { title: 'Antes', data: [] },
    ];
    for (const n of list.data ?? []) {
      const age = now - new Date(n.createdAt).getTime();
      buckets[age < 24 * 3600_000 ? 0 : age < 7 * 24 * 3600_000 ? 1 : 2].data.push(n);
    }
    return buckets.filter((b) => b.data.length > 0);
  }, [list.data, now]);

  const open = (n: NotificationView) => {
    if (n.post) router.push({ pathname: '/post/[id]', params: { id: n.post.id } });
    else router.push({ pathname: '/user/[id]', params: { id: n.actor.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Notificações" />
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Txt variant="heading" style={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm }}>
            {section.title}
          </Txt>
        )}
        renderItem={({ item: n }) => {
          const icon = ICON[n.type];
          return (
            <Pressable style={[styles.row, !n.read ? { backgroundColor: colors.brandSoft } : null]} onPress={() => open(n)} testID={`notif-${n.type}`}>
              <View>
                <Avatar profile={n.actor} size={46} />
                <View style={[styles.typeBadge, { backgroundColor: icon.color }]}>
                  <Ionicons name={icon.name} size={11} color="#fff" />
                </View>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Txt variant="body">
                  <Txt variant="bodyStrong">{n.actor.displayName} </Txt>
                  {sentence(n)}
                  <Txt variant="caption" color={colors.inkMute}>
                    {'  '}
                    {timeAgo(n.createdAt)}
                  </Txt>
                </Txt>
                {n.type === 'follow_request' && n.pending ? (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button label="Aceitar" size="sm" kind="brand" onPress={() => void repo.respondFollowRequest(n.actor.id, true)} testID="accept-follow" />
                    <Button label="Recusar" size="sm" kind="secondary" onPress={() => void repo.respondFollowRequest(n.actor.id, false)} testID="decline-follow" />
                  </View>
                ) : null}
              </View>
              {n.post?.media ? <MediaView media={n.post.media} style={styles.thumb} showBadge={false} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={list.loading ? <Loading /> : <EmptyState icon="notifications-outline" title="Tudo tranquilo por aqui" body="Curtidas, comentários e novos seguidores aparecem neste lugar." />}
        contentContainerStyle={{ paddingBottom: space.xxxl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  typeBadge: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  thumb: { width: 46, height: 46, borderRadius: 8 },
});
