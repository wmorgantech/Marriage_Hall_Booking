import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'AiSearch'>;

const MAX = 300;
// Plain example queries — the same natural-language search as typing them by hand.
const EXAMPLES = [
  'Chennai-la 500 guests-ku AC hall venum',
  'Madurai-la budget friendly hall',
  'Coimbatore-la parking irukkura hall',
];

/**
 * Step 1 of the AI search flow: describe what you need in your own words. The only required input is this text
 * (2+ characters); everything else is optional. The search itself is POST /api/halls/ai-search — this screen only
 * collects the text, calls it and hands the response to the results screen.
 */
export default function AiSearchScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const canSearch = text.trim().length >= 2 && !busy;

  async function run(query: string) {
    const q = query.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.aiSearchHalls(q);
      navigation.navigate('AiResults', { result });
    } catch (e) {
      setError((e as Error).message || tStr('smart_error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="items-center justify-center"
          style={{ width: 44, height: 44 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, marginLeft: 4 }}>{t('smart_screen_title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.surfaceContainerLow,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: 'rgba(198,154,69,0.35)',
            paddingVertical: 24,
            paddingHorizontal: 20,
          }}
        >
          <MaterialIcons name="auto-awesome" size={34} color={colors.gold} />
          <Text className="font-serif text-primary text-center" style={{ fontSize: 24, marginTop: 10 }}>
            {t('smart_tell')}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
            {t('smart_desc')}
          </Text>
        </View>

        <View
          style={{
            marginTop: 16,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: 'rgba(198,154,69,0.55)',
            borderRadius: 14,
            padding: 12,
            minHeight: 110,
          }}
        >
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX))}
            maxLength={MAX}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder={tStr('smart_placeholder')}
            placeholderTextColor={colors.outline}
            accessibilityLabel={tStr('smart_tell')}
            style={{ fontSize: 14, color: colors.onSurface, minHeight: 70, paddingRight: 28 }}
          />
          {text.length > 0 && (
            <Pressable
              onPress={() => { setText(''); inputRef.current?.focus(); }}
              accessibilityRole="button"
              accessibilityLabel={tStr('smart_clear')}
              style={{ position: 'absolute', top: 10, right: 10 }}
              hitSlop={10}
            >
              <MaterialIcons name="cancel" size={20} color={colors.outline} />
            </Pressable>
          )}
          <Text style={{ alignSelf: 'flex-end', fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4 }}>
            {text.length}/{MAX}
          </Text>
        </View>

        {error ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12, backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 }}>
            <MaterialIcons name="error-outline" size={18} color={colors.onErrorContainer} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.onErrorContainer }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void run(text)}
          disabled={!canSearch}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 16,
            height: 52,
            borderRadius: 12,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: !canSearch ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <MaterialIcons name="auto-awesome" size={18} color={colors.onPrimary} />}
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onPrimary }}>{busy ? t('searching') : t('smart_btn')}</Text>
        </Pressable>

        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 24, marginBottom: 10 }}>{t('smart_examples')}</Text>
        <View style={{ gap: 10, alignItems: 'flex-start' }}>
          {EXAMPLES.map((ex) => (
            <Pressable
              key={ex}
              onPress={() => { setText(ex); void run(ex); }}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: 'rgba(198,154,69,0.4)',
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 9,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 12, color: colors.onSurface }}>{ex}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
