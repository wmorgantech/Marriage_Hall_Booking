import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Calendar, type DateData } from 'react-native-calendars';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { HallImage } from '../components/HallImage';
import { BookingStepBar } from '../components/BookingStepBar';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { MUHURTHAM_DATES } from '../data/muhurthamDates';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'CheckAvailability'>;

export default function CheckAvailabilityScreen({ route, navigation }: Props) {
  const { hallId } = route.params;
  const { t, tStr } = useT();
  const { patchDraft } = useBookingDraft();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const hallQuery = useQuery({ queryKey: ['hall', hallId], queryFn: () => api.getHall(hallId) });
  const availQuery = useQuery({
    queryKey: ['availability', hallId],
    queryFn: () => api.getAvailability(hallId),
  });

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const date of MUHURTHAM_DATES) {
      marks[date] = { dots: [{ key: 'muhurtham', color: colors.gold }] };
    }
    for (const a of availQuery.data ?? []) {
      const key = a.date.slice(0, 10);
      if (a.status === 'BOOKED') {
        const dots = marks[key]?.dots ?? [];
        marks[key] = { ...marks[key], disabled: true, disableTouchEvent: true, dots: [...dots, { key: 'booked', color: colors.error }] };
      }
    }
    if (selectedDate) {
      marks[selectedDate] = { ...(marks[selectedDate] ?? {}), selected: true, selectedColor: colors.primary };
    }
    return marks;
  }, [availQuery.data, selectedDate]);

  const hall = hallQuery.data;

  if (hallQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <MaterialIcons name="cloud-off" size={36} color={colors.error} />
        <Text className="font-serif text-base text-on-surface font-bold text-center mt-3 mb-1.5">
          {t('network_error_h')}
        </Text>
        <Text className="font-sans text-xs text-on-surface-variant text-center mb-5">
          {t('network_error_help')}
        </Text>
        <View className="flex-row gap-3">
          <Button title={tStr('go_back_btn')} variant="outline" onPress={() => navigation.goBack()} />
          <Button title={tStr('retry_btn')} onPress={() => hallQuery.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (hallQuery.isLoading || !hall) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  function continueToForm() {
    if (!selectedDate || !hall) return;
    patchDraft({
      hallId: hall.id,
      hallName: hall.name,
      hallImage: hall.imageUrl ?? undefined,
      hallCity: hall.city,
      hallArea: hall.area,
      hallCapacity: hall.capacity,
      contactNumber: hall.contactNumber,
      pricePerDay: hall.price,
      advancePercent: hall.advancePercent ?? 50,
      cancellationPolicy: hall.cancellationPolicy,
      date: selectedDate,
    });
    navigation.navigate('BookingForm');
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
        <Text className="font-serif text-base text-on-surface font-bold">{t('check_avail_h')}</Text>
      </View>

      {/* Progress stepper */}
      <BookingStepBar current="date" />

      <ScrollView contentContainerClassName="px-4 pb-8 pt-4">
        {/* Hall preview card */}
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
          <HallImage uri={hall.imageUrl} style={{ width: 56, height: 56, borderRadius: 12 }} />
          <View style={{ flex: 1 }}>
            <Text className="font-serif text-sm text-on-surface font-bold" numberOfLines={1}>
              {hall.name}
            </Text>
            <Text className="font-sans text-xs text-on-surface-variant" numberOfLines={1}>
              {hall.area ? `${hall.area}, ${hall.city}` : hall.city}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
              ₹{hall.price.toLocaleString('en-IN')} /day
            </Text>
          </View>
        </View>

        <View className="rounded-2xl overflow-hidden border border-outline-variant/40 mb-3">
          <Calendar
            minDate={new Date().toISOString().slice(0, 10)}
            markedDates={markedDates}
            markingType="multi-dot"
            onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
            theme={{
              todayTextColor: colors.primary,
              arrowColor: colors.primary,
              selectedDayBackgroundColor: colors.primary,
              textDisabledColor: colors.outlineVariant,
              dotColor: colors.error,
            }}
          />
        </View>

        <View className="flex-row items-center gap-4 mb-5">
          <LegendDot color={colors.primary} label={tStr('legend_available')} />
          <LegendDot color={colors.error} label={tStr('legend_booked')} />
          <LegendDot color={colors.gold} label={tStr('legend_muhurtham')} />
        </View>

        <View
          style={{
            backgroundColor: colors.surfaceContainer,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <Text className="font-sans-semibold text-xs uppercase tracking-wider text-on-surface-variant">
            {t('time_slot')}
          </Text>
          <Text className="font-sans-bold text-sm text-on-surface">{t('full_day_24')}</Text>
        </View>

        <Button
          title={tStr('continue_btn')}
          onPress={continueToForm}
          disabled={!selectedDate}
        />
        {!selectedDate && (
          <Text className="font-sans text-[11px] text-on-surface-variant text-center mt-2">
            {t('select_date_first')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="font-sans text-[11px] text-on-surface-variant">{label}</Text>
    </View>
  );
}
