import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { AiSearchResponse } from '../api/types';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { HallCard } from '../components/HallCard';
import { AiCriteriaCard, criteriaSummary, fmtDay } from '../components/AiCriteria';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'AiResults'>;
type AiHall = AiSearchResponse['halls'][number];

/**
 * Step 2 of the AI search flow: what was understood, anything that could not be understood or checked, and only the
 * halls the server returned. Everything shown here comes from the /api/halls/ai-search response — nothing is added
 * or assumed on the device. A hall only gets the "Available on <date>" pill when the server verified that date.
 */
export default function AiResultsScreen({ navigation, route }: Props) {
  const { t, tStr } = useT();
  const [res, setRes] = useState<AiSearchResponse>(route.params.result);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const edit = () => navigation.goBack();
  const tryDifferent = () => navigation.popToTop();

  async function loadMore() {
    if (more || res.halls.length >= res.total) return;
    setMore(true);
    setMoreError(null);
    try {
      const next = await api.aiSearchHalls(res.query, { offset: res.halls.length });
      setRes({ ...next, halls: [...res.halls, ...next.halls] });
    } catch (e) {
      setMoreError((e as Error).message || tStr('smart_error'));
    } finally {
      setMore(false);
    }
  }

  const blocking = res.issues.filter((i) => i.blocking);
  const noDate = res.issues.find((i) => i.code === 'no_date');
  const notices = res.issues.filter((i) => !i.blocking && i.code !== 'no_date');
  const hasHalls = res.searched && res.halls.length > 0;

  function notesFor(h: AiHall) {
    const out: { icon: keyof typeof MaterialIcons.glyphMap; text: string }[] = [];
    if (!h.ai.availability.verified) out.push({ icon: 'event-busy', text: tStr('smart_not_checked') });
    for (const p of h.ai.preferences.confirmed) out.push({ icon: /parking/i.test(p) ? 'local-parking' : 'check-circle-outline', text: tStr('smart_pref_yes', { pref: p }) });
    for (const p of h.ai.preferences.notListed) out.push({ icon: /parking/i.test(p) ? 'local-parking' : 'info-outline', text: tStr('smart_pref_not_listed', { pref: p }) });
    return out;
  }

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
      <Text numberOfLines={2} style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 12 }}>
        “{res.query}”
      </Text>

      {res.understood.length > 0 && <AiCriteriaCard understood={res.understood} onEdit={edit} />}

      {blocking.map((i) => (
        <Notice key={i.code} tone="error" icon="error-outline" text={i.message} />
      ))}

      {noDate && (
        <View
          style={{ marginTop: 14, backgroundColor: '#FFF4D6', borderWidth: 1, borderColor: '#EBD08A', borderRadius: 14, padding: 14 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="event-busy" size={20} color="#8A6A22" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#5C4510' }}>{t('smart_no_date_title')}</Text>
          </View>
          <Text style={{ fontSize: 12, lineHeight: 18, color: '#5C4510', marginTop: 6 }}>{noDate.message}</Text>
          <Pressable
            onPress={edit}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 10,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: '#8A6A22',
              paddingHorizontal: 14,
              height: 40,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <MaterialIcons name="event" size={16} color="#8A6A22" />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#5C4510' }}>{t('smart_add_date')}</Text>
          </Pressable>
        </View>
      )}

      {notices.map((i) => (
        <Notice key={i.code} tone="info" icon="info-outline" text={i.message} />
      ))}
      {/* "No listed hall matches all of …" is shown in the no-match card below, not twice. */}
      {(hasHalls ? res.notes : []).map((n) => (
        <Text key={n} style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 10 }}>• {n}</Text>
      ))}

      {hasHalls && (
        <View
          style={{ marginTop: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E3F4E8', borderWidth: 1, borderColor: '#B9DDC6', borderRadius: 14, padding: 14 }}
        >
          <MaterialIcons name="check-circle-outline" size={24} color="#15803d" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }}>
              {tStr(res.total === 1 ? 'smart_found_one' : 'smart_found', { n: res.total.toLocaleString('en-IN') })}
            </Text>
            <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 }}>{criteriaSummary(res.understood)}</Text>
          </View>
        </View>
      )}
    </View>
  );

  const empty = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {res.searched && (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="search-off" size={40} color={colors.primary} />
          </View>
          <Text className="font-serif text-primary" style={{ fontSize: 22, marginTop: 14 }}>{t('smart_no_match_title')}</Text>
          <Text style={{ fontSize: 12, textAlign: 'center', color: colors.onSurfaceVariant, marginTop: 6 }}>{t('smart_no_match_sub')}</Text>
        </View>
      )}
      {res.searched && res.notes.map((n) => <Notice key={n} tone="error" icon="error-outline" text={n} />)}
      <Pressable
        onPress={tryDifferent}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: 18, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>{t('smart_try_diff')}</Text>
      </Pressable>
      <Pressable
        onPress={edit}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: 10, height: 50, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
      >
        <MaterialIcons name="edit" size={17} color={colors.onPrimary} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onPrimary }}>{t('smart_edit_search')}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          onPress={edit}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="items-center justify-center"
          style={{ width: 44, height: 44 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, marginLeft: 4 }}>{t('smart_results_title')}</Text>
      </View>

      <FlatList
        data={hasHalls ? res.halls : []}
        keyExtractor={(h) => h.id}
        ListHeaderComponent={header}
        ListEmptyComponent={hasHalls ? null : empty}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <HallCard
              hall={item}
              onPress={() => navigation.navigate('HallDetail', { hallId: item.id })}
              badge={item.ai.availability.verified ? tStr('smart_avail_on', { date: fmtDay(item.ai.availability.date) }) : undefined}
              notes={notesFor(item)}
            />
          </View>
        )}
        ListFooterComponent={
          hasHalls && res.halls.length < res.total ? (
            <View style={{ paddingHorizontal: 16 }}>
              {moreError ? <Text style={{ fontSize: 12, color: colors.error, marginBottom: 8 }}>{moreError}</Text> : null}
              <Pressable
                onPress={() => void loadMore()}
                disabled={more}
                accessibilityRole="button"
                style={({ pressed }) => ({ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: more ? 0.6 : pressed ? 0.7 : 1 })}
              >
                {more ? <ActivityIndicator color={colors.primary} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>{t('smart_load_more')}</Text>}
              </Pressable>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Notice({ tone, icon, text }: { tone: 'error' | 'info'; icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  const err = tone === 'error';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 12,
        borderRadius: 12,
        padding: 12,
        backgroundColor: err ? colors.errorContainer : 'rgba(241,221,168,0.4)',
        borderWidth: err ? 1 : 0,
        borderColor: '#F0B8B2',
      }}
    >
      <MaterialIcons name={icon} size={18} color={err ? colors.onErrorContainer : colors.onSecondaryContainer} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: err ? colors.onErrorContainer : colors.onSecondaryContainer }}>{text}</Text>
    </View>
  );
}
