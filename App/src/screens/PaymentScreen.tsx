import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { OtpModal } from '../components/OtpModal';
import { BookingStepBar } from '../components/BookingStepBar';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { PAYMENT_METHOD_LABEL_KEYS, type PaymentMethod } from '../booking/types';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'Payment'>;

const METHOD_ICONS: Record<PaymentMethod, keyof typeof MaterialIcons.glyphMap> = {
  upi: 'qr-code-2',
  card: 'credit-card',
  netbanking: 'account-balance',
  cash: 'payments',
};

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function PaymentScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user } = useAuth();
  const { draft, patchDraft, resetDraft } = useBookingDraft();
  const [method, setMethod] = useState<PaymentMethod | undefined>(draft.paymentMethod);
  const [submitting, setSubmitting] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [error, setError] = useState('');

  const advanceAmount = Math.round((draft.pricePerDay * draft.advancePercent) / 100);
  const isCash = method === 'cash';

  async function submitBooking() {
    if (!method || !draft.date || !draft.eventType || !draft.guestCount) return;
    setSubmitting(true);
    setError('');
    patchDraft({ paymentMethod: method });

    try {
      const booking = await api.createBooking({
        hallId: draft.hallId,
        date: draft.date,
        eventType: draft.eventType,
        guestCount: draft.guestCount,
        customerName: draft.customerName,
        customerPhone: draft.customerPhone,
        specialRequests: draft.specialRequests || undefined,
        paymentMethod: method,
      });
      resetDraft();
      navigation.navigate('BookingConfirmation', { booking });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm your booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Booking must be tied to a real account. If the customer isn't signed in
  // yet, verify via OTP first (same modal HallDetailScreen uses to reveal
  // contact info) — on success, submit the booking automatically.
  function confirmBooking() {
    if (!method || !draft.date || !draft.eventType || !draft.guestCount) return;
    if (!user) {
      setOtpOpen(true);
      return;
    }
    submitBooking();
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
        <Text className="font-serif text-base text-on-surface font-bold">{t('payment_h')}</Text>
      </View>

      {/* Progress stepper */}
      <BookingStepBar current="payment" />

      <ScrollView contentContainerClassName="px-5 pb-8 pt-4">
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

        {/* Amount due card */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.primary,
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingVertical: 18,
            marginBottom: 24,
            shadowColor: colors.primary,
            shadowOpacity: 0.28,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
              {t('amount_to_pay_label')}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>
              {formatINR(advanceAmount)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              {t('total_price_label')}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>
              {formatINR(draft.pricePerDay)}
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            color: colors.onSurfaceVariant,
            letterSpacing: 0.2,
            marginBottom: 10,
          }}
        >
          {t('select_payment_method_h')}
        </Text>

        <View className="gap-2.5 mb-6">
          {(Object.keys(PAYMENT_METHOD_LABEL_KEYS) as PaymentMethod[]).map((m) => {
            const active = method === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: active ? colors.primary : colors.outlineVariant + '60',
                  backgroundColor: active ? colors.primary + '0d' : colors.surfaceContainerLowest,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? colors.primary : colors.surfaceContainerHigh,
                  }}
                >
                  <MaterialIcons
                    name={METHOD_ICONS[m]}
                    size={18}
                    color={active ? '#fff' : colors.primary}
                  />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: '600',
                    color: active ? colors.primary : colors.onSurface,
                  }}
                >
                  {tStr(PAYMENT_METHOD_LABEL_KEYS[m])}
                </Text>
                {active && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
              </Pressable>
            );
          })}
        </View>

        {isCash && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              backgroundColor: colors.secondaryContainer + '4d',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 8,
            }}
          >
            <MaterialIcons name="info-outline" size={16} color={colors.onSecondaryContainer} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: colors.onSecondaryContainer }}>
              {t('cash_payment_note')}
            </Text>
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            backgroundColor: colors.secondaryContainer + '30',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 24,
          }}
        >
          <MaterialIcons name="info-outline" size={16} color={colors.onSecondaryContainer} />
          <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: colors.onSecondaryContainer }}>
            {t('booking_pending_notice')}
          </Text>
        </View>

        <Button
          title={tStr('confirm_booking_btn')}
          onPress={confirmBooking}
          disabled={!method}
          loading={submitting}
        />
      </ScrollView>

      <OtpModal
        visible={otpOpen}
        onClose={() => setOtpOpen(false)}
        onVerified={() => {
          setOtpOpen(false);
          submitBooking();
        }}
      />
    </SafeAreaView>
  );
}
