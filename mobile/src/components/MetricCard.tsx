import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../design/tokens';

type Tone = 'neutral' | 'positive' | 'negative' | 'accent';
const toneColors: Record<Tone, string> = {
  neutral: colors.text,
  positive: colors.jade,
  negative: colors.coral,
  accent: colors.amber,
};

export function MetricCard({ label, value, detail, tone = 'neutral' }: {
  label: string; value: string; detail: string; tone?: Tone;
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}, ${detail}`} style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.value, { color: toneColors[tone] }]}>
        {value}
      </Text>
      <Text style={styles.detail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, gap: spacing.xs, minWidth: 145, padding: spacing.md },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  value: { fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
