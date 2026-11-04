import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Calendar, type DateData } from 'react-native-calendars';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import { Button } from './Button';
import { TextField } from './TextField';

export type AdvancedFilters = {
  area?: string;
  date?: string;
  minPrice: string;
  maxPrice: string;
  hasAC: boolean;
  hasRooms: boolean;
};

export const emptyAdvancedFilters: AdvancedFilters = {
  area: undefined,
  date: undefined,
  minPrice: '',
  maxPrice: '',
  hasAC: false,
  hasRooms: false,
};

export function countActiveFilters(f: AdvancedFilters): number {
  return (
    (f.area ? 1 : 0) +
    (f.date ? 1 : 0) +
    (f.minPrice ? 1 : 0) +
    (f.maxPrice ? 1 : 0) +
    (f.hasAC ? 1 : 0) +
    (f.hasRooms ? 1 : 0)
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
  city: string;
  areaOptions: string[];
  value: AdvancedFilters;
  onApply: (next: AdvancedFilters) => void;
};

export function FiltersModal({ visible, onClose, city, areaOptions, value, onApply }: Props) {
  const { t, tStr } = useT();
  const [draft, setDraft] = useState<AdvancedFilters>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  function patch(next: Partial<AdvancedFilters>) {
    setDraft((cur) => ({ ...cur, ...next }));
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  function clearAll() {
    onApply(emptyAdvancedFilters);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-outline-variant/40">
          <Text className="font-serif text-base text-on-surface font-bold">{t('filters')}</Text>
          <Pressable onPress={onClose}>
            <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="px-5 py-5" keyboardShouldPersistTaps="handled">
          <Text className="font-sans-semibold text-xs uppercase tracking-wider text-on-surface-variant mb-2">
            {t('area_label')}
          </Text>
          {city ? (
            areaOptions.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 mb-5">
                <Chip label={tStr('all_areas')} active={!draft.area} onPress={() => patch({ area: undefined })} />
                {areaOptions.map((a) => (
                  <Chip key={a} label={a} active={draft.area === a} onPress={() => patch({ area: a })} />
                ))}
              </View>
            ) : (
              <Text className="font-sans text-xs text-on-surface-variant mb-5">{tStr('all_areas')}</Text>
            )
          ) : (
            <Text className="font-sans text-xs text-on-surface-variant mb-5">{tStr('select_city_first')}</Text>
          )}

          <View className="flex-row items-center justify-between mb-2">
            <Text className="font-sans-semibold text-xs uppercase tracking-wider text-on-surface-variant">
              {t('auspicious_date')}
            </Text>
            {draft.date ? (
              <Pressable onPress={() => patch({ date: undefined })}>
                <Text className="font-sans-bold text-[11px] text-primary">{tStr('clear_date')}</Text>
              </Pressable>
            ) : null}
          </View>
          <View className="rounded-2xl overflow-hidden border border-outline-variant/40 mb-5">
            <Calendar
              minDate={new Date().toISOString().slice(0, 10)}
              markedDates={draft.date ? { [draft.date]: { selected: true, selectedColor: colors.primary } } : {}}
              onDayPress={(d: DateData) => patch({ date: d.dateString })}
              theme={{
                todayTextColor: colors.primary,
                arrowColor: colors.primary,
                selectedDayBackgroundColor: colors.primary,
              }}
            />
          </View>

          <Text className="font-sans-semibold text-xs uppercase tracking-wider text-on-surface-variant mb-2">
            {t('price_range')}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label={tStr('min_price')}
                keyboardType="number-pad"
                placeholder="0"
                value={draft.minPrice}
                onChangeText={(v) => patch({ minPrice: v.replace(/\D/g, '') })}
              />
            </View>
            <View className="flex-1">
              <TextField
                label={tStr('max_price')}
                keyboardType="number-pad"
                placeholder="Any"
                value={draft.maxPrice}
                onChangeText={(v) => patch({ maxPrice: v.replace(/\D/g, '') })}
              />
            </View>
          </View>

          <Text className="font-sans-semibold text-xs uppercase tracking-wider text-on-surface-variant mb-2 mt-2">
            {t('elite_facilities')}
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            <Chip label={tStr('ac_label')} active={draft.hasAC} onPress={() => patch({ hasAC: !draft.hasAC })} />
            <Chip
              label={tStr('rooms_label')}
              active={draft.hasRooms}
              onPress={() => patch({ hasRooms: !draft.hasRooms })}
            />
          </View>

          <Button title={tStr('apply_filters')} onPress={apply} />
          <Pressable onPress={clearAll} className="items-center py-3 mt-1">
            <Text className="font-sans-bold text-xs uppercase tracking-widest text-on-surface-variant">
              {t('clear_all')}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3.5 py-2 rounded-full border ${active ? 'bg-primary border-primary' : 'border-outline-variant'}`}
    >
      <Text className={`font-sans-medium text-xs ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
