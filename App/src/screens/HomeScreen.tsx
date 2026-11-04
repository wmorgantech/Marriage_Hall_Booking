import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Calendar, type DateData } from 'react-native-calendars';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Hall, SearchHallsQuery } from '../api/types';
import { useT, type DictKey } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { HallCard } from '../components/HallCard';
import { Hero } from '../components/Hero';
import { SkeletonCard } from '../components/SkeletonCard';
import { FiltersModal, emptyAdvancedFilters, countActiveFilters, type AdvancedFilters } from '../components/FiltersModal';
import type { ExploreStackParamList } from '../navigation/types';

type CapacityBand = 'any' | 'upto300' | '300to1k' | '1000plus';
type SortKey = 'popularity' | 'price-asc' | 'capacity-desc';

const SORT_OPTIONS: [SortKey, DictKey][] = [
  ['popularity', 'sort_popularity'],
  ['price-asc', 'sort_price_asc'],
  ['capacity-desc', 'sort_capacity'],
];

// Real server-side pagination: /api/halls takes limit/offset and returns the
// total match count in X-Total-Count. Sorting and the capacity bands are applied
// by the server too, so every hall is reachable (not just the first page-worth).
const PAGE_SIZE = 12;

// Inclusive bounds, identical to the website (a 300-guest hall fits both
// "up to 300" and "300 – 1k"; same for 1,000).
const CAPACITY_BANDS: Record<CapacityBand, Pick<SearchHallsQuery, 'minCapacity' | 'maxCapacity'>> = {
  any: {},
  upto300: { maxCapacity: 300 },
  '300to1k': { minCapacity: 300, maxCapacity: 1000 },
  '1000plus': { minCapacity: 1000 },
};

type Props = NativeStackScreenProps<ExploreStackParamList, 'Home'>;

const EXAMPLE_QUERY = 'e.g., Coimbatore-la December 12-ku 800 guests, parking, budget ₹2 lakh-kulla hall venum.';

