import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, normalizePhone } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import type { AccountStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AccountStackParamList, 'OwnerLogin'>;
type FormValues = { phone: string; password: string };

export default function OwnerLoginScreen({ navigation }: Props) {
  const { t, tStr } = useT();
  const { user, login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { control, handleSubmit } = useForm<FormValues>({ defaultValues: { phone: '', password: '' } });

  // Covers OTP login happening on a different tab (HallDetailScreen) while
  // this screen sits mounted in the background as the AccountStack's current
  // route — redirect when this tab is revisited and we're stale.
  useFocusEffect(
    useCallback(() => {
      if (user?.role === 'USER') {
        navigation.reset({ index: 0, routes: [{ name: 'UserProfile' }] });
      } else if (user?.role === 'OWNER') {
        navigation.reset({ index: 0, routes: [{ name: 'OwnerDashboard' }] });
      }
    }, [user, navigation]),
  );

  async function onSubmit(values: FormValues) {
    setError('');
    const phone = normalizePhone(values.phone);
    if (!phone) return setError(tStr('invalid_phone'));
    setLoading(true);
    try {
      const res = await api.login(phone, values.password);
      await login(res.token, res.user);
      navigation.reset({ index: 0, routes: [{ name: 'OwnerDashboard' }] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerClassName="px-5 py-8 flex-grow justify-center" keyboardShouldPersistTaps="handled">
        <View className="items-center mb-8">
          <View className="w-14 h-14 rounded-2xl bg-primary items-center justify-center mb-3">
            <Text className="font-serif text-h3 text-on-primary font-bold">CB</Text>
          </View>
          <Text className="font-serif text-h2 text-primary font-bold">
            check<Text className="text-gold">N</Text>book
          </Text>
        </View>

        <Text className="font-serif text-h3 text-on-surface font-bold">{t('owner_welcome_back')}</Text>
        <Text className="font-sans text-sm text-on-surface-variant mt-1 mb-6">{t('owner_signin_sub')}</Text>

        {error ? (
          <View className="flex-row items-center gap-2 bg-error-container rounded-xl px-4 py-3 mb-4">
            <MaterialIcons name="error-outline" size={16} color={colors.onErrorContainer} />
            <Text className="font-sans text-xs text-on-error-container flex-1">{error}</Text>
          </View>
        ) : null}

        <Controller
          control={control}
          name="phone"
          rules={{ required: true }}
          render={({ field }) => (
            <TextField
              label={tStr('phone_number_label')}
              hint={tStr('cc_hint')}
              keyboardType="phone-pad"
              value={field.value}
              onChangeText={field.onChange}
              placeholder="+91 XXXXX XXXXX"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          rules={{ required: true }}
          render={({ field }) => (
            <TextField
              label={tStr('password_label')}
              secureTextEntry
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />

        <Button
          title={loading ? tStr('signing_in') : tStr('sign_in_btn')}
          loading={loading}
          onPress={handleSubmit(onSubmit)}
          className="mt-2"
        />

        <View className="flex-row items-center justify-center gap-1.5 mt-6">
          <Text className="font-sans text-sm text-on-surface-variant">{t('new_owner')}</Text>
          <Pressable onPress={() => navigation.navigate('OwnerRegister')} hitSlop={10}>
            <Text className="font-sans-bold text-sm text-primary">{t('create_account')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
