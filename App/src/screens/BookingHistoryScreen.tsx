import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Booking } from '../api/types';
import { useT } from '../i18n';
import { colors, cardBorderColor } from '../theme/colors';
import { HallImage } from '../components/HallImage';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/Button';
import { confirmAction } from '../components/confirm';
import { useToast } from '../components/Toast';
import { EVENT_TYPE_LABEL_KEYS } from '../booking/types';
import type { RootTabParamList } from '../navigation/types';

type Props = BottomTabScreenProps<RootTabParamList, 'BookingsTab'>;

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function sortBookings(bookings: Booking[]): Booking[] {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = bookings
    .filter((b) => b.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...upcoming, ...past];
}

function isUpcoming(date: string): boolean {
  return date >= new Date().toISOString().slice(0, 10);
}

export default function BookingHistoryScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user } = useAuth();
  const showToast = useToast();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Real bookings require a signed-in account (the backend ties every
  // booking to the authenticated user) — refetch on focus so a booking made
  // elsewhere (or a fresh sign-in) is picked up when this tab is opened.
  // useCallback is required here, not cosmetic — useFocusEffect re-runs
  // whenever the callback reference changes, so an unmemoized inline
  // function (which changes every render because setBookings triggers a
  // re-render) causes an infinite focus/render loop.
  const load = useCallback(() => {
    if (!user) {
      setBookings([]);
      return;
    }
    setLoadError(false);
    api
      .getMyBookings()
      .then((all) => setBookings(sortBookings(all)))
      .catch(() => {
        setLoadError(true);
        setBookings((prev) => prev ?? []);
      });
  }, [user]);
  useFocusEffect(load);

  function cancel(b: Booking) {
    confirmAction({
      title: tStr('cancel_booking_btn'),
      message: tStr('cancel_booking_confirm'),
      confirmLabel: tStr('cancel_booking_btn'),
      cancelLabel: tStr('go_back_btn'),
      onConfirm: async () => {
        setCancelling(b.id);
        try {
          await api.cancelBooking(b.id);
          load();
        } catch (e) {
          showToast('error', e instanceof Error ? e.message : 'Could not cancel the booking');
        } finally {
          setCancelling(null);
        }
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-4 py-3">
        <Text className="font-serif text-h3 text-on-surface font-bold">{t('my_bookings_h')}</Text>
      </View>

      {!user ? (
        <View className="items-center px-8 mt-10">
          <MaterialIcons name="lock-outline" size={48} color={colors.outlineVariant} />
          <Text className="font-serif text-base text-on-surface font-bold mt-4 text-center">
            {t('sign_in_to_view_bookings_h')}
          </Text>
          <Text className="font-sans text-xs text-on-surface-variant text-center mt-2 leading-relaxed">
            {t('sign_in_to_view_bookings_help')}
          </Text>
        </View>
      ) : bookings === null ? (
        <View className="px-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerClassName="px-4 pb-8"
          // A refresh failed while older bookings are still on screen: say so, don't silently show stale data.
          ListHeaderComponent={
            loadError && (bookings?.length ?? 0) > 0 ? (
              <View className="flex-row items-center gap-2 bg-error-container rounded-xl px-4 py-3 mb-3">
                <MaterialIcons name="cloud-off" size={16} color={colors.onErrorContainer} />
                <Text className="font-sans text-xs text-on-error-container flex-1">{t('bookings_load_error')}</Text>
                <Pressable onPress={load} hitSlop={8}>
                  <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-primary">{tStr('retry_btn')}</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const cancelled = item.status === 'CANCELLED';
            const upcoming = isUpcoming(item.date) && !cancelled;
            const confirmed = item.status === 'CONFIRMED';
            return (
              <Pressable
                onPress={() =>
                  navigation.navigate('ExploreTab', {
                    screen: 'HallDetail',
                    params: { hallId: item.hallId },
                  })
                }
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: 0,
                  backgroundColor: colors.surfaceContainerLowest,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  marginBottom: 14,
                  overflow: 'hidden',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                {/* Gold/maroon left accent bar */}
                <View
                  style={{
                    width: 4,
                    backgroundColor: upcoming ? colors.gold : colors.outlineVariant,
                    borderTopLeftRadius: 12,
                    borderBottomLeftRadius: 12,
                  }}
                />
                <View style={{ flex: 1, flexDirection: 'row', gap: 12, padding: 12 }}>
                  <HallImage uri={item.hall?.imageUrl} style={{ width: 64, height: 64, borderRadius: 12 }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text
                        className="font-serif text-sm text-on-surface font-bold flex-1 mr-2"
                        numberOfLines={1}
                      >
                        {item.hall?.name}
                      </Text>
                      <View
                        style={{
                          backgroundColor: cancelled ? colors.surfaceContainerHigh : confirmed ? colors.primary + '1a' : upcoming ? colors.gold + '26' : colors.secondaryContainer + '99',
                          paddingHorizontal: 7,
                          paddingVertical: 3,
                          borderRadius: 20,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '700',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: cancelled ? colors.onSurfaceVariant : confirmed ? colors.primary : upcoming ? colors.gold : colors.onSecondaryContainer,
                          }}
                        >
                          {tStr(
                            cancelled ? 'booking_status_cancelled' : confirmed ? 'booking_status_confirmed' : 'booking_status_pending',
                          )}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="font-sans text-xs text-on-surface-variant mt-0.5"
                      numberOfLines={1}
                    >
                      {item.hall?.area ? `${item.hall.area}, ${item.hall.city}` : item.hall?.city}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <MaterialIcons name="event" size={11} color={colors.primary} />
                      <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>
                        {formatDate(item.date)} · {tStr(EVENT_TYPE_LABEL_KEYS[item.eventType])} · {item.guestCount} guests
                      </Text>
                    </View>
                    <Text className="font-serif text-sm text-primary font-bold mt-1">
                      {formatINR(item.advanceAmount)}{' '}
                      <Text className="font-sans text-[10px] text-on-surface-variant">
                        {tStr('advance_payable_label')}
                      </Text>
                    </Text>
                    {!cancelled && isUpcoming(item.date) && (
                      <Pressable onPress={() => cancel(item)} disabled={cancelling === item.id} hitSlop={8} className="mt-2">
                        <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-error">
                          {tStr('cancel_booking_btn')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            loadError ? (
              <View className="items-center px-8 mt-10">
                <MaterialIcons name="cloud-off" size={48} color={colors.error} />
                <Text className="font-serif text-base text-on-surface font-bold mt-4 text-center">
                  {t('bookings_load_error')}
                </Text>
                <Text className="font-sans text-xs text-on-surface-variant text-center mt-2 mb-4 leading-relaxed">
                  {t('network_error_help')}
                </Text>
                <Button title={tStr('retry_btn')} onPress={load} />
              </View>
            ) : (
              <View className="items-center px-8 mt-10">
                <MaterialIcons name="event-busy" size={48} color={colors.outlineVariant} />
                <Text className="font-serif text-base text-on-surface font-bold mt-4 text-center">
                  {t('no_bookings_h')}
                </Text>
                <Text className="font-sans text-xs text-on-surface-variant text-center mt-2 leading-relaxed">
                  {t('no_bookings_help')}
                </Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
