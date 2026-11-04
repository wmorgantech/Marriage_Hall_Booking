import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, type DateData } from 'react-native-calendars';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { MUHURTHAM_DATES } from '../data/muhurthamDates';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, cardBorderColor, whatsappGreen } from '../theme/colors';
import { Button } from '../components/Button';
import { HallImage } from '../components/HallImage';
import { OtpModal } from '../components/OtpModal';
import { useToast } from '../components/Toast';
import { addFavorite, getFavorites, removeFavorite } from '../favorites/localFavorites';
import type { ExploreStackParamList } from '../navigation/types';

const AMENITY_ICON_MAP: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  parking: 'local-parking',
  wifi: 'wifi',
  generator: 'bolt',
  power: 'bolt',
  catering: 'restaurant',
  kitchen: 'kitchen',
  decor: 'celebration',
  music: 'music-note',
  garden: 'park',
  lawn: 'park',
  lift: 'elevator',
  elevator: 'elevator',
  security: 'security',
  cctv: 'security',
};

function amenityIcon(label: string): keyof typeof MaterialIcons.glyphMap {
  const lower = label.toLowerCase();
  for (const key of Object.keys(AMENITY_ICON_MAP)) {
    if (lower.includes(key)) return AMENITY_ICON_MAP[key];
  }
  return 'check-circle';
}

type Props = NativeStackScreenProps<ExploreStackParamList, 'HallDetail'>;

