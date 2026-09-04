import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import {
  AMC10_DECKS,
  AMC10_FLASHCARDS,
  type AMC10Deck,
  type FlashcardLevel,
} from '@/data/amc10-flashcards';

/** AMC 10 闪卡：选卡组 + 层级过滤，点击卡片翻面。 */
export default function FlashcardsScreen() {
  const colors = useTheme();
  const { t } = useI18n();
  const [deck, setDeck] = useState<AMC10Deck | null>(null);
  const [level, setLevel] = useState<FlashcardLevel | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = useMemo(
    () =>
      AMC10_FLASHCARDS.filter(
        (c) => (deck == null || c.deck === deck) && (level == null || c.level === level),
      ),
    [deck, level],
  );

  const current = cards[index];
  const empty = cards.length === 0;

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(next, cards.length - 1)));
    setFlipped(false);
  };

  const pickDeck = (d: AMC10Deck | null) => {
    setDeck(d);
    setIndex(0);
    setFlipped(false);
  };

  const pickLevel = (l: FlashcardLevel | null) => {
    setLevel(l);
    setIndex(0);
    setFlipped(false);
  };

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? colors.primary : colors.backgroundElement, borderColor: active ? colors.primary : colors.border },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, { color: active ? colors.primaryText : colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>{t('flashcards.title')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('flashcards.tapHint')} · {t('flashcards.progress', { current: empty ? 0 : index + 1, total: cards.length })}
        </Text>

        <View style={styles.filterWrap}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.allDecks')}</Text>
          <View style={styles.chipRow}>
            {chip(t('flashcards.all'), deck == null, () => pickDeck(null))}
            {AMC10_DECKS.map((d) => chip(d.label, deck === d.key, () => pickDeck(d.key)))}
          </View>

          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.all')}</Text>
          <View style={styles.chipRow}>
            {chip(t('flashcards.all'), level == null, () => pickLevel(null))}
            {chip(t('flashcards.core'), level === 'core', () => pickLevel('core'))}
            {chip(t('flashcards.advance'), level === 'advance', () => pickLevel('advance'))}
            {chip(t('flashcards.boundary'), level === 'boundary', () => pickLevel('boundary'))}
          </View>
        </View>

        {empty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('flashcards.empty')}</Text>
          </View>
        ) : (
          <>
            <Pressable
              key={current.id}
              onPress={() => setFlipped((f) => !f)}
              accessibilityRole="button"
              accessibilityLabel={flipped ? current.back : current.front}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.backgroundElement },
                Shadows.card,
                pressed && styles.cardPressed,
              ]}>
              <View style={[styles.badge, { backgroundColor: colors.backgroundSelected }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{current.category}</Text>
              </View>
              <Text style={[styles.front, { color: colors.text }]}>
                {flipped ? current.back : current.front}
              </Text>
              <Text style={[styles.tap, { color: colors.textTertiary }]}>
                {flipped ? current.front : t('flashcards.tapHint')}
              </Text>
            </Pressable>

            <View style={styles.controls}>
              <Pressable
                style={({ pressed }) => [
                  styles.controlBtn,
                  { borderColor: colors.border },
                  index === 0 && styles.controlDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => go(index - 1)}
                disabled={index === 0}
                accessibilityLabel={t('flashcards.prev')}>
                <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
                <Text style={[styles.controlText, { color: colors.textSecondary }, index === 0 && styles.controlTextDisabled]}>
                  {t('flashcards.prev')}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.flipBtn, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                onPress={() => setFlipped((f) => !f)}
                accessibilityLabel={t('flashcards.flip')}>
                <Text style={[styles.flipText, { color: colors.primaryText }]}>{t('flashcards.flip')}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.controlBtn,
                  { borderColor: colors.border },
                  index === cards.length - 1 && styles.controlDisabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => go(index + 1)}
                disabled={index === cards.length - 1}
                accessibilityLabel={t('flashcards.next')}>
                <Text style={[styles.controlText, { color: colors.textSecondary }, index === cards.length - 1 && styles.controlTextDisabled]}>
                  {t('flashcards.next')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: -Spacing.two },
  filterWrap: { gap: Spacing.two },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.one,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  card: {
    minHeight: 220,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  cardPressed: { opacity: 0.92 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  front: { fontSize: 20, fontWeight: '700', lineHeight: 29, textAlign: 'center' },
  tap: { fontSize: 12, textAlign: 'center', marginTop: Spacing.two },
  empty: { alignItems: 'center', paddingVertical: Spacing.five },
  emptyText: { fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
  },
  controlText: { fontSize: 14, fontWeight: '700' },
  controlDisabled: { opacity: 0.4 },
  controlTextDisabled: { opacity: 0.4 },
  flipBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  flipText: { fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
