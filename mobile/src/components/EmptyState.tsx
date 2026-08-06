import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../design/tokens';

export function EmptyState({ title, detail, actionLabel, onAction }: {
  title: string; detail: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.mark}>◇</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: colors.inkRaised, borderColor: colors.border, borderRadius: radius.lg, borderStyle: 'dashed', borderWidth: 1, gap: spacing.sm, padding: spacing.xl },
  mark: { color: colors.jade, fontSize: 34 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  detail: { color: colors.textMuted, fontSize: 15, lineHeight: 22, maxWidth: 300, textAlign: 'center' },
  action: { alignItems: 'center', backgroundColor: colors.jade, borderRadius: radius.pill, justifyContent: 'center', marginTop: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg },
  actionText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});