export default function HomeScreen({ navigation }: Props) {
  const { t, tStr, lang, setLang } = useT();
  const { user } = useAuth();
  const [city, setCity] = useState<string>('');
  const [q, setQ] = useState('');
  const [capacityBand, setCapacityBand] = useState<CapacityBand>('any');
  const [sort, setSort] = useState<SortKey>('popularity');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(emptyAdvancedFilters);
  const [appliedFilters, setAppliedFilters] = useState<SearchHallsQuery>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Hall[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const filtersQuery = useQuery({ queryKey: ['hallFilters'], queryFn: api.getHallFilters });
  // Contact numbers are only returned to signed-in users, so the list refetches on sign-in/out.
  const searchQuery = useMemo<SearchHallsQuery>(
    () => ({ ...appliedFilters, ...CAPACITY_BANDS[capacityBand], sort }),
    [appliedFilters, capacityBand, sort],
  );
  const hallsQuery = useInfiniteQuery({
    queryKey: ['halls', searchQuery, user?.id ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.searchHalls({ ...searchQuery, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.halls.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  const halls = useMemo(() => hallsQuery.data?.pages.flatMap((p) => p.halls) ?? [], [hallsQuery.data]);
  const totalHalls = hallsQuery.data?.pages[0]?.total ?? 0;
  const areaOptions = city ? filtersQuery.data?.areasByCity[city] ?? [] : [];
  // Quick popular areas: areas of the chosen city, else of the first city that has areas (real data only)
  const popularAreas = useMemo(() => {
    const byCity = filtersQuery.data?.areasByCity ?? {};
    const c = city || Object.keys(byCity).find((k) => (byCity[k] ?? []).length > 0) || '';
    return { city: c, areas: (byCity[c] ?? []).slice(0, 10) };
  }, [filtersQuery.data, city]);
  const dateLabel = advanced.date
    ? new Date(advanced.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  function pickPopularArea(areaName: string) {
    setCity(popularAreas.city);
    const next = { ...advanced, area: areaName };
    setAdvanced(next);
    setAppliedFilters({ ...buildQuery(next), city: popularAreas.city || undefined });
  }

  function loadMore() {
    if (hallsQuery.hasNextPage && !hallsQuery.isFetchingNextPage) hallsQuery.fetchNextPage();
  }

  function buildQuery(adv: AdvancedFilters): SearchHallsQuery {
    return {
      city: city || undefined,
      q: q || undefined,
      area: adv.area || undefined,
      date: adv.date || undefined,
      hasAC: adv.hasAC || undefined,
      hasRooms: adv.hasRooms || undefined,
      minPrice: adv.minPrice ? Number(adv.minPrice) : undefined,
      maxPrice: adv.maxPrice ? Number(adv.maxPrice) : undefined,
    };
  }

  function runSearch(adv: AdvancedFilters = advanced) {
    setAppliedFilters(buildQuery(adv));
  }

  function patchAdvancedAndSearch(patch: Partial<AdvancedFilters>) {
    const next = { ...advanced, ...patch };
    setAdvanced(next);
    runSearch(next);
  }

  // Debounced live-suggestion fetch, mirrors apps/web/src/components/GlobalSearch.tsx
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);
    const timer = setTimeout(() => {
      api
        .suggestHalls(query, 8)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSuggestLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  function pickSuggestion(hall: Hall) {
    setSuggestOpen(false);
    setQ('');
    navigation.navigate('HallDetail', { hallId: hall.id });
  }

  const activeChips = useMemo(() => {
    const out: { key: string; label: string; onRemove: () => void }[] = [];
    if (appliedFilters.q) {
      out.push({
        key: 'q',
        label: `"${appliedFilters.q}"`,
        onRemove: () => {
          setQ('');
          setAppliedFilters((p) => ({ ...p, q: undefined }));
        },
      });
    }
    if (appliedFilters.city) {
      out.push({
        key: 'city',
        label: appliedFilters.city,
        onRemove: () => {
          setCity('');
          setAdvanced((a) => ({ ...a, area: undefined }));
          setAppliedFilters((p) => ({ ...p, city: undefined, area: undefined }));
        },
      });
    }
    if (appliedFilters.area) {
      out.push({ key: 'area', label: appliedFilters.area, onRemove: () => patchAdvancedAndSearch({ area: undefined }) });
    }
    if (appliedFilters.date) {
      out.push({ key: 'date', label: appliedFilters.date, onRemove: () => patchAdvancedAndSearch({ date: undefined }) });
    }
    if (appliedFilters.hasAC) {
      out.push({ key: 'ac', label: tStr('ac_label'), onRemove: () => patchAdvancedAndSearch({ hasAC: false }) });
    }
    if (appliedFilters.hasRooms) {
      out.push({ key: 'rooms', label: tStr('rooms_label'), onRemove: () => patchAdvancedAndSearch({ hasRooms: false }) });
    }
    if (appliedFilters.minPrice != null || appliedFilters.maxPrice != null) {
      const lo = appliedFilters.minPrice != null ? `₹${appliedFilters.minPrice}` : '₹0';
      const hi = appliedFilters.maxPrice != null ? `₹${appliedFilters.maxPrice}` : '+';
      out.push({ key: 'price', label: `${lo}–${hi}`, onRemove: () => patchAdvancedAndSearch({ minPrice: '', maxPrice: '' }) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  function cycleLang() {
    setLang(lang === 'en' ? 'ta' : lang === 'ta' ? 'both' : 'en');
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-container" edges={['top']}>
      <FlatList
        className="bg-background"
        data={halls}
        keyExtractor={(h) => h.id}
        contentContainerClassName="pb-8"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {/* Hero: mandapam photograph + headline */}
            <Hero
              topBar={
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="items-center justify-center bg-primary rounded-xl"
                      style={{ width: 38, height: 38, borderWidth: 1, borderColor: colors.gold }}
                    >
                      <Text className="font-serif text-white text-base">CB</Text>
                    </View>
                    <Text className="font-serif text-white" style={{ fontSize: 22 }}>
                      check<Text style={{ color: colors.gold }}>N</Text>book
                    </Text>
                  </View>
                  <Pressable
                    onPress={cycleLang}
                    accessibilityRole="button"
                    accessibilityLabel="Change language"
                    className="flex-row items-center gap-1.5 px-3.5 rounded-full"
                    style={{ minHeight: 44, backgroundColor: 'rgba(255,255,255,0.16)' }}
                  >
                    <MaterialIcons name="language" size={16} color="#fff" />
                    <Text className="font-sans-bold text-[11px] text-white">
                      {lang === 'en' ? 'EN' : lang === 'ta' ? 'TA' : 'EN+TA'}
                    </Text>
                  </Pressable>
                </View>
              }
              eyebrow={t('hero_eyebrow')}
              title={t('hero_title')}
              tagline={t('hero_tagline')}
              subtitle={t('hero_subtitle')}
            />

            {/* Search card — floats over the bottom of the hero */}
            <View
              className="mx-4 bg-white rounded-3xl p-4 mb-6 border border-gold/40"
              style={{
                marginTop: -72,
                shadowColor: colors.primary,
                shadowOpacity: 0.16,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }}
            >
              {/* AI search — describe what you need in your own words (separate screens) */}
              <View className="flex-row items-start gap-3 mb-3">
                <View className="items-center justify-center rounded-full bg-primary-fixed" style={{ width: 38, height: 38 }}>
                  <MaterialIcons name="auto-awesome" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-bold text-sm text-primary">{t('smart_card_title')}</Text>
                  <Text className="font-sans text-xs text-on-surface-variant mt-0.5">{EXAMPLE_QUERY}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => navigation.navigate('AiSearch')}
                accessibilityRole="button"
                className="flex-row items-center justify-center gap-2 rounded-xl bg-primary"
                style={{ height: 50 }}
              >
                <MaterialIcons name="auto-awesome" size={18} color={colors.onPrimary} />
                <Text className="font-sans-bold text-sm text-on-primary">{t('smart_btn')}</Text>
              </Pressable>
              <View className="flex-row items-center gap-3 my-4">
                <View className="flex-1" style={{ height: 1, backgroundColor: 'rgba(198,154,69,0.35)' }} />
                <Text className="font-sans-bold text-[11px] tracking-widest text-on-surface-variant">{t('smart_or')}</Text>
                <View className="flex-1" style={{ height: 1, backgroundColor: 'rgba(198,154,69,0.35)' }} />
              </View>

              {/* City */}
              <View className="flex-row items-center gap-1.5 mb-2">
                <MaterialIcons name="location-on" size={17} color={colors.primary} />
                <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-on-surface-variant">{t('city_label')}</Text>
              </View>
              <Pressable
                onPress={() => setCityPickerOpen(true)}
                accessibilityRole="button"
                className="flex-row items-center justify-between bg-white border border-gold/50 px-3.5 rounded-xl mb-4"
                style={{ height: 48 }}
              >
                <View className="flex-row items-center flex-1">
                  <MaterialIcons name="search" size={18} color={colors.primary} />
                  <Text
                    className={`font-sans-medium text-sm ml-2 flex-1 ${city ? 'text-on-surface' : 'text-outline'}`}
                    numberOfLines={1}
                  >
                    {city || tStr('all_cities')}
                  </Text>
                </View>
                <MaterialIcons name="expand-more" size={20} color={colors.outline} />
              </Pressable>

              {/* Hall / area search */}
              <View className="flex-row items-center gap-1.5 mb-2">
                <MaterialIcons name="search" size={17} color={colors.primary} />
                <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-on-surface-variant">{t('search_by')}</Text>
              </View>
              <View className="mb-4" style={{ zIndex: 50 }}>
                <View className="flex-row items-center bg-white border border-gold/50 px-3.5 rounded-xl" style={{ height: 48 }}>
                  <MaterialIcons name="search" size={18} color={colors.primary} />
                  <TextInput
                    value={q}
                    onChangeText={(v) => {
                      setQ(v);
                      setSuggestOpen(v.trim().length > 0);
                    }}
                    onFocus={() => setSuggestOpen(q.trim().length > 0)}
                    onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                    placeholder={tStr('search_placeholder')}
                    placeholderTextColor={colors.outline}
                    className="flex-1 ml-2 font-sans-medium text-sm text-on-surface"
                    returnKeyType="search"
                    onSubmitEditing={() => {
                      setSuggestOpen(false);
                      runSearch();
                    }}
                  />
                  {q.length > 0 && (
                    <Pressable
                      onPress={() => { setQ(''); setSuggestOpen(false); }}
                      className="items-center justify-center"
                      style={{ width: 40, height: 40, marginRight: -10 }}
                    >
                      <MaterialIcons name="close" size={18} color={colors.outline} />
                    </Pressable>
                  )}
                </View>

                {suggestOpen && q.trim().length > 0 && (
                  <View
                    className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 overflow-hidden"
                    style={{
                      position: 'absolute',
                      top: 54,
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      maxHeight: 280,
                      shadowColor: '#000',
                      shadowOpacity: 0.12,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 6,
                    }}
                  >
                    {suggestLoading && suggestions.length === 0 ? (
                      <View className="py-6 items-center">
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : suggestions.length === 0 ? (
                      q.trim().length >= 2 ? (
                        <Text className="font-sans text-xs text-on-surface-variant text-center py-6 px-4">
                          {t('no_halls_match')}
                        </Text>
                      ) : null
                    ) : (
                      <FlatList
                        data={suggestions}
                        keyExtractor={(h) => h.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <Pressable
                            onPress={() => pickSuggestion(item)}
                            className="flex-row items-center gap-3 px-4 border-b border-outline-variant/20 active:bg-surface-container"
                            style={{ minHeight: 52 }}
                          >
                            <View className="flex-1">
                              <Text className="font-sans-semibold text-sm text-on-surface" numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text className="font-sans text-xs text-on-surface-variant" numberOfLines={1}>
                                {item.area ? `${item.area}, ${item.city}` : item.city}
                              </Text>
                            </View>
                            <MaterialIcons name="arrow-forward" size={16} color={colors.outline} />
                          </Pressable>
                        )}
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Auspicious date */}
              <View className="flex-row items-center gap-1.5 mb-2">
                <MaterialIcons name="calendar-month" size={17} color={colors.primary} />
                <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-on-surface-variant">{t('auspicious_date')}</Text>
              </View>
              <Pressable
                onPress={() => setDateOpen(true)}
                accessibilityRole="button"
                className="flex-row items-center justify-between bg-white border border-gold/50 px-3.5 rounded-xl mb-4"
                style={{ height: 48 }}
              >
                <View className="flex-row items-center flex-1">
                  <MaterialIcons name="event" size={18} color={colors.primary} />
                  <Text className={`font-sans-medium text-sm ml-2 flex-1 ${dateLabel ? 'text-on-surface' : 'text-outline'}`} numberOfLines={1}>
                    {dateLabel || tStr('select_date')}
                  </Text>
                </View>
                {dateLabel ? (
                  <Pressable
                    onPress={() => setAdvanced((a) => ({ ...a, date: undefined }))}
                    accessibilityLabel="Clear date"
                    className="items-center justify-center"
                    style={{ width: 40, height: 40, marginRight: -10 }}
                  >
                    <MaterialIcons name="close" size={18} color={colors.outline} />
                  </Pressable>
                ) : (
                  <MaterialIcons name="expand-more" size={20} color={colors.outline} />
                )}
              </Pressable>

              {/* Guest capacity */}
              <Text className="font-sans-bold text-[11px] uppercase tracking-widest text-on-surface-variant mb-2">
                {t('guest_capacity')}
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {(
                  [
                    ['any', t('any_size')],
                    ['upto300', t('cap_up_to_300')],
                    ['300to1k', t('cap_300_1k')],
                    ['1000plus', t('cap_1000_plus')],
                  ] as [CapacityBand, React.ReactNode][]
                ).map(([band, label]) => (
                  <Pressable
                    key={band}
                    onPress={() => setCapacityBand(band)}
                    accessibilityRole="button"
                    className={`px-4 rounded-full border items-center justify-center ${
                      capacityBand === band ? 'bg-primary border-primary' : 'bg-white border-gold/50'
                    }`}
                    style={{ height: 40 }}
                  >
                    <Text
                      className={`font-sans-medium text-xs ${
                        capacityBand === band ? 'text-on-primary' : 'text-on-surface-variant'
                      }`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Find Halls */}
              <Pressable
                onPress={() => runSearch()}
                accessibilityRole="button"
                className="bg-primary rounded-xl flex-row items-center justify-center gap-2 active:bg-primary-container"
                style={{ height: 52, borderWidth: 2, borderColor: colors.gold }}
              >
                <MaterialIcons name="search" size={20} color="#fff" />
                <Text className="font-sans-bold text-sm text-on-primary">
                  {hallsQuery.isFetching ? tStr('searching') : tStr('find_halls')}
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color="#fff" />
              </Pressable>

              {/* More filters (area, price, AC, rooms) — unchanged behaviour */}
              <Pressable
                onPress={() => setFiltersOpen(true)}
                accessibilityRole="button"
                className="flex-row items-center justify-between px-1 mt-2"
                style={{ minHeight: 44 }}
              >
                <View className="flex-row items-center gap-2">
                  <MaterialIcons name="tune" size={17} color={colors.primary} />
                  <Text className="font-sans-semibold text-sm text-primary">{t('filters')}</Text>
                </View>
                {countActiveFilters(advanced) > 0 ? (
                  <View className="bg-primary rounded-full px-2 py-0.5 min-w-[20px] items-center">
                    <Text className="font-sans-bold text-[11px] text-on-primary">{countActiveFilters(advanced)}</Text>
                  </View>
                ) : (
                  <MaterialIcons name="chevron-right" size={18} color={colors.onSurfaceVariant} />
                )}
              </Pressable>
            </View>

            {activeChips.length > 0 && (
              <View className="flex-row flex-wrap gap-2 px-4 mb-3">
                {activeChips.map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={c.onRemove}
                    className="flex-row items-center gap-1 bg-secondary-container/50 pl-3 pr-2 py-1.5 rounded-full"
                  >
                    <Text className="font-sans-bold text-[11px] text-on-secondary-container" numberOfLines={1}>
                      {c.label}
                    </Text>
                    <MaterialIcons name="close" size={13} color={colors.onSecondaryContainer} />
                  </Pressable>
                ))}
              </View>
            )}

            <View className="px-4 mb-4 mt-2">
              <View className="flex-row items-center gap-2 mb-2" accessibilityElementsHidden>
                <View style={{ height: 1, width: 28, backgroundColor: colors.gold }} />
                <MaterialIcons name="spa" size={18} color={colors.gold} />
                <View style={{ height: 1, width: 28, backgroundColor: colors.gold }} />
              </View>
              <Text className="font-serif text-primary" style={{ fontSize: 24, lineHeight: 30 }}>
                {t('popular_halls')}
              </Text>
              <Text className="font-sans text-xs text-on-surface-variant mt-1">
                {totalHalls > 0 ? `${totalHalls.toLocaleString('en-IN')} ` : ''}{t('premium_venues')}
              </Text>

              {popularAreas.areas.length > 0 && (
                <View className="mt-4 p-4 rounded-2xl bg-surface-container-low border border-gold/25">
                  <View className="flex-row items-center gap-1.5 mb-3">
                    <MaterialIcons name="location-on" size={18} color={colors.gold} />
                    <Text className="font-serif text-primary text-base">{t('popular_areas')}</Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {popularAreas.areas.map((a) => {
                      const on = appliedFilters.area === a && appliedFilters.city === popularAreas.city;
                      return (
                        <Pressable
                          key={a}
                          onPress={() => pickPopularArea(a)}
                          accessibilityRole="button"
                          className={`px-4 rounded-full border items-center justify-center ${on ? 'bg-primary border-primary' : 'bg-white border-gold/50'}`}
                          style={{ height: 40 }}
                        >
                          <Text className={`font-sans-medium text-xs ${on ? 'text-on-primary' : 'text-on-surface'}`}>{a}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-4"
              contentContainerClassName="px-4 gap-2"
            >
              <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-on-surface-variant self-center mr-1">
                {tStr('sort')}
              </Text>
              {SORT_OPTIONS.map(([key, labelKey]) => (
                <Pressable
                  key={key}
                  onPress={() => setSort(key)}
                  className={`px-3.5 py-2 rounded-full border ${
                    sort === key ? 'bg-primary border-primary' : 'bg-surface-container border-outline-variant'
                  }`}
                >
                  <Text
                    className={`font-sans-medium text-xs ${
                      sort === key ? 'text-on-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <View className="px-4">
            <HallCard hall={item} onPress={() => navigation.navigate('HallDetail', { hallId: item.id })} />
          </View>
        )}
        ListEmptyComponent={
          hallsQuery.isLoading ? (
            <View className="px-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : hallsQuery.isError ? (
            <View className="items-center px-8 mt-10">
              <MaterialIcons name="cloud-off" size={36} color={colors.error} />
              <Text className="font-serif text-base text-on-surface font-bold mt-3 text-center">
                {t('network_error_h')}
              </Text>
              <Text className="font-sans text-xs text-on-surface-variant text-center mt-1.5 mb-4">
                {t('network_error_help')}
              </Text>
              <Button title={tStr('retry_btn')} onPress={() => hallsQuery.refetch()} />
            </View>
          ) : (
            <View className="items-center px-8 mt-10">
              <MaterialIcons name="search-off" size={36} color={colors.outline} />
              <Text className="font-serif text-base text-on-surface font-bold mt-3 text-center">
                {t('no_halls_match')}
              </Text>
              <Text className="font-sans text-xs text-on-surface-variant text-center mt-1.5">
                {t('no_halls_help')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          hallsQuery.isFetchingNextPage ? (
            <View className="py-6 items-center">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />

      <Modal visible={cityPickerOpen} animationType="slide" transparent onRequestClose={() => setCityPickerOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setCityPickerOpen(false)}>
          <View className="mt-auto bg-surface-container-lowest rounded-t-2xl max-h-[70%]">
            <View className="p-4 border-b border-outline-variant/40">
              <Text className="font-serif text-base text-on-surface font-bold">{t('city_with_state')}</Text>
            </View>
            <FlatList
              data={['', ...(filtersQuery.data?.cities ?? [])]}
              keyExtractor={(c) => c || '__all__'}
              renderItem={({ item }) => (
                <Pressable
                  className="px-4 py-3.5 border-b border-outline-variant/20"
                  onPress={() => {
                    setCity(item);
                    setCityPickerOpen(false);
                    setAdvanced((a) => (a.area ? { ...a, area: undefined } : a));
                  }}
                >
                  <Text className="font-sans text-sm text-on-surface">{item || tStr('all_cities')}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={dateOpen} animationType="slide" transparent onRequestClose={() => setDateOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setDateOpen(false)}>
          <Pressable className="mt-auto bg-surface-container-lowest rounded-t-3xl pb-6" onPress={() => {}}>
            <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
              <Text className="font-serif text-primary text-lg">{t('auspicious_date')}</Text>
              {advanced.date ? (
                <Pressable
                  onPress={() => { setAdvanced((a) => ({ ...a, date: undefined })); setDateOpen(false); }}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text className="font-sans-bold text-xs text-primary">{tStr('clear_date')}</Text>
                </Pressable>
              ) : null}
            </View>
            <View className="mx-4 rounded-2xl overflow-hidden border border-outline-variant/40">
              <Calendar
                minDate={new Date().toISOString().slice(0, 10)}
                markedDates={advanced.date ? { [advanced.date]: { selected: true, selectedColor: colors.primary } } : {}}
                onDayPress={(d: DateData) => {
                  setAdvanced((a) => ({ ...a, date: d.dateString }));
                  setDateOpen(false);
                }}
                theme={{
                  todayTextColor: colors.primary,
                  arrowColor: colors.primary,
                  selectedDayBackgroundColor: colors.primary,
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <FiltersModal
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        city={city}
        areaOptions={areaOptions}
        value={advanced}
        onApply={(next) => {
          setAdvanced(next);
          runSearch(next);
        }}
      />
    </SafeAreaView>
  );
}
