import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

// No backend featured-banner system exists (no field/endpoint for curated
// hero content), so this is a clean branded panel rather than stock/demo
// photography of halls that don't exist. Same props/call site as before.
const HEIGHT = 140;

export function HeroSlider({ title, subtitle }: { title: React.ReactNode; subtitle: React.ReactNode }) {
  return (
    <View
      className="mx-4 rounded-2xl overflow-hidden mb-5"
      style={{ height: HEIGHT, backgroundColor: colors.primary }}
    >
      {/* Subtle decorative mark — brand icon, not a photo */}
      <MaterialIcons
        name="celebration"
        size={128}
        color="rgba(255,255,255,0.08)"
        style={{ position: 'absolute', right: -20, bottom: -24 }}
      />
      <View
        className="absolute left-0 right-0 bottom-0"
        style={{ height: 3, backgroundColor: colors.gold }}
      />
      <View className="flex-1 justify-center px-5">
        <Text className="font-serif text-h3 text-white font-bold mb-1.5">{title}</Text>
        <Text className="font-sans text-xs text-white/90">{subtitle}</Text>
      </View>
    </View>
  );
}
