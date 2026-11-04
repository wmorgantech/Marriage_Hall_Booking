import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import type { AccountStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AccountStackParamList, 'OwnerRegister'>;
type FormValues = {
  hallName: string;
  name: string;
  phoneDigits: string;
  email: string;
  password: string;
};

export default function OwnerRegisterScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: { hallName: '', name: '', phoneDigits: '', email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    if (values.hallName.trim().length < 2) return setError('Hall name is too short');
    if (values.name.trim().length < 2) return setError('Owner name is too short');
    if (values.phoneDigits.length !== 10) return setError('Enter a valid 10-digit mobile number');
    if (values.password.length < 6) return setError('Password must be at least 6 characters');

    setError('');
    setLoading(true);
    try {
      const res = await api.register({
        hallName: values.hallName.trim(),
        name: values.name.trim(),
        phone: `+91${values.phoneDigits}`,
        email: values.email.trim() || undefined,
        password: values.password,
      });
      await login(res.token, res.user);
      navigation.reset({ index: 0, routes: [{ name: 'OwnerDashboard' }] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerClassName="px-5 py-8" keyboardShouldPersistTaps="handled">
        <Text className="font-serif text-h3 text-on-surface font-bold">{t('reg_title')}</Text>
        <Text className="font-sans text-sm text-on-surface-variant mt-1 mb-6">{t('reg_subtitle')}</Text>

        {error ? (
          <View className="flex-row items-center gap-2 bg-error-container rounded-xl px-4 py-3 mb-4">
            <MaterialIcons name="error-outline" size={16} color={colors.onErrorContainer} />
            <Text className="font-sans text-xs text-on-error-container flex-1">{error}</Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="hallName"
          render={({ field }) => (
            <TextField
              label={tStr('reg_hall_name')}
              hint={tStr('reg_hall_hint')}
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextField label={tStr('reg_owner_name')} value={field.value} onChangeText={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name="phoneDigits"
          render={({ field }) => (
            <TextField
              label={tStr('phone_number_label')}
              hint={tStr('reg_share_hint')}
              keyboardType="number-pad"
              maxLength={10}
              value={field.value}
              onChangeText={(v) => field.onChange(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="XXXXX XXXXX"
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextField
              label={`${tStr('email_label')} ${tStr('optional')}`}
              keyboardType="email-address"
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              label={tStr('password_label')}
              hint={tStr('pwd_min')}
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />

        <Button
          title={loading ? tStr('creating_account') : tStr('create_account_btn')}
          loading={loading}
          onPress={handleSubmit(onSubmit)}
          className="mt-2"
        />

        <View className="flex-row items-center justify-center gap-1.5 mt-6">
          <Text className="font-sans text-sm text-on-surface-variant">{t('already_account')}</Text>
          <Pressable onPress={() => navigation.navigate('OwnerLogin')} hitSlop={10}>
            <Text className="font-sans-bold text-sm text-primary">{t('sign_in_link')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
