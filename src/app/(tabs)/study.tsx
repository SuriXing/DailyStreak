import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { Button, Tag } from '@ant-design/react-native';
import {
  ALL_FLASHCARDS,
  FLASHCARD_DECKS,
  toQuiz,
  type FlashcardDeck,
  type FlashcardLevel,
} from '@/data/flashcards';

/** 自由练：一场闪卡会话 —— 选卡组 + （AMC10 才有）难度过滤，点击翻面。 */
export default function StudyScreen() {
  const colors = useTheme();
  const { t } = useI18n();
  const [deck, setDeck] = useState<string | null>(null);
  const [level, setLevel] = useState<FlashcardLevel | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const selectedDeck = FLASHCARD_DECKS.find((d) => d.key === deck) ?? null;
  const showLevels = selectedDeck ? selectedDeck.hasLevels : false;

  const cards = useMemo(
    () =>
      ALL_FLASHCARDS.filter(
        (c) => (deck == null || c.deck === deck) && (!showLevels || level == null || c.level === level),
      ),
    [deck, level, showLevels],
  );

  const current = cards[index];
  const quiz = current ? toQuiz(current) : null;
  const empty = cards.length === 0;

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(next, cards.length - 1)));
    setFlipped(false);
    setSelected(null);
  };

  const pickDeck = (d: string | null) => {
    setDeck(d);
    setIndex(0);
    setFlipped(false);
    setLevel(null);
    setSelected(null);
  };

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.backgroundElement,
          borderColor: active ? colors.primary : colors.border,
        },
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
        <Text style={[styles.title, { color: colors.text }]}>{t('tabs.study')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('flashcards.progress', { current: empty ? 0 : index + 1, total: cards.length })}
        </Text>

        <View style={styles.filterWrap}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.allDecks')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            {chip(t('flashcards.all'), deck == null, () => pickDeck(null))}
            {FLASHCARD_DECKS.map((d: FlashcardDeck) => chip(d.label, deck === d.key, () => pickDeck(d.key)))}
          </ScrollView>
          {showLevels && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.all')}</Text>
              <View style={styles.chipRow}>
                {chip(t('flashcards.all'), level == null, () => setLevel(null))}
                {chip(t('flashcards.core'), level === 'core', () => setLevel('core'))}
                {chip(t('flashcards.advance'), level === 'advance', () => setLevel('advance'))}
                {chip(t('flashcards.boundary'), level === 'boundary', () => setLevel('boundary'))}
              </View>
            </>
          )}
        </View>

        {empty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('flashcards.empty')}</Text>
          </View>
        ) : (
          <>
            {quiz ? (
              <View key={current.id} style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
                <Tag>{current.category}</Tag>
                <Text style={[styles.question, { color: colors.text }]}>{quiz.question}</Text>
                <View style={styles.options}>
                  {quiz.options.map((opt, i) => {
                    const isSel = selected === i;
                    const isAns = i === quiz.answerIndex;
                    let bg = colors.backgroundElement;
                    let border = colors.border;
                    if (selected !== null) {
                      if (isAns) {
                        bg = colors.successBg;
                        border = colors.success;
                      } else if (isSel) {
                        bg = colors.errorBg;
                        border = colors.error;
                      }
                    }
                    return (
                      <Pressable
                        key={i}
                        style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                        onPress={() => setSelected(i)}
                        disabled={selected !== null}>
                        <Text style={[styles.optionText, { color: colors.text }]}>
                          {String.fromCharCode(65 + i)}. {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {selected !== null && (
                  <View
                    style={[
                      styles.feedback,
                      { backgroundColor: selected === quiz.answerIndex ? colors.successBg : colors.errorBg },
                    ]}>
                    <Text
                      style={[
                        styles.feedbackTitle,
                        { color: selected === quiz.answerIndex ? colors.successText : colors.errorText },
                      ]}>
                      {selected === quiz.answerIndex
                        ? t('quiz.correct')
                        : t('quiz.answerIs', { letter: String.fromCharCode(65 + quiz.answerIndex) })}
                    </Text>
                    {quiz.explanation ? (
                      <Text style={[styles.feedbackBody, { color: colors.text }]}>{quiz.explanation}</Text>
                    ) : null}
                  </View>
                )}
              </View>
            ) : (
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
                <Tag>{current.category}</Tag>
                <Text style={[styles.front, { color: colors.text }]}>
                  {flipped ? current.back : current.front}
                </Text>
                <Text style={[styles.tap, { color: colors.textTertiary }]}>
                  {flipped ? current.front : t('flashcards.tapHint')}
                </Text>
              </Pressable>
            )}

            <View style={styles.controls}>
              <Button
                onPress={() => go(index - 1)}
                disabled={index === 0}
                size="large"
                style={styles.ctrl}>
                {t('flashcards.prev')}
              </Button>
              {!quiz && (
                <Button type="primary" size="large" onPress={() => setFlipped((f) => !f)} style={styles.ctrl}>
                  {t('flashcards.flip')}
                </Button>
              )}
              <Button
                onPress={() => go(index + 1)}
                disabled={index === cards.length - 1}
                size="large"
                style={styles.ctrl}>
                {t('flashcards.next')}
              </Button>
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
  chipRowScroll: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.four },
  chip: { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  chipText: { fontSize: 13, fontWeight: '700' },
  card: {
    minHeight: 180,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  cardPressed: { opacity: 0.92 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  front: { fontSize: 18, fontWeight: '700', lineHeight: 26, textAlign: 'center' },
  question: { fontSize: 17, fontWeight: '700', lineHeight: 24, textAlign: 'center', marginTop: Spacing.one },
  options: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
  option: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: { fontSize: 14, lineHeight: 20 },
  feedback: { borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.one, marginTop: Spacing.three, alignSelf: 'stretch' },
  feedbackTitle: { fontSize: 14, fontWeight: '800' },
  feedbackBody: { fontSize: 13, lineHeight: 19 },
  tap: { fontSize: 12, textAlign: 'center', marginTop: Spacing.two },
  empty: { alignItems: 'center', paddingVertical: Spacing.five },
  emptyText: { fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  ctrl: { flex: 1 },
  pressed: { opacity: 0.8 },
});
