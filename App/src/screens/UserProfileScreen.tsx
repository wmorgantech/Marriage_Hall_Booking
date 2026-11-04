import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors, cardBorderColor } from '../theme/colors';
import { Button } from '../components/Button';
import { getFavorites } from '../favorites/localFavorites';
import type { AccountStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AccountStackParamList, 'UserProfile'>;

function initials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export default function UserProfileScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user, logout } = useAuth();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: !!user, retry: false });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  const [bookingCount, setBookingCount] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    if (user) api.getMyBookings().then((b) => setBookingCount(b.length)).catch(() => setBookingCount(0));
    else setBookingCount(0);
    getFavorites().then((f) => setSavedCount(f.length));
  }, [user]);

  async function handleLogout() {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'OwnerLogin' }] });
  }

  if (meQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <Text className="font-serif text-base text-on-surface font-bold text-center mb-4">
          Your session has expired
        </Text>
        <Button title="Sign in again" onPress={handleLogout} />
      </SafeAreaView>
    );
  }

  const profile = meQuery.data ?? user;

  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  // `user` (from AuthContext) is a trimmed SessionUser with no email/createdAt;
  // those only ever come from the full `/api/auth/me` fetch.
  const email = meQuery.data?.email;
  const memberSince = meQuery.data?.createdAt
    ? new Date(meQuery.data.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-5 py-6">
        <Text className="font-serif text-h3 text-on-surface font-bold mb-6">{t('profile_h')}</Text>

        {/* Avatar with gold ring */}
        <View className="items-center mb-6">
          <View
            style={{
              borderWidth: 2,
              borderColor: colors.gold,
              borderRadius: 44,
              padding: 3,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{ fontWeight: '700', fontSize: 26, color: colors.onPrimary }}
              >
                {initials(profile.name)}
              </Text>
            </View>
          </View>
          <Text className="font-serif text-h3 text-on-surface font-bold" numberOfLines={1}>
            {profile.name}
          </Text>
          <View className="bg-secondary-container/60 px-3 py-1 rounded-full mt-2">
            <Text className="font-sans-bold text-[10px] uppercase tracking-wider text-on-secondary-container">
              {profile.role === 'OWNER' ? tStr('owner_account') : tStr('guest_account')}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard
            icon="event-available"
            label={tStr('my_bookings_h')}
            count={bookingCount}
          />
          <StatCard
            icon="favorite"
            label={tStr('favorites_h')}
            count={savedCount}
          />
        </View>

        <View className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 mb-6">
          <ProfileRow icon="call" label={tStr('phone_number_label')} value={profile.phone} />
          {email ? <ProfileRow icon="email" label={tStr('email_label')} value={email} /> : null}
          {memberSince ? <ProfileRow icon="event" label={tStr('member_since')} value={memberSince} last /> : null}
        </View>

        {settingsQuery.data &&
        (settingsQuery.data.customerCarePhone || settingsQuery.data.customerCareEmail) ? (
          <>
            <Text className="font-serif text-base text-on-surface font-bold mb-2">
              {t('customer_care_h')}
            </Text>
            <View className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 mb-6">
              {settingsQuery.data.customerCarePhone ? (
                <ProfileRow
                  icon="call"
                  label={tStr('phone_number_label')}
                  value={settingsQuery.data.customerCarePhone}
                  onPress={() => Linking.openURL(`tel:${settingsQuery.data!.customerCarePhone}`)}
                  last={!settingsQuery.data.customerCareEmail}
                />
              ) : null}
              {settingsQuery.data.customerCareEmail ? (
                <ProfileRow
                  icon="email"
                  label={tStr('email_label')}
                  value={settingsQuery.data.customerCareEmail}
                  onPress={() =>
                    Linking.openURL(`mailto:${settingsQuery.data!.customerCareEmail}`)
                  }
                  last
                />
              ) : null}
            </View>
          </>
        ) : null}

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: colors.error + '80',
            borderRadius: 12,
            paddingVertical: 14,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <MaterialIcons name="logout" size={16} color={colors.error} />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: colors.error,
            }}
          >
            {t('log_out')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  count,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  count: number | null;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        backgroundColor: colors.surfaceContainerLowest,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: cardBorderColor,
        paddingVertical: 14,
        paddingHorizontal: 8,
        gap: 6,
      }}
    >
      <MaterialIcons name={icon} size={22} color={colors.primary} />
      <Text
        style={{
          fontSize: 22,
          fontWeight: '700',
          color: colors.onSurface,
          fontVariant: ['tabular-nums'],
        }}
      >
        {count ?? '—'}
      </Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: '600',
          color: colors.onSurfaceVariant,
          textAlign: 'center',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  last,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-4 ${last ? '' : 'border-b border-outline-variant/30'} ${
        onPress ? 'active:bg-surface-container' : ''
      }`}
    >
      <View className="w-9 h-9 rounded-full bg-surface-container items-center justify-center">
        <MaterialIcons name={icon} size={16} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="font-sans text-[10px] uppercase tracking-wider text-on-surface-variant">
          {label}
        </Text>
        <Text className="font-sans-semibold text-sm text-on-surface mt-0.5">{value}</Text>
      </View>
      {onPress ? <MaterialIcons name="chevron-right" size={18} color={colors.outline} /> : null}
    </Wrapper>
  );
}