export default function HallDetailScreen({ route, navigation }: Props) {
  const { hallId } = route.params;
  const { t, tStr } = useT();
  const { user } = useAuth();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // The API only includes the contact number for signed-in users, so the hall refetches on
  // sign-in/out (previous data stays visible meanwhile, so the screen doesn't flash a spinner).
  const hallQuery = useQuery({
    queryKey: ['hall', hallId, user?.id ?? null],
    queryFn: () => api.getHall(hallId),
    placeholderData: (prev) => prev,
  });
  const favoritesQuery = useQuery({ queryKey: ['favorites'], queryFn: getFavorites });
  const isFavorite = (favoritesQuery.data ?? []).some((f) => f.id === hallId);
  const availQuery = useQuery({
    queryKey: ['availability', hallId],
    queryFn: () => api.getAvailability(hallId),
  });
  const similarQuery = useQuery({
    queryKey: ['similarHalls', hallQuery.data?.city],
    queryFn: () => api.searchHalls({ city: hallQuery.data!.city, limit: 7 }),
    enabled: !!hallQuery.data?.city,
  });

  const { width: screenWidth } = useWindowDimensions();
  const hall = hallQuery.data;
  const isVerified = !!user && !!hall?.contactNumber;

  // Only real photos: the hall's gallery, or its single cover image.
  const images = useMemo(() => {
    if (!hall) return [];
    if (hall.imageUrls?.length) return hall.imageUrls;
    return hall.imageUrl ? [hall.imageUrl] : [];
  }, [hall?.imageUrl, hall?.imageUrls]);

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

  if (hallQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <MaterialIcons name="cloud-off" size={40} color={colors.error} />
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

  const similarHalls = (similarQuery.data?.halls ?? []).filter((h) => h.id !== hall.id).slice(0, 6);

  function openCall() {
    Linking.openURL(`tel:${hall!.contactNumber}`);
  }

  function openWhatsApp() {
    const msg = `Hi, I saw your hall '${hall!.name}' on CheckNBook. Is it available on ${
      selectedDate ?? 'my wedding date'
    }?`;
    Linking.openURL(`https://wa.me/${hall!.contactNumber.replace('+', '')}?text=${encodeURIComponent(msg)}`);
  }

  function openDirections() {
    const query =
      hall!.latitude != null && hall!.longitude != null
        ? `${hall!.latitude},${hall!.longitude}`
        : encodeURIComponent(`${hall!.address}, ${hall!.city}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  async function copyContactNumber() {
    await Clipboard.setStringAsync(hall!.contactNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function toggleFavorite() {
    const next = isFavorite ? await removeFavorite(hall!.id) : await addFavorite(hall!);
    queryClient.setQueryData(['favorites'], next);
    showToast('success', isFavorite ? tStr('removed_from_favorites') : tStr('added_to_favorites'));
  }

  function handleGalleryScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setGalleryIndex(idx);
  }

  const advancePercent = hall.advancePercent ?? 50;
  const advanceAmount = Math.round((hall.price * advancePercent) / 100);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {/* ── Gallery ── */}
        <View>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(uri, i) => `${uri}-${i}`}
              onMomentumScrollEnd={handleGalleryScroll}
              renderItem={({ item }) => <HallImage uri={item} style={{ width: screenWidth, height: 280 }} />}
            />
          ) : (
            <HallImage uri={null} style={{ width: screenWidth, height: 280 }} />
          )}

          {/* Back button */}
          <Pressable
            onPress={() => navigation.goBack()}
            className="absolute top-4 left-4 bg-black/45 rounded-full p-2.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <MaterialIcons name="arrow-back" size={20} color="#fff" />
          </Pressable>

          {/* Favorite button */}
          <Pressable
            onPress={toggleFavorite}
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            accessibilityRole="button"
            className="absolute top-4 right-4 bg-black/45 rounded-full p-2.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={20}
              color={isFavorite ? colors.error : '#fff'}
            />
          </Pressable>

          {/* Gallery dot indicators */}
          {images.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 12,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
              pointerEvents="none"
            >
              {images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === galleryIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === galleryIndex ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Content ── */}
        <View className="px-4 pt-4">
          <Text className="font-serif text-h2 text-on-surface font-bold">{hall.name}</Text>
          <View className="flex-row items-center gap-1 mt-1 mb-3">
            <MaterialIcons name="place" size={14} color={colors.gold} />
            <Text className="font-sans text-sm text-on-surface-variant">
              {hall.area ? `${hall.area}, ${hall.city}` : hall.city}
            </Text>
          </View>

          {hall.description && (
            <Text className="font-sans text-sm text-on-surface-variant mt-1 mb-4 leading-relaxed">
              {hall.description}
            </Text>
          )}

          {/* ── Elite Facilities (3-col grid) ── */}
          <Text className="font-serif text-base text-on-surface font-bold mt-2 mb-3">
            {t('elite_facilities_h')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <FacilityTile icon="groups" label="Capacity" value={hall.capacity.toLocaleString('en-IN') + ' guests'} />
            <FacilityTile
              icon="ac-unit"
              label="Climate"
              value={hall.hasAC ? tStr('central_ac_value') : tStr('non_ac')}
            />
            <FacilityTile
              icon="bed"
              label="Rooms"
              value={hall.hasRooms ? tStr('guest_rooms') : tStr('no_rooms')}
            />
          </View>

          {/* ── Amenities ── */}
          {hall.amenities && hall.amenities.length > 0 && (
            <>
              <Text className="font-serif text-base text-on-surface font-bold mt-5 mb-2">
                {t('amenities_h')}
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {hall.amenities.map((a) => (
                  <AmenityChip key={a} icon={amenityIcon(a)} label={a} />
                ))}
              </View>
            </>
          )}

          {/* ── Availability Calendar ── */}
          <Text className="font-serif text-base text-on-surface font-bold mt-6 mb-2">
            {t('check_avail_h')}
          </Text>
          <View className="rounded-2xl overflow-hidden border border-outline-variant/40">
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
          <View className="flex-row items-center gap-4 mt-3 mb-2">
            <LegendDot color={colors.primary} label={tStr('legend_available')} />
            <LegendDot color={colors.error} label={tStr('legend_booked')} />
            <LegendDot color={colors.gold} label={tStr('legend_muhurtham')} />
          </View>
          {selectedDate ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surfaceContainer,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginTop: 6,
                marginBottom: 4,
              }}
            >
              <MaterialIcons name="event" size={14} color={colors.primary} />
              <Text className="font-sans-semibold text-xs text-primary">
                {tStr('selected_date')} {selectedDate}
              </Text>
            </View>
          ) : (
            <Text className="font-sans text-xs text-on-surface-variant mt-2">
              {tStr('select_a_date')}
            </Text>
          )}

          {/* ── Contact ── */}
          <View className="flex-row items-center justify-between mt-6 mb-2">
            <Text className="font-serif text-base text-on-surface font-bold">
              {t('office_contact')}
            </Text>
            {isVerified && (
              <View className="flex-row items-center gap-1">
                <MaterialIcons name="verified" size={14} color={colors.primary} />
                <Text className="font-sans-bold text-[11px] text-primary">{t('verified')}</Text>
              </View>
            )}
          </View>

          {isVerified ? (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.surfaceContainer,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  marginBottom: 12,
                }}
              >
                <Text className="font-serif text-base text-on-surface font-bold tracking-wide">
                  {hall.contactNumber}
                </Text>
                <Pressable
                  onPress={copyContactNumber}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 5 })}
                >
                  <MaterialIcons name={copied ? 'check' : 'content-copy'} size={14} color={colors.primary} />
                  <Text className="font-sans-bold text-[11px] uppercase tracking-wider text-primary">
                    {copied ? t('copied') : t('copy_number')}
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={openCall}
                  style={({ pressed }) => ({
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    paddingVertical: 14,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <MaterialIcons name="call" size={16} color={colors.onPrimary} />
                  <Text className="font-sans-bold text-xs uppercase tracking-wider text-on-primary">
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
                    gap: 8,
                    backgroundColor: whatsappGreen,
                    borderRadius: 12,
                    paddingVertical: 14,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <MaterialIcons name="chat" size={16} color="#fff" />
                  <Text style={{ fontWeight: '700', fontSize: 11, letterSpacing: 0.8, color: '#fff', textTransform: 'uppercase' }}>
                    {t('whatsapp')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.surfaceContainer,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, color: colors.onSurfaceVariant, textTransform: 'uppercase', marginBottom: 4 }}>
                  {t('office_contact')}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface, letterSpacing: 3, opacity: 0.25 }}>
                  {'•••••  ••••••••••'}
                </Text>
              </View>
              <Pressable
                onPress={() => setOtpOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <MaterialIcons name="lock" size={13} color="#fff" />
                <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#fff', textTransform: 'uppercase' }}>
                  {t('verify_to_view')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── Location / Map ── */}
          <Text className="font-serif text-base text-on-surface font-bold mt-6 mb-2">
            {t('location_office')}
          </Text>
          <View
            className="rounded-2xl overflow-hidden border border-outline-variant/40 mb-3"
            style={{ height: 180 }}
          >
            {Platform.OS === 'web' ? (
              <iframe
                src={`https://www.google.com/maps?q=${encodeURIComponent(`${hall.address}, ${hall.city}`)}&output=embed`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                loading="lazy"
              />
            ) : (
              <WebView
                source={{
                  uri: `https://www.google.com/maps?q=${encodeURIComponent(`${hall.address}, ${hall.city}`)}&output=embed`,
                }}
                style={{ flex: 1 }}
              />
            )}
          </View>
          <Text className="font-sans text-sm text-on-surface-variant mb-3">{hall.address}</Text>
          <Pressable
            onPress={openDirections}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: colors.gold + '80',
              borderRadius: 12,
              paddingVertical: 12,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <MaterialIcons name="directions" size={16} color={colors.primary} />
            <Text className="font-sans-bold text-xs uppercase tracking-wider text-primary">
              {t('get_directions')}
            </Text>
          </Pressable>

          {/* ── Similar Halls ── */}
          {similarHalls.length > 0 && (
            <>
              <Text className="font-serif text-base text-on-surface font-bold mt-8 mb-3">
                {t('similar_halls_h')}
              </Text>
              <FlatList
                data={similarHalls}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(h) => h.id}
                contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => navigation.push('HallDetail', { hallId: item.id })}
                    style={({ pressed }) => ({
                      width: 188,
                      backgroundColor: colors.surfaceContainerLowest,
                      borderRadius: 16,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: colors.outlineVariant + '40',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <HallImage uri={item.imageUrl} style={{ width: 188, height: 104 }} />
                    <View style={{ padding: 10 }}>
                      <Text
                        style={{ fontWeight: '700', fontSize: 12, color: colors.onSurface, marginBottom: 2 }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{ fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 6 }}
                        numberOfLines={1}
                      >
                        {item.area ? `${item.area}, ${item.city}` : item.city}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                        ₹{item.price.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            </>
          )}

          {/* ── Policies (only rendered when the hall has real content) ── */}
          {(hall.cancellationPolicy || hall.houseRules) && (
            <View className="gap-3 mt-8 mb-6">
              {hall.cancellationPolicy ? (
                <View
                  style={{
                    backgroundColor: colors.surfaceContainerLowest,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: cardBorderColor,
                    padding: 16,
                  }}
                >
                  <Text className="font-serif text-base text-on-surface font-bold mb-2">
                    {t('cancellation_policy_h')}
                  </Text>
                  <Text className="font-sans text-xs text-on-surface-variant leading-relaxed">
                    {hall.cancellationPolicy}
                  </Text>
                </View>
              ) : null}
              {hall.houseRules ? (
                <View
                  style={{
                    backgroundColor: colors.surfaceContainerLowest,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: cardBorderColor,
                    padding: 16,
                  }}
                >
                  <Text className="font-serif text-base text-on-surface font-bold mb-2">
                    {t('house_rules_h')}
                  </Text>
                  <Text className="font-sans text-xs text-on-surface-variant leading-relaxed">
                    {hall.houseRules}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky Bottom Booking Bar ── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 1,
          borderTopColor: colors.outlineVariant + '40',
          backgroundColor: colors.background,
          shadowColor: colors.primary,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
          elevation: 8,
        }}
      >
        <View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>
            ₹{hall.price.toLocaleString('en-IN')}
          </Text>
          <Text style={{ fontSize: 10, color: colors.onSurfaceVariant, marginTop: 1 }}>
            {advancePercent}% advance · ₹{advanceAmount.toLocaleString('en-IN')}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('CheckAvailability', { hallId: hall.id })}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingHorizontal: 20,
            paddingVertical: 13,
            shadowColor: colors.primary,
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <MaterialIcons name="event-available" size={16} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: '#fff', textTransform: 'uppercase' }}>
            {t('book_now')}
          </Text>
        </Pressable>
      </View>

      <OtpModal
        visible={otpOpen}
        onClose={() => setOtpOpen(false)}
        onVerified={() => setOtpOpen(false)}
      />
    </SafeAreaView>
  );
}

function FacilityTile({ icon, label, value }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: '30%',
        backgroundColor: colors.surfaceContainer,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.outlineVariant + '40',
        padding: 10,
        alignItems: 'center',
      }}
    >
      <MaterialIcons name={icon} size={20} color={colors.primary} style={{ marginBottom: 5 }} />
      <Text style={{ fontSize: 9, color: colors.onSurfaceVariant, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onSurface, textAlign: 'center' }}>
        {value}
      </Text>
    </View>
  );
}

function AmenityChip({ icon, label }: { icon: keyof typeof MaterialIcons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.outlineVariant + '40',
      }}
    >
      <MaterialIcons name={icon} size={13} color={colors.onSurfaceVariant} />
      <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>{label}</Text>
    </View>
  );
}
