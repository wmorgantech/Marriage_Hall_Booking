import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { colors } from '../theme/colors';

type Variant = 'solid' | 'outline' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  loading?: boolean;
  variant?: Variant;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  solid: 'bg-primary',
  outline: 'bg-transparent border border-gold/60',
  ghost: 'bg-transparent',
};

const textVariantClasses: Record<Variant, string> = {
  solid: 'text-on-primary',
  outline: 'text-primary',
  ghost: 'text-primary',
};

const variantShadow: Record<Variant, object> = {
  solid: {
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  outline: {},
  ghost: {},
};

export function Button({
  title,
  loading,
  variant = 'solid',
  disabled,
  className = '',
  ...pressableProps
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-xl py-3.5 px-6 ${variantClasses[variant]} ${
        isDisabled ? 'opacity-60' : ''
      } ${className}`}
      style={({ pressed }) => ({
        transform: [{ scale: pressed && !isDisabled ? 0.97 : 1 }],
        ...variantShadow[variant],
      })}
      {...pressableProps}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'solid' ? colors.onPrimary : colors.primary}
          style={{ marginRight: 8 }}
        />
      )}
      <Text className={`font-sans-bold text-xs uppercase tracking-wider ${textVariantClasses[variant]}`}>
        {title}
      </Text>
    </Pressable>
  );
}
