import { Alert, Platform } from 'react-native';

/**
 * Ask the user to confirm a destructive action. react-native-web's Alert.alert is
 * an empty function, so on web we fall back to window.confirm; native uses Alert.
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  const { title, message, confirmLabel, cancelLabel, onConfirm } = opts;
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
