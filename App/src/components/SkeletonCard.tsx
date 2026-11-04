import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { colors, cardBorderColor } from '../theme/colors';

function SkeletonRect({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.85, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: colors.outlineVariant,
          borderRadius: 6,
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceContainerLowest,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: cardBorderColor,
        marginBottom: 16,
      }}
    >
      <SkeletonRect width="100%" height={176} style={{ borderRadius: 0 }} />
      <View style={{ padding: 14, gap: 10 }}>
        <SkeletonRect width="68%" height={16} />
        <SkeletonRect width="42%" height={12} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <SkeletonRect width={72} height={26} style={{ borderRadius: 8 }} />
          <SkeletonRect width={60} height={26} style={{ borderRadius: 8 }} />
          <SkeletonRect width={56} height={26} style={{ borderRadius: 8 }} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: cardBorderColor,
          }}
        >
          <SkeletonRect width="38%" height={18} />
          <SkeletonRect width={100} height={34} style={{ borderRadius: 8 }} />
        </View>
      </View>
    </View>
  );
}
