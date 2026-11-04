import { useEffect, useRef } from 'react';
import { Animated, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useT } from '../i18n';
import { colors, whatsappGreen } from '../theme/colors';
import { Button } from '../components/Button';
import { EVENT_TYPE_LABEL_KEYS } from '../booking/types';
import type { ExploreStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ExploreStackParamList, 'BookingConfirmation'>;

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function BookingConfirmationScreen({ route, navigation }: Props) {
  const { booking } = route.params;
  const { t, tStr } = useT();

  // Animations
  const circleScale = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowSize = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Orchestrated entry sequence
    Animated.sequence([
      // 1. Circle pops in
      Animated.spring(circleScale, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      // 2. Checkmark appears inside
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 5,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow pulse (runs in parallel, loops)
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowOpacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
            Animated.timing(glowOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          ])
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowSize, { toValue: 1.45, duration: 900, useNativeDriver: true }),
            Animated.timing(glowSize, { toValue: 1, duration: 900, useNativeDriver: true }),
          ])
        ),
      ]),
    ]).start();

    // Fade in card content
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [circleScale, checkScale, glowOpacity, glowSize, contentOpacity]);

  function openCall() {
    if (booking.hall?.contactNumber) Linking.openURL(`tel:${booking.hall.contactNumber}`);
  }

  function openWhatsApp() {
    if (!booking.hall?.contactNumber) return;
    const msg = `Hi, I just submitted a booking request (Ref ${booking.id}) for '${booking.hall.name}' on ${booking.date} via CheckNBook. Could you please confirm?`;
    Linking.openURL(`https://wa.me/${booking.hall.contactNumber.replace('+', '')}?text=${encodeURIComponent(msg)}`);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-5 py-8 items-center">

        {/* ── Success animation ── */}
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {/* Pulsing glow ring */}
          <Animated.View
            style={{
              position: 'absolute',
              width: 90,
              height: 90,
              borderRadius: 45,
              backgroundColor: colors.primary,
              opacity: glowOpacity,
              transform: [{ scale: glowSize }],
            }}
            pointerEvents="none"
          />
          {/* Circle */}
          <Animated.View style={{ transform: [{ scale: circleScale }] }}>
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.primary,
                shadowOpacity: 0.3,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              {/* Checkmark with own spring */}
              <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                <MaterialIcons name="check" size={42} color="#fff" />
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        {/* ── Title ── */}
        <Animated.View style={{ opacity: contentOpacity, alignItems: 'center', width: '100%' }}>
          <Text
            style={{
              fontFamily: 'NotoSerif_700Bold',
              fontSize: 22,
              fontWeight: '700',
              color: colors.onSurface,
              textAlign: 'center',
              marginBottom: 6,
            }}
          >
            {t('booking_confirmed_h')}
          </Text>
          <Text className="font-sans text-sm text-on-surface-variant text-center mb-6">
            {booking.hall?.name} · {formatDate(booking.date)}
          </Text>

          {/* ── Booking ID card ── */}
          <View
            style={{
              width: '100%',
              backgroundColor: colors.surfaceContainer,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 16,
              alignItems: 'center',
              marginBottom: 20,
              borderWidth: 1,
              borderColor: colors.gold + '40',
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: '700',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: colors.onSurfaceVariant,
                marginBottom: 6,
              }}
            >
              {t('booking_id_label')}
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: colors.primary,
                letterSpacing: 1,
                fontVariant: ['tabular-nums'],
              }}
            >
              {booking.id}
            </Text>
          </View>

          {/* ── Summary rows ── */}
          <View
            style={{
              backgroundColor: colors.surfaceContainerLowest,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.outlineVariant + '40',
              width: '100%',
              marginBottom: 24,
            }}
          >
            <SummaryLine label={tStr('booking_event_type_h')} value={tStr(EVENT_TYPE_LABEL_KEYS[booking.eventType])} />
            <SummaryLine label={tStr('guest_count_label')} value={`${booking.guestCount} guests`} />
            <SummaryLine label={tStr('advance_payable_label')} value={formatINR(booking.advanceAmount)} last />
          </View>

          {/* ── Contact the venue ── */}
          <View style={{ width: '100%', marginBottom: 24 }}>
            <Text className="font-serif text-base text-on-surface font-bold mb-2">
              {t('confirm_with_venue_h')}
            </Text>
            <Text className="font-sans text-xs text-on-surface-variant mb-3 leading-relaxed">
              {t('booking_pending_notice')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={openCall}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  paddingVertical: 14,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <MaterialIcons name="call" size={16} color="#fff" />
                <Text style={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' }}>
                  {t('call')}
                </Text>
              </Pressable>
              <Pressable
                onPress={openWhatsApp}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  backgroundColor: whatsappGreen,
                  borderRadius: 12,
                  paddingVertical: 14,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <MaterialIcons name="chat" size={16} color="#fff" />
                <Text style={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' }}>
                  {t('whatsapp')}
                </Text>
              </Pressable>
            </View>
          </View>

          <Button
            title={tStr('view_hall_btn')}
            variant="outline"
            onPress={() => navigation.replace('HallDetail', { hallId: booking.hallId })}
            className="w-full mb-3"
          />
          <Pressable
            onPress={() => navigation.popToTop()}
            style={({ pressed }) => ({ paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="font-sans-bold text-xs uppercase tracking-wider text-primary">
              {t('done_btn')}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.outlineVariant + '30',
      }}
    >
      <Text className="font-sans text-sm text-on-surface-variant">{label}</Text>
      <Text className="font-sans-semibold text-sm text-on-surface">{value}</Text>
    </View>
  );
}
