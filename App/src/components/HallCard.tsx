import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Hall } from '../api/types';
import { useT } from '../i18n';
import { colors, cardBorderColor, cardShadow } from '../theme/colors';
import { HallImage } from './HallImage';

function formatPrice(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

interface HallCardProps {
  hall: Hall;
  onPress: () => void;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  /** Green "Available on <date>" pill — only pass it when the server verified that date. */
  badge?: string;
  /** Extra rows under the location (e.g. whether a requested amenity is listed by the hall). */
  notes?: { icon: keyof typeof MaterialIcons.glyphMap; text: string }[];
}

export function HallCard({ hall, onPress, isFavorite, onFavoriteToggle, badge, notes }: HallCardProps) {
  const { t, tStr } = useT();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.98 : 1 }],
        backgroundColor: colors.surfaceContainerLowest,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: cardBorderColor,
        marginBottom: 16,
        ...cardShadow,
      })}
    >
      {/* Image with gradient overlay */}
      <View style={{ position: 'relative' }}>
        <HallImage uri={hall.imageUrl} style={{ width: '100%', height: 176 }} />

        {/* Dark scrim at image bottom, for price-badge readability */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 72,
            backgroundColor: 'rgba(0,0,0,0.38)',
          }}
          pointerEvents="none"
        />

        {/* Favorite button (shown only when prop provided) */}
        {onFavoriteToggle && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onFavoriteToggle();
            }}
            style={({ pressed }) => ({
              position: 'absolute',
              top: 10,
              right: 10,
              backgroundColor: pressed ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)',
              borderRadius: 20,
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            })}
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <MaterialIcons
              name={isFavorite ? 'favorite' : 'favorite-border'}
              size={17}
              color={isFavorite ? colors.error : colors.onPrimary}
            />
          </Pressable>
        )}

        {/* Price badge over bottom of image */}
        <View
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            backgroundColor: colors.primary,
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: undefined, fontSize: 13, fontWeight: '700', color: colors.onPrimary }}>
            {formatPrice(hall.price)}
            <Text style={{ fontSize: 9, fontWeight: '400', opacity: 0.8 }}> /day</Text>
          </Text>
        </View>
      </View>

      {/* Card body */}
      <View style={{ padding: 14 }}>
        {/* Name + location */}
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 3 }}
        >
          {hall.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.gold }} />
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: colors.onSurfaceVariant, flex: 1 }}
          >
            {hall.area ? `${hall.area}, ${hall.city}` : hall.city}
          </Text>
        </View>
        {badge ? (
          <View
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E3F4E8', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: -2, marginBottom: 10 }}
          >
            <MaterialIcons name="event-available" size={13} color="#15803d" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>{badge}</Text>
          </View>
        ) : null}
        {notes?.map((n) => (
          <View key={n.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <MaterialIcons name={n.icon} size={14} color={colors.onSurfaceVariant} />
            <Text style={{ flex: 1, fontSize: 11, color: colors.onSurfaceVariant }}>{n.text}</Text>
          </View>
        ))}

        {/* Feature chips */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
          <Chip icon="groups" label={tStr('seats', { n: hall.capacity })} />
          {hall.hasAC && <Chip icon="ac-unit" label={tStr('full_ac')} />}
          {hall.hasRooms && <Chip icon="bed" label={tStr('rooms_short')} />}
        </View>

        {/* Footer: price (left) + CTA (right) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: cardBorderColor,
          }}
        >
          <View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>
              {formatPrice(hall.price)}
            </Text>
            <Text style={{ fontSize: 10, color: colors.onSurfaceVariant }}>{t('per_day')}</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: colors.primary,
              borderRadius: 9,
              paddingHorizontal: 14,
              paddingVertical: 9,
              ...cardShadow,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.onPrimary, textTransform: 'uppercase' }}>
              Book Now
            </Text>
            <MaterialIcons name="arrow-forward" size={13} color={colors.onPrimary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function Chip({ icon, label }: { icon: keyof typeof MaterialIcons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: cardBorderColor,
      }}
    >
      <MaterialIcons name={icon} size={12} color={colors.onSurfaceVariant} />
      <Text style={{ fontSize: 10, color: colors.onSurfaceVariant, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}
