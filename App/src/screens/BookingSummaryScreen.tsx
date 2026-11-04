import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { HallImage } from '../components/HallImage';
import { BookingStepBar } from '../components/BookingStepBar';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { EVENT_TYPE_LABEL_KEYS } from '../booking/types';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'BookingSummary'>;

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function BookingSummaryScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { draft } = useBookingDraft();

  const advanceAmount = Math.round((draft.pricePerDay * draft.advancePercent) / 100);
  const balanceAmount = draft.pricePerDay - advanceAmount;

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
        <Text className="font-serif text-base text-on-surface font-bold">{t('booking_summary_h')}</Text>
      </View>

      {/* Progress stepper */}
      <BookingStepBar current="summary" />

      <ScrollView contentContainerClassName="px-5 pb-8 pt-4">
        {/* Hall header card */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: colors.surfaceContainerLowest,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.outlineVariant + '40',
            padding: 12,
            marginBottom: 20,
          }}
        >
          <HallImage uri={draft.hallImage} style={{ width: 64, height: 64, borderRadius: 12 }} />
          <View style={{ flex: 1 }}>
            <Text className="font-serif text-base text-on-surface font-bold" numberOfLines={1}>
              {draft.hallName}
            </Text>
            <Text className="font-sans text-xs text-on-surface-variant" numberOfLines={1}>
              {draft.hallArea ? `${draft.hallArea}, ${draft.hallCity}` : draft.hallCity}
            </Text>
            {draft.date && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <MaterialIcons name="event" size={12} color={colors.primary} />
                <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>{draft.date}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Booking details */}
        <View className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 mb-5">
          <SummaryRow icon="event" label={tStr('wedding_date')} value={draft.date ?? '—'} />
          <SummaryRow icon="schedule" label={tStr('time_slot')} value={tStr('full_day_24')} />
          <SummaryRow
            icon="celebration"
            label={tStr('booking_event_type_h')}
            value={draft.eventType ? tStr(EVENT_TYPE_LABEL_KEYS[draft.eventType]) : '—'}
          />
          <SummaryRow icon="groups" label={tStr('guest_count_label')} value={String(draft.guestCount ?? '—')} last />
        </View>

        {/* Price breakdown */}
        <Text className="font-serif text-base text-on-surface font-bold mb-2">{t('price_breakdown_h')}</Text>
        <View className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 mb-5">
          <PriceRow label={tStr('total_price_label')} value={formatINR(draft.pricePerDay)} />
          <PriceRow
            label={`${tStr('advance_payable_label')} (${draft.advancePercent}%)`}
            value={formatINR(advanceAmount)}
            emphasize
          />
          <PriceRow label={tStr('balance_at_venue_label')} value={formatINR(balanceAmount)} last />
        </View>

        {draft.cancellationPolicy ? (
          <View className="mb-5">
            <Text className="font-serif text-base text-on-surface font-bold mb-2">
              {t('cancellation_policy_h')}
            </Text>
            <View className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4">
              <Text className="font-sans text-sm text-on-surface-variant leading-relaxed">
                {draft.cancellationPolicy}
              </Text>
            </View>
          </View>
        ) : null}

        <Button
          title={tStr('proceed_to_payment_btn')}
          onPress={() => navigation.navigate('Payment')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3.5 ${last ? '' : 'border-b border-outline-variant/30'}`}
    >
      <MaterialIcons name={icon} size={16} color={colors.primary} />
      <Text className="font-sans text-xs text-on-surface-variant flex-1">{label}</Text>
      <Text className="font-sans-semibold text-sm text-on-surface">{value}</Text>
    </View>
  );
}

function PriceRow({
  label,
  value,
  last,
  emphasize,
}: {
  label: string;
  value: string;
  last?: boolean;
  emphasize?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3.5 ${last ? '' : 'border-b border-outline-variant/30'}`}
    >
      <Text
        className={`font-sans text-sm ${emphasize ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}
      >
        {label}
      </Text>
      <Text
        className={`font-serif ${emphasize ? 'text-base text-primary font-bold' : 'text-sm text-on-surface font-semibold'}`}
      >
        {value}
      </Text>
    </View>
  );
}
