import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Header } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { useToast } from '@/components/Toast';
import { EmptyState, Loading, SectionHeader, Txt } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useRepo, useSession } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space, type } from '@/theme';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const post = useQuery(() => repo.getPost(id), [id]);
  const comments = useQuery(() => repo.listComments(id), [id]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await repo.addComment(id, text);
      setText('');
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível comentar.', { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Publicação" />
      {post.loading && !post.data ? (
        <Loading />
      ) : !post.data ? (
        <EmptyState icon="lock-closed-outline" title="Publicação indisponível" body="Ela pode ter sido removida ou o perfil é privado." />
      ) : (
        <>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.xxl }}>
            <PostCard post={post.data} detail />
            <SectionHeader title={`Comentários${post.data.commentCount ? ` (${post.data.commentCount})` : ''}`} />
            <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
              {(comments.data ?? []).map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', gap: space.md }} testID="comment">
                  <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.author.id } })}>
                    <Avatar profile={c.author} size={34} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="body">
                      <Txt variant="bodyStrong">{c.author.displayName} </Txt>
                      {c.text}
                    </Txt>
                    <Txt variant="caption" color={colors.inkMute}>
                      {timeAgo(c.createdAt)}
                    </Txt>
                  </View>
                </View>
              ))}
              {comments.data && comments.data.length === 0 ? (
                <Txt color={colors.inkMute} variant="caption">
                  Seja o primeiro a comentar.
                </Txt>
              ) : null}
            </View>
          </ScrollView>
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
            {profile ? <Avatar profile={profile} size={34} /> : null}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Adicione um comentário…"
              placeholderTextColor={colors.inkMute}
              style={styles.input}
              onSubmitEditing={send}
              returnKeyType="send"
              accessibilityLabel="Comentário"
              testID="comment-input"
            />
            <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8} style={{ opacity: text.trim() ? 1 : 0.35 }} accessibilityLabel="Enviar comentário" testID="comment-send">
              <Ionicons name="arrow-up-circle" size={34} color={colors.brand} />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg },
  input: { ...type.body, flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: space.lg, color: colors.ink, outlineStyle: 'none' } as never,
});
