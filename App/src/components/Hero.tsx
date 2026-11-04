import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme/colors';

// The two South Indian Kalyana Mandapam photographs (web-optimised JPEG copies of the originals in the website's
// frontend/src/assets: madapam2.png for phones, madapam1.png for wide screens).
const HERO_PHONE = require('../../assets/hero/hero-mobile.jpg');
const HERO_WIDE = require('../../assets/hero/hero-desktop.jpg');

/** Dependency-free vertical gradient: stacked translucent bands, deep green at the top fading to clear. */
function Scrim({ fraction = 0.78, from = 0.92, steps = 16 }: { fraction?: number; from?: number; steps?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${fraction * 100}%` }}>
      {Array.from({ length: steps }, (_, i) => (
        <View
          key={i}
          style={{ flex: 1, backgroundColor: `rgba(3,42,28,${(from * Math.pow(1 - i / (steps - 1), 1.6)).toFixed(3)})` }}
        />
      ))}
    </View>
  );
}

type Props = {
  topBar: ReactNode;
  eyebrow: ReactNode;
  title: ReactNode;
  tagline: ReactNode;
  subtitle: ReactNode;
};

/**
 * Full-bleed mandapam hero. The headline sits on a deep-green scrim at the top for contrast; the lower part of the
 * photograph stays clear (the search card overlaps its bottom edge). Falls back to a plain branded green panel if the
 * photo cannot be decoded.
 */
export function Hero({ topBar, eyebrow, title, tagline, subtitle }: Props) {
  const { width } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const wide = width >= 768;

  return (
    <View style={{ minHeight: wide ? 520 : 470, backgroundColor: colors.primaryContainer, overflow: 'hidden' }}>
      {!failed && (
        <Image
          source={wide ? HERO_WIDE : HERO_PHONE}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={wide ? { top: '55%', left: '68%' } : { top: '45%', left: '50%' }}
          transition={150}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
      <Scrim />
      <View className="px-5 pt-3 pb-28" style={wide ? { maxWidth: 560 } : undefined}>
        {topBar}
        <Text className="font-sans-bold text-[10.5px] uppercase tracking-[2px] mt-5" style={{ color: '#F1DDA8' }}>
          {eyebrow}
        </Text>
        <Text
          className="font-serif text-white mt-2"
          style={{ fontSize: 32, lineHeight: 38, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } }}
        >
          {title}
        </Text>
        <Text className="font-serif-regular mt-1.5" style={{ fontSize: 18, lineHeight: 24, color: '#F1DDA8' }}>
          {tagline}
        </Text>
        <Text className="font-sans text-[13px] leading-5 text-white/90 mt-3">{subtitle}</Text>
      </View>
    </View>
  );
}
