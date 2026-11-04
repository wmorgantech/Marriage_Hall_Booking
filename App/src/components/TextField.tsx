import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors } from '../theme/colors';

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = '', onFocus, onBlur, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="mb-4">
      {label && (
        <Text className="font-sans-semibold text-xs text-on-surface-variant mb-1.5" style={{ letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.outline}
        className={`bg-surface-container-lowest rounded-xl px-4 py-3.5 font-sans text-base text-on-surface ${className}`}
        style={{
          borderWidth: 1.5,
          borderColor: error ? colors.error : focused ? colors.primary : colors.outlineVariant,
          ...(focused && !error && {
            shadowColor: colors.primary,
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 0 },
          }),
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {hint && !error ? (
        <Text className="font-sans text-[11px] text-on-surface-variant mt-1.5">{hint}</Text>
      ) : null}
      {error ? <Text className="font-sans text-[11px] text-error mt-1.5">{error}</Text> : null}
    </View>
  );
}
