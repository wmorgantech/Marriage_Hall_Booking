import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export type BookingStep = 'date' | 'details' | 'summary' | 'payment';

const STEPS: { key: BookingStep; label: string }[] = [
  { key: 'date',    label: 'Date' },
  { key: 'details', label: 'Details' },
  { key: 'summary', label: 'Summary' },
  { key: 'payment', label: 'Payment' },
];

export function BookingStepBar({ current }: { current: BookingStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surfaceContainerLow,
        borderBottomWidth: 1,
        borderBottomColor: colors.outlineVariant + '40',
      }}
    >
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;

        return (
          <View key={step.key} style={{ flex: 1, alignItems: 'center', position: 'relative' }}>
            {/* Connector line between steps */}
            {i < STEPS.length - 1 && (
              <View
                style={{
                  position: 'absolute',
                  top: 10,
                  left: '50%',
                  width: '100%',
                  height: 1.5,
                  backgroundColor: done ? colors.primary : colors.outlineVariant,
                  zIndex: 0,
                }}
              />
            )}

            {/* Step dot */}
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: done || active ? colors.primary : 'transparent',
                borderWidth: done || active ? 0 : 1.5,
                borderColor: active ? colors.primary : colors.outlineVariant,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              {done ? (
                <MaterialIcons name="check" size={13} color="#fff" />
              ) : active ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
              ) : (
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.outline }}>{i + 1}</Text>
              )}
            </View>

            {/* Label */}
            <Text
              style={{
                fontSize: 9,
                fontWeight: active || done ? '700' : '400',
                color: active || done ? colors.primary : colors.outline,
                marginTop: 4,
                letterSpacing: 0.2,
              }}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
