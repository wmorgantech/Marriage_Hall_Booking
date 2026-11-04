import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { HallCard } from '../components/HallCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { useToast } from '../components/Toast';
import { getFavorites, removeFavorite } from '../favorites/localFavorites';
import type { RootTabParamList } from '../navigation/types';

type Props = BottomTabScreenProps<RootTabParamList, 'FavoritesTab'>;

export default function FavoritesListScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({ queryKey: ['favorites'], queryFn: getFavorites });
  const favorites = favoritesQuery.data ?? [];

  async function handleRemove(hallId: string) {
    const next = await removeFavorite(hallId);
    queryClient.setQueryData(['favorites'], next);
    showToast('info', tStr('removed_from_favorites'));
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="font-serif text-h3 text-on-surface font-bold">{t('favorites_h')}</Text>
      </View>

      {favoritesQuery.isLoading ? (
        <View className="px-4">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(h) => h.id}
          contentContainerClassName="pb-8"
          renderItem={({ item }) => (
            <View className="px-4">
              <HallCard
                hall={item}
                onPress={() => navigation.navigate('ExploreTab', { screen: 'HallDetail', params: { hallId: item.id } })}
                isFavorite={true}
                onFavoriteToggle={() => handleRemove(item.id)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center px-8 mt-10">
              <MaterialIcons name="favorite-border" size={36} color={colors.outline} />
              <Text className="font-serif text-base text-on-surface font-bold mt-3 text-center">
                {t('no_favorites_h')}
              </Text>
              <Text className="font-sans text-xs text-on-surface-variant text-center mt-1.5">
                {t('no_favorites_help')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
