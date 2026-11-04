import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type ToastKind = 'success' | 'error' | 'info';
type ToastState = { id: number; kind: ToastKind; message: string } | null;

const ToastContext = createContext<(kind: ToastKind, message: string) => void>(() => {});

const KIND_STYLES: Record<ToastKind, { bg: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  success: { bg: 'bg-primary', icon: 'check-circle' },
  error: { bg: 'bg-error', icon: 'error' },
  info: { bg: 'bg-tertiary', icon: 'info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(kind: ToastKind, message: string) {
    const id = Date.now();
    setToast({ id, kind, message });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 3000);
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <SafeAreaView className="absolute top-0 left-0 right-0" pointerEvents="none">
          <View
            className={`mx-4 mt-2 flex-row items-center gap-2 rounded-xl px-4 py-3 ${KIND_STYLES[toast.kind].bg}`}
            style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }}
          >
            <MaterialIcons name={KIND_STYLES[toast.kind].icon} size={18} color="#fff" />
            <Text className="font-sans-semibold text-sm text-white flex-1">{toast.message}</Text>
          </View>
        </SafeAreaView>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
