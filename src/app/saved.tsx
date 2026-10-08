import { ScrollView, View } from 'react-native';

import { Header } from '@/components/Header';
import { PhotoGrid } from '@/components/PhotoGrid';
import { EmptyState, Loading } from '@/components/ui';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors } from '@/theme';

export default function Saved() {
  const repo = useRepo();
  const saved = useQuery(() => repo.listSavedPosts(), []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Salvos" />
      <ScrollView>
        {saved.loading && !saved.data ? <Loading /> : (saved.data?.length ?? 0) === 0 ? <EmptyState icon="bookmark-outline" title="Nada salvo ainda" body="Toque no marcador de uma publicação para guardá-la aqui." /> : <PhotoGrid posts={saved.data!} />}
      </ScrollView>
    </View>
  );
}
