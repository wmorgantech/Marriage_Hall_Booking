import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { AiSearchResponse } from '../api/types';
import { useT, type DictKey } from '../i18n';
import { colors, cardBorderColor } from '../theme/colors';

type Understood = AiSearchResponse['understood'][number];
type IconName = keyof typeof MaterialIcons.glyphMap;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-12-12" → "12 Dec 2026". Anything that is not a plain YYYY-MM-DD is returned unchanged. */
export function fmtDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || +m[2] < 1 || +m[2] > 12) return iso;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One-line summary of what was understood, e.g. "Coimbatore · 12 Dec 2026 · 800+ guests · Up to ₹2,00,000 per day". */
export function criteriaSummary(understood: Understood[]): string {
  const get = (k: string) => understood.find((u) => u.key === k)?.value;
  const parts = [
    get('city'),
    get('date') ? fmtDay(get('date')!) : undefined,
    get('guests')?.replace(/ seats$/, ' guests'),
    get('budget') ? cap(get('budget')!) : undefined,
  ];
  return parts.filter(Boolean).join(' · ');
}

const ROWS: { key: string; icon: IconName; label: DictKey }[] = [
  { key: 'city', icon: 'place', label: 'smart_r_city' },
  { key: 'area', icon: 'location-city', label: 'smart_r_area' },
  { key: 'date', icon: 'event', label: 'smart_r_date' },
  { key: 'guests', icon: 'groups', label: 'smart_r_guests' },
  { key: 'budget', icon: 'currency-rupee', label: 'smart_r_budget' },
  { key: 'minbudget', icon: 'currency-rupee', label: 'smart_r_price' },
];

function rowValue(key: string, value: string) {
  if (key === 'date') return fmtDay(value);
  if (key === 'guests') return value.replace(/ seats$/, ' guests');
  if (key === 'budget' || key === 'minbudget') return cap(value);
  return value;
}

/**
 * "We understood your request!" banner plus the criteria the server extracted, as icon rows. Read-only on purpose:
 * the only way to change them is Edit, which goes back to the text box.
 */
export function AiCriteriaCard({ understood, onEdit }: { understood: Understood[]; onEdit: () => void }) {
  const { t, tStr } = useT();
  const prefs = understood.filter((u) => u.key.startsWith('pref:'));
  const others = understood.filter((u) => ['ac', 'rooms', 'dining'].includes(u.key));
  const rows = ROWS.map((r) => ({ ...r, u: understood.find((u) => u.key === r.key) })).filter((r) => r.u);

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: '#E3F4E8',
          borderWidth: 1,
          borderColor: '#B9DDC6',
          borderRadius: 14,
          padding: 14,
        }}
      >
        <MaterialIcons name="check-circle" size={28} color="#15803d" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }}>{t('smart_understood_h')}</Text>
          <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 }}>{t('smart_understood_sub')}</Text>
        </View>
      </View>

      <Text className="font-serif text-primary" style={{ fontSize: 18, marginTop: 18, marginBottom: 8 }}>
        {t('smart_criteria')}
      </Text>
      <View
        style={{
          backgroundColor: colors.surfaceContainerLowest,
          borderWidth: 1,
          borderColor: cardBorderColor,
          borderRadius: 14,
          paddingHorizontal: 14,
        }}
      >
        {rows.map((r, i) => (
          <Row key={r.key} icon={r.icon} label={tStr(r.label)} first={i === 0}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>{rowValue(r.key, r.u!.value)}</Text>
          </Row>
        ))}
        {prefs.length > 0 && (
          <Row icon="tune" label={tStr('smart_r_prefs')} first={rows.length === 0}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {prefs.map((p) => (
                <View
                  key={p.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E3F4E8', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}
                >
                  <MaterialIcons name={/parking/i.test(p.label) ? 'local-parking' : 'check'} size={14} color="#15803d" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534' }}>{p.label}</Text>
                </View>
              ))}
            </View>
          </Row>
        )}
        {others.length > 0 && (
          <Row icon="more-horiz" label={tStr('smart_r_other')} first={rows.length === 0 && prefs.length === 0}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }}>
              {others.map((o) => `${o.label} (${o.value})`).join(', ')}
            </Text>
          </Row>
        )}
      </View>

      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: 12,
          height: 46,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.primary,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <MaterialIcons name="edit" size={17} color={colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>{t('smart_edit')}</Text>
      </Pressable>
    </View>
  );
}

function Row({ icon, label, first, children }: { icon: IconName; label: string; first: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: cardBorderColor,
      }}
    >
      <MaterialIcons name={icon} size={22} color={colors.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: colors.onSurfaceVariant, marginBottom: 2 }}>{label}</Text>
        {children}
      </View>
    </View>
  );
}
