import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, type DateData } from 'react-native-calendars';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, normalizePhone } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { confirmAction } from '../components/confirm';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { MUHURTHAM_DATES } from '../data/muhurthamDates';
import { EVENT_TYPE_LABEL_KEYS } from '../booking/types';
import type { AccountStackParamList } from '../navigation/types';
import type { AvailabilityStatus, Booking, Hall } from '../api/types';

function dayLabel(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Props = NativeStackScreenProps<AccountStackParamList, 'OwnerDashboard'>;

export default function OwnerDashboardScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user, logout } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [pendingDates, setPendingDates] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<AvailabilityStatus>('BOOKED');
  const [formModal, setFormModal] = useState<{ hall?: Hall } | null>(null);
  const [applying, setApplying] = useState(false);

  const hallsQuery = useQuery({
    queryKey: ['myHalls'],
    queryFn: api.myHalls,
    retry: false,
  });

  const halls = hallsQuery.data ?? [];
  const activeHallId = selectedHallId ?? halls[0]?.id ?? null;
  const activeHall = halls.find((h) => h.id === activeHallId);

  const availQuery = useQuery({
    queryKey: ['ownerAvailability', activeHallId],
    queryFn: () => api.getAvailability(activeHallId as string),
    enabled: !!activeHallId,
  });

  const bookingsQuery = useQuery({
    queryKey: ['ownerBookings', activeHallId],
    queryFn: () => api.hallBookings(activeHallId as string),
    enabled: !!activeHallId,
  });
  const [busyBooking, setBusyBooking] = useState<string | null>(null);

  // Upcoming first (soonest first), then past bookings (most recent first).
  const orderedBookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return [
      ...all.filter((b) => b.date.slice(0, 10) >= today),
      ...all.filter((b) => b.date.slice(0, 10) < today).reverse(),
    ];
  }, [bookingsQuery.data]);

  async function runBookingAction(b: Booking, action: 'confirm' | 'cancel') {
    setBusyBooking(b.id);
    try {
      if (action === 'confirm') await api.confirmBooking(b.id);
      else await api.cancelBooking(b.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ownerBookings', activeHallId] }),
        queryClient.invalidateQueries({ queryKey: ['ownerAvailability', activeHallId] }),
      ]);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : `Could not ${action} booking`);
    } finally {
      setBusyBooking(null);
    }
  }

  function bookingAction(b: Booking, action: 'confirm' | 'cancel') {
    if (action === 'confirm') return void runBookingAction(b, action);
    confirmAction({
      title: tStr('cancel_booking_btn'),
      message: tStr('cancel_booking_confirm'),
      confirmLabel: tStr('cancel_booking_btn'),
      cancelLabel: tStr('go_back_btn'),
      onConfirm: () => void runBookingAction(b, action),
    });
  }

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const date of MUHURTHAM_DATES) {
      marks[date] = { dots: [{ key: 'muhurtham', color: colors.gold }] };
    }
    for (const a of availQuery.data ?? []) {
      const key = a.date.slice(0, 10);
      if (a.status === 'BOOKED') {
        const dots = marks[key]?.dots ?? [];
        marks[key] = {
          ...marks[key],
          customTextStyle: { color: colors.error },
          dots: [...dots, { key: 'booked', color: colors.error }],
        };
      }
    }
    for (const date of pendingDates) {
      marks[date] = { ...(marks[date] ?? {}), selected: true, selectedColor: colors.gold };
    }
    return marks;
  }, [availQuery.data, pendingDates]);

  function toggleDate(day: DateData) {
    setPendingDates((cur) => {
      const next = new Set(cur);
      if (next.has(day.dateString)) next.delete(day.dateString);
      else next.add(day.dateString);
      return next;
    });
  }

  async function applyChanges() {
    if (!activeHallId || pendingDates.size === 0) return;
    setApplying(true);
    try {
      await api.setAvailability(activeHallId, Array.from(pendingDates), mode);
      setPendingDates(new Set());
      await queryClient.invalidateQueries({ queryKey: ['ownerAvailability', activeHallId] });
      showToast('success', `${pendingDates.size} date(s) updated`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not update availability');
    } finally {
      setApplying(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'OwnerLogin' }] });
  }

  if (hallsQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <Text className="font-serif text-base text-on-surface font-bold text-center mb-4">
          Your session has expired
        </Text>
        <Button title="Sign in again" onPress={handleLogout} />
      </SafeAreaView>
    );
  }

  const applyLabel = applying
    ? tStr('od_saving')
    : tStr('od_apply_to', {
        n: pendingDates.size,
        plural: pendingDates.size === 1 ? tStr('od_date') : tStr('od_dates'),
      });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View>
          <Text className="font-serif text-h3 text-on-surface font-bold">{t('od_my_halls')}</Text>
          <Text className="font-sans text-xs text-on-surface-variant mt-0.5">
            Hi, {user?.name?.split(' ')[0]}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => setFormModal({})} className="bg-primary px-3.5 py-2 rounded-lg">
            <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-on-primary">
              {t('od_add_hall')}
            </Text>
          </Pressable>
          <Pressable onPress={handleLogout} hitSlop={12}>
            <MaterialIcons name="logout" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      {hallsQuery.isLoading ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : halls.length === 0 ? (
        <View className="items-center px-8 mt-10">
          <MaterialIcons name="home-work" size={36} color={colors.outline} />
          <Text className="font-serif text-base text-on-surface font-bold mt-3">{t('od_no_halls')}</Text>
          <Text className="font-sans text-xs text-on-surface-variant text-center mt-1.5">
            {t('od_no_halls_help')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-4 pb-10">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {halls.map((h) => (
                <Pressable
                  key={h.id}
                  onPress={() => {
                    setSelectedHallId(h.id);
                    setPendingDates(new Set());
                  }}
                  className={`px-4 py-2.5 rounded-full border ${
                    activeHallId === h.id ? 'bg-primary border-primary' : 'border-outline-variant'
                  }`}
                >
                  <Text
                    className={`font-sans-semibold text-xs ${
                      activeHallId === h.id ? 'text-on-primary' : 'text-on-surface'
                    }`}
                  >
                    {h.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {activeHall && (
            <>
              <View className="flex-row items-center justify-between mb-3">
                <Text className="font-serif text-base text-on-surface font-bold flex-1 mr-2" numberOfLines={1}>
                  {activeHall.name}
                </Text>
                <Pressable
                  onPress={() => setFormModal({ hall: activeHall })}
                  className="flex-row items-center gap-1 bg-surface-container px-3 py-1.5 rounded-lg"
                >
                  <MaterialIcons name="edit" size={14} color={colors.primary} />
                  <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-primary">
                    {t('od_edit_hall')}
                  </Text>
                </Pressable>
              </View>

              {!activeHall.isApproved && (
                <View className="flex-row items-center gap-2 bg-secondary-container/40 rounded-xl px-4 py-3 mb-4">
                  <MaterialIcons name="hourglass-top" size={16} color={colors.onSecondaryContainer} />
                  <Text className="font-sans text-xs text-on-secondary-container flex-1">
                    {t('od_pending_admin')}
                  </Text>
                </View>
              )}

              <View className="flex-row gap-2 mb-3">
                {(['BOOKED', 'AVAILABLE'] as AvailabilityStatus[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    className={`px-4 py-2 rounded-full border ${
                      mode === m ? 'bg-primary border-primary' : 'border-outline-variant'
                    }`}
                  >
                    <Text className={`font-sans-medium text-xs ${mode === m ? 'text-on-primary' : 'text-on-surface-variant'}`}>
                      {m === 'BOOKED' ? t('od_booked') : t('legend_available')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="rounded-2xl overflow-hidden border border-outline-variant/40 mb-3">
                <Calendar
                  minDate={new Date().toISOString().slice(0, 10)}
                  markedDates={markedDates}
                  markingType="multi-dot"
                  onDayPress={toggleDate}
                  theme={{
                    todayTextColor: colors.primary,
                    arrowColor: colors.primary,
                    textDayFontFamily: 'Manrope_400Regular',
                    textMonthFontFamily: 'NotoSerif_700Bold',
                    textDayHeaderFontFamily: 'Manrope_600SemiBold',
                  }}
                />
              </View>

              <View className="flex-row items-center gap-4 mb-4">
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.gold }} />
                  <Text className="font-sans text-[11px] text-on-surface-variant">{t('od_legend_selected')}</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.gold }} />
                  <Text className="font-sans text-[11px] text-on-surface-variant">{t('legend_muhurtham')}</Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.error }} />
                  <Text className="font-sans text-[11px] text-on-surface-variant">{t('legend_booked')}</Text>
                </View>
              </View>

              <Button
                title={applyLabel}
                onPress={applyChanges}
                disabled={pendingDates.size === 0}
                loading={applying}
              />

              {/* ── Bookings for this hall ── */}
              <Text className="font-serif text-base text-on-surface font-bold mt-8 mb-3">{t('od_bookings_h')}</Text>
              {bookingsQuery.isLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : orderedBookings.length === 0 ? (
                <Text className="font-sans text-xs text-on-surface-variant">{t('od_no_bookings')}</Text>
              ) : (
                orderedBookings.map((b) => (
                  <View
                    key={b.id}
                    className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-3 mb-3"
                    style={{ opacity: b.status === 'CANCELLED' ? 0.6 : 1 }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans-bold text-sm text-on-surface">{dayLabel(b.date)}</Text>
                      <Text className="font-sans-bold text-[10px] uppercase tracking-wider text-primary">
                        {tStr(
                          b.status === 'CANCELLED'
                            ? 'booking_status_cancelled'
                            : b.status === 'CONFIRMED'
                              ? 'booking_status_confirmed'
                              : 'booking_status_pending',
                        )}
                      </Text>
                    </View>
                    <Text className="font-sans text-xs text-on-surface mt-1">
                      {b.customerName} ·{' '}
                      <Text className="text-primary" onPress={() => Linking.openURL(`tel:${b.customerPhone}`)}>
                        {b.customerPhone}
                      </Text>
                    </Text>
                    <Text className="font-sans text-xs text-on-surface-variant mt-0.5">
                      {tStr(EVENT_TYPE_LABEL_KEYS[b.eventType])} · {b.guestCount} guests · ₹
                      {b.advanceAmount.toLocaleString('en-IN')} {tStr('advance_payable_label')}
                    </Text>
                    {b.status !== 'CANCELLED' && (
                      <View className="flex-row gap-4 mt-3">
                        {b.status === 'PENDING' && (
                          <Pressable disabled={busyBooking === b.id} onPress={() => bookingAction(b, 'confirm')} hitSlop={8}>
                            <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-primary">
                              {t('od_confirm_btn')}
                            </Text>
                          </Pressable>
                        )}
                        <Pressable disabled={busyBooking === b.id} onPress={() => bookingAction(b, 'cancel')} hitSlop={8}>
                          <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-error">
                            {tStr('cancel_booking_btn')}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      <HallFormModal
        visible={!!formModal}
        hall={formModal?.hall}
        onClose={() => setFormModal(null)}
        onSaved={() => {
          setFormModal(null);
          queryClient.invalidateQueries({ queryKey: ['myHalls'] });
        }}
      />
    </SafeAreaView>
  );
}

const emptyHallForm = { name: '', city: '', area: '', address: '', price: '', capacity: '', contactNumber: '', description: '' };

function HallFormModal({
  visible,
  hall,
  onClose,
  onSaved,
}: {
  visible: boolean;
  hall?: Hall;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, tStr } = useT();
  const showToast = useToast();
  const isEdit = !!hall;
  const [form, setForm] = useState(emptyHallForm);
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the modal opens — either blank (create) or
  // pre-filled with the hall being edited.
  useEffect(() => {
    if (!visible) return;
    setForm(
      hall
        ? {
            name: hall.name,
            city: hall.city,
            area: hall.area,
            address: hall.address,
            price: hall.price > 0 ? String(hall.price) : '',
            capacity: hall.capacity > 0 ? String(hall.capacity) : '',
            contactNumber: hall.contactNumber,
            description: hall.description ?? '',
          }
        : emptyHallForm,
    );
  }, [visible, hall]);

  async function submit() {
    const phone = normalizePhone(form.contactNumber);
    if (!phone) return showToast('error', tStr('invalid_phone'));
    const price = Number(form.price);
    const capacity = Number(form.capacity);
    if (!form.area.trim()) return showToast('error', `${tStr('area_label')}?`);
    if (!(price > 0)) return showToast('error', `${tStr('od_price_day')}?`);
    if (!(capacity > 0)) return showToast('error', `${tStr('od_capacity')}?`);
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        city: form.city.trim(),
        area: form.area.trim(),
        address: form.address.trim(),
        price,
        capacity,
        contactNumber: phone,
        description: form.description || undefined,
      };
      if (isEdit) {
        await api.updateHall(hall.id, body);
      } else {
        await api.createHall(body);
      }
      onSaved();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not save hall');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-outline-variant/40">
          <Text className="font-serif text-base text-on-surface font-bold">
            {isEdit ? t('od_edit_hall') : t('od_new_hall')}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerClassName="px-5 py-5" keyboardShouldPersistTaps="handled">
          <TextField label={tStr('reg_hall_name')} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
          <TextField label={tStr('od_city')} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
          <TextField label={tStr('area_label')} value={form.area} onChangeText={(v) => setForm((f) => ({ ...f, area: v }))} />
          <TextField label={tStr('od_address')} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
          <TextField
            label={tStr('od_price_day')}
            keyboardType="number-pad"
            value={form.price}
            onChangeText={(v) => setForm((f) => ({ ...f, price: v.replace(/\D/g, '') }))}
          />
          <TextField
            label={tStr('od_capacity')}
            keyboardType="number-pad"
            value={form.capacity}
            onChangeText={(v) => setForm((f) => ({ ...f, capacity: v.replace(/\D/g, '') }))}
          />
          <TextField
            label={tStr('od_contact_no')}
            keyboardType="phone-pad"
            placeholder="+91 XXXXX XXXXX"
            value={form.contactNumber}
            onChangeText={(v) => setForm((f) => ({ ...f, contactNumber: v }))}
          />
          <TextField
            label={tStr('od_description')}
            multiline
            numberOfLines={3}
            value={form.description}
            onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
          />
          {!isEdit && (
            <Text className="font-sans text-[11px] text-on-surface-variant mb-4">{t('od_review_hint')}</Text>
          )}
          <Button
            title={saving ? tStr('od_saving') : isEdit ? tStr('od_save_changes') : tStr('od_create_hall')}
            loading={saving}
            onPress={submit}
          />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
