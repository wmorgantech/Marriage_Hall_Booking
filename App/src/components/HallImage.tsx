import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { View, type DimensionValue } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// The demo catalogue reuses stock photos and several are not marriage-hall photos (handshake, toast, couple
// portraits, ring close-ups, signage) plus one dead link. They are never shown as a hall cover — the branded tile
// is shown instead (same list as the website's frontend/src/lib/hallPhotos.ts). Hall records are not changed.
const UNSUITABLE_PHOTOS = [
  'photo-1521791136064-7986c2920216', 'photo-1519671482749-fd09be7ccebf', 'photo-1519741497674-611481863552',
  'photo-1465495976277-4387d4b0b4c6', 'photo-1509610973147-232dfea52a97', 'photo-1520854221256-17451cc331bf',
  'photo-1507504031003-b417219a0fde', 'photo-1503002032858-29dc0155f38f',
];
const isVenuePhoto = (u?: string | null): u is string =>
  !!u && !UNSUITABLE_PHOTOS.includes(u.split('?')[0].split('/').pop() ?? '');

type Props = {
  uri?: string | null;
  style: { width: DimensionValue; height: DimensionValue; borderRadius?: number };
};

/**
 * A hall photo, or a neutral branded tile when the hall has no photo OR the URL fails to load —
 * never a stock image standing in for a venue, and never a blank box for a dead link.
 */
export function HallImage({ uri, style }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  if (isVenuePhoto(uri) && !failed) {
    return <Image source={{ uri }} style={style} contentFit="cover" onError={() => setFailed(true)} />;
  }
  const size = typeof style.height === 'number' ? Math.min(40, Math.round(style.height * 0.45)) : 36;
  return (
    <View
      style={{ ...style, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel="No photo available"
    >
      <MaterialIcons name="celebration" size={size} color={colors.gold} />
    </View>
  );
}
