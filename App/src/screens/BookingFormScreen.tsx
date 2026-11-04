import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { normalizePhone } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { BookingStepBar } from '../components/BookingStepBar';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { EVENT_TYPE_LABEL_KEYS, type EventType } from '../booking/types';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'BookingForm'>;

const EVENT_TYPES = Object.entries(EVENT_TYPE_LABEL_KEYS) as [EventType, (typeof EVENT_TYPE_LABEL_KEYS)[EventType]][];

const EVENT_ICONS: Record<EventType, keyof typeof MaterialIcons.glyphMap> = {
  wedding: 'favorite',
  engagement: 'favorite-border',
  reception: 'celebration',
  birthday: 'cake',
  corporate: 'work',
  other: 'event',
};

export default function BookingFormScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user } = useAuth();
  const { draft, patchDraft } = useBookingDraft();

  const [name, setName] = useState(draft.customerName || user?.name || '');
  const [phone, setPhone] = useState(draft.customerPhone || user?.phone || '');
  const [eventType, setEventType] = useState<EventType | undefined>(draft.eventType);
  const [guestCount, setGuestCount] = useState(draft.guestCount ? String(draft.guestCount) : '');
  const [requests, setRequests] = useState(draft.specialRequests || '');
  const [error, setError] = useState('');

  const isValid = name.trim().length >= 2 && normalizePhone(phone) !== null && !!eventType && Number(guestCount) > 0;

  function continueToSummary() {
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError(tStr('invalid_phone'));
      return;
    }
    if (!isValid) {
      setError('Please fill in your name, phone, event type and guest count.');
      return;
    }
    if (draft.hallCapacity > 0 && Number(guestCount) > draft.hallCapacity) {
      setError(tStr('guest_count_over', { n: draft.hallCapacity }));
      return;
    }
    patchDraft({
      customerName: name.trim(),
      customerPhone: e164,
      eventType,
      guestCount: Number(guestCount),
      specialRequests: requests.trim(),
    });
    navigation.navigate('BookingSummary');
  }

  // Steps snap to multiples of 50 (1 → 50 → 100, 120 → 150); the count can also be typed exactly.
  function adjustGuests(delta: number) {
    const current = Number(guestCount) || 0;
    const rem = current % 50;
    const next = delta > 0 ? current - rem + 50 : rem === 0 ? current - 50 : current - rem;
    setGuestCount(String(Math.max(1, next)));
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header with back button */}
      <View className="flex-row items-center px-4 py-3 gap-2">
        <Pressable
          onPress={() => navigation.goBack()}
          className="p-1 -ml-1"
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text className="font-serif text-base text-on-surface font-bold">{t('your_details_h')}</Text>
      </View>

      {/* Progress stepper */}
      <BookingStepBar current="details" />

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerClassName="px-5 pb-8 pt-4" keyboardShouldPersistTaps="handled">
        {error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.errorContainer,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 16,
            }}
          >
            <MaterialIcons name="error-outline" size={16} color={colors.onErrorContainer} />
            <Text className="font-sans text-xs text-on-error-container flex-1">{error}</Text>
          </View>
        ) : null}

        <TextField label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
        <TextField
          label="Phone number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 XXXXX XXXXX"
        />

        {/* Event type selector with icons */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: colors.onSurfaceVariant,
            letterSpacing: 0.2,
            marginBottom: 10,
          }}
        >
          {t('booking_event_type_h')}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {EVENT_TYPES.map(([key, labelKey]) => {
            const active = eventType === key;
            return (
              <Pressable
                key={key}
                onPress={() => setEventType(key)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: active ? colors.primary : colors.outlineVariant,
                  backgroundColor: active ? colors.primary : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <MaterialIcons
                  name={EVENT_ICONS[key] ?? 'event'}
                  size={14}
                  color={active ? '#fff' : colors.onSurfaceVariant}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? '#fff' : colors.onSurfaceVariant,
                  }}
                >
                  {tStr(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Guest count stepper */}
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: colors.onSurfaceVariant,
            letterSpacing: 0.2,
            marginBottom: 8,
          }}
        >
          {tStr('guest_count_label')}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: colors.outlineVariant,
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 4,
          }}
        >
          <Pressable
            onPress={() => adjustGuests(-50)}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceContainerHigh : colors.surfaceContainer,
            })}
          >
            <Text style={{ fontSize: 22, color: colors.primary, fontWeight: '300', lineHeight: 28 }}>−</Text>
          </Pressable>
          <View
            style={{
              flex: 1,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.outlineVariant + '60',
            }}
          >
            <TextInput
              value={guestCount}
              onChangeText={(v) => setGuestCount(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.outline}
              accessibilityLabel={tStr('guest_count_label')}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: 22,
                fontWeight: '700',
                color: colors.onSurface,
              }}
            />
          </View>
          <Pressable
            onPress={() => adjustGuests(50)}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceContainerHigh : colors.surfaceContainer,
            })}
          >
            <Text style={{ fontSize: 22, color: colors.primary, fontWeight: '300', lineHeight: 28 }}>+</Text>
          </Pressable>
        </View>
        {draft.hallCapacity ? (
          <Text className="font-sans text-[11px] text-on-surface-variant mb-4">
            {tStr('guest_count_hint', { n: draft.hallCapacity })}
          </Text>
        ) : (
          <View style={{ marginBottom: 16 }} />
        )}

        <TextField
          label="Special requests (optional)"
          multiline
          numberOfLines={3}
          value={requests}
          onChangeText={setRequests}
        />

        <Button title={tStr('continue_btn')} onPress={continueToSummary} className="mt-2" />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
