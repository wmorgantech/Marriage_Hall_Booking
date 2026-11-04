import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from './Button';
import { TextField } from './TextField';
import { useToast } from './Toast';

export function OtpModal({
  visible,
  onClose,
  onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { t, tStr } = useT();
  const { login } = useAuth();
  const showToast = useToast();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Matches the backend's 30-second resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  function reset() {
    setStep('phone');
    setName('');
    setPhoneDigits('');
    setOtp('');
    setError('');
    setResendIn(0);
  }

  function close() {
    reset();
    onClose();
  }

  async function sendOtp() {
    if (phoneDigits.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.requestOtp(`+91${phoneDigits}`);
      setOtp('');
      setStep('otp');
      setResendIn(30);
    } catch (e) {
      // The API masks provider failures (WhatsApp unreachable etc.) as a generic server error.
      const msg = e instanceof Error ? e.message : '';
      setError(!msg ? 'Could not send OTP' : /internal server error|^request failed: 5\d\d/i.test(msg) ? tStr('otp_send_failed') : msg);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (otp.length !== 4) {
      setError('Enter the 4-digit OTP');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.verifyOtp(`+91${phoneDigits}`, otp, name || undefined);
      await login(res.token, res.user);
      showToast('success', 'Verified — contact details unlocked');
      reset();
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <Pressable className="flex-1 bg-black/45" onPress={close}>
        <Pressable className="mt-auto bg-surface-container-lowest rounded-t-2xl p-5" onPress={(e) => e.stopPropagation()}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-serif text-base text-on-surface font-bold">{t('otp_quick_verify')}</Text>
            <Pressable onPress={close}>
              <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {step === 'phone' ? (
            <>
              <Text className="font-sans text-xs text-on-surface-variant mb-4">{t('otp_verify_default')}</Text>
              <TextField
                label={tStr('otp_your_name')}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <TextField
                label={tStr('otp_mobile')}
                value={phoneDigits}
                onChangeText={(v) => setPhoneDigits(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                maxLength={10}
                hint={tStr('otp_send_hint')}
                error={error}
              />
              <Button title={tStr('otp_send_btn')} loading={loading} onPress={sendOtp} />
            </>
          ) : (
            <>
              <Text className="font-sans text-xs text-on-surface-variant mb-1">
                {tStr('otp_sent_to')} +91 {phoneDigits}
              </Text>
              <Pressable onPress={() => setStep('phone')} className="mb-4">
                <Text className="font-sans-semibold text-xs text-primary">{t('otp_change')}</Text>
              </Pressable>
              <TextField
                label={tStr('otp_label')}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                hint={tStr('otp_expiry_note')}
                error={error}
              />
              <Button title={tStr('otp_verify_btn')} loading={loading} onPress={verify} />
              <View className="flex-row justify-center items-center mt-3">
                <Text className="font-sans text-xs text-on-surface-variant">{t('otp_didnt_get')} </Text>
                {resendIn > 0 ? (
                  <Text className="font-sans text-xs text-on-surface-variant">{t('otp_resend_in', { vars: { n: resendIn } })}</Text>
                ) : (
                  <Pressable onPress={sendOtp} disabled={loading} hitSlop={8}>
                    <Text className="font-sans-semibold text-xs text-primary">{t('otp_resend')}</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
