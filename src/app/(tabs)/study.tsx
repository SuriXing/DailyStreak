import { useEffect, useMemo, useState } from 'react';
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
  type Flashcard,
  type FlashcardDeck,
  type FlashcardLevel,
} from '@/data/flashcards';
import { localizeFlashcard } from '@/data/flashcard-i18n';
import { availableDifficulties, availableKinds, filterCards, shuffleCards, type CardKind } from '@/lib/flashcard-session';
import { loadLocalDeck, type LocalDeck } from '@/data/local-bank';

/** 自由练：一场闪卡会话 —— 卡组 + 题型（+ AMC10 才有的难度），选择题点选、概念卡翻面。 */

/** 新顺序的种子：切换卡组/题型/顺序时重新洗一次，同一次会话里顺序保持稳定。 */
const nextSeed = () => Math.floor(Math.random() * 0xffffffff);
export default function StudyScreen() {
  const colors = useTheme();
  const { t, locale } = useI18n();
  const [deck, setDeck] = useState<string | null>(null);
  const [level, setLevel] = useState<FlashcardLevel | null>(null);
  const [difficulty, setDifficulty] = useState<number[]>([]);
  // 默认只练选择题：AMC10 概念卡是"XX 是什么？"式词条，一进自由练就翻词条不像在练题
  const [kind, setKind] = useState<CardKind | null>('quiz');
  // 默认乱序：否则每次进来都从同一张卡开始
  const [shuffled, setShuffled] = useState(true);
  const [seed, setSeed] = useState(nextSeed);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // 本地题库：运行时从 /local-deck.json 拉取一次；拉不到（部署站点上就是 404）就当作没有
  const [localDeck, setLocalDeck] = useState<LocalDeck | null>(null);
  useEffect(() => {
    let alive = true;
    loadLocalDeck().then((d) => {
      if (alive && d) setLocalDeck(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const decks: FlashcardDeck[] = useMemo(
    () =>
      localDeck
        ? [...FLASHCARD_DECKS, { key: 'local', label: localDeck.label, hasLevels: false }]
        : FLASHCARD_DECKS,
    [localDeck],
  );
  const pool = useMemo(
    () => (localDeck ? [...ALL_FLASHCARDS, ...localDeck.cards] : ALL_FLASHCARDS),
    [localDeck],
  );
  const selectedDeck = decks.find((d) => d.key === deck) ?? null;
  const showLevels = selectedDeck ? selectedDeck.hasLevels : false;
  // AMC10 卡组整组都是概念卡，题型筛选在那里没有意义，这种情况直接不显示这一行
  const kinds = useMemo(() => availableKinds(deck), [deck]);
  const showKinds = kinds.length > 1;
  const activeKind = showKinds ? kind : null;

  // 难度分级：练习册与情境题卡上带 1-4；AMC10 概念卡没有，所以那一行不显示
  const difficulties = useMemo(
    () => availableDifficulties(deck == null ? pool : pool.filter((c) => c.deck === deck)),
    [pool, deck],
  );
  const showDifficulty = difficulties.length > 1;

  const cards = useMemo(() => {
    const list = filterCards(
      { deck, level, difficulty: showDifficulty ? difficulty : null, kind: activeKind },
      pool,
    );
    return shuffled ? shuffleCards(list, seed) : list;
  }, [pool, deck, level, difficulty, showDifficulty, activeKind, shuffled, seed]);

  const current = cards[index] ? localizeFlashcard(cards[index], locale) : cards[index];
  const quiz = current ? toQuiz(current) : null;
  const empty = cards.length === 0;

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(next, cards.length - 1)));
    setFlipped(false);
    setSelected(null);
  };

  const resetSession = () => {
    setIndex(0);
    setFlipped(false);
    setSelected(null);
    setSeed(nextSeed());
  };

  const toggleShuffle = () => {
    setShuffled((s) => !s);
    resetSession();
  };

  const pickDeck = (d: string | null) => {
    setDifficulty([]);
    setDeck(d);
    setLevel(null);
    resetSession();
  };

  /**
   * 难度多选：点一下把该档加入选择，再点一下移出；空数组 = 不限（和前几行的「全部」同义）。
   * 每次都重开会话：卡池变了，原来的下标可能已经越界，随手也把乱序重洗一遍。
   */
  const toggleDifficulty = (d: number) => {
    setDifficulty((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
    resetSession();
  };

  /** 「全部」= 清空难度选择（与卡组/题型的「全部」同义），也一样重开会话。 */
  const clearDifficulty = () => {
    setDifficulty([]);
    resetSession();
  };

  const pickKind = (k: CardKind | null) => {
    setKind(k);
    resetSession();
  };

  /** 来源 + 核验状态：verified 由 scripts/flashcard-verification.json 的正文哈希决定。 */
  const sourceLine = (card: Flashcard) => {
    const label =
      card.source === 'local-exam'
        ? t('flashcards.sourceLocalExam')
        : t(card.source === 'ai-mcq' ? 'flashcards.sourceAiMcq' : 'flashcards.sourceAmc10');
    const state = card.verified ? t('flashcards.verified') : t('flashcards.unverified');
    return `${label} · ${state}`;
  };

  /**
   * 卡片自己的难度标签：学生选了"3 和 4"之后，得能看出手上这张是哪一档，否则没法判断卡在哪一级。
   * 只在卡片真的带分级（练习册与情境题的 1-4）时渲染：AMC10 概念卡整组没有 difficulty 字段，
   * 打包器给"没有分级"写的 0 也不是一档，所以 undefined 与 0 都返回 null，
   * 不能出现「难度 0」或「难度 undefined」这种卡片自己编出来的档位。
   */
  const difficultyLabel = (card: Flashcard) =>
    typeof card.difficulty === 'number' && card.difficulty > 0 ? (
      <Text
        testID="card-difficulty"
        style={[
          styles.difficultyBadge,
          { backgroundColor: colors.backgroundSelected, borderColor: colors.primary, color: colors.primary },
        ]}>
        {t('flashcards.difficultyLabel', { level: card.difficulty })}
      </Text>
    ) : null;

  const chip = (label: string, active: boolean, onPress: () => void, testID?: string) => (
    <Pressable
      key={label}
      testID={testID}
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
      aria-selected={active}>
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
            {decks.map((d: FlashcardDeck) => chip(d.label, deck === d.key, () => pickDeck(d.key)))}
          </ScrollView>
          {showKinds && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.kinds')}</Text>
              <View style={styles.chipRow}>
                {chip(t('flashcards.all'), kind == null, () => pickKind(null))}
                {kinds.map((k) =>
                  chip(
                    k === 'quiz' ? t('flashcards.kindQuiz') : t('flashcards.kindConcept'),
                    kind === k,
                    () => pickKind(k),
                  ),
                )}
              </View>
            </>
          )}
          {showDifficulty && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>
                {t('flashcards.difficulty')}
                <Text style={[styles.filterHint, { color: colors.textTertiary }]}>
                  {' · '}
                  {t('flashcards.difficultyHint')}
                </Text>
              </Text>
              <View style={styles.chipRow}>
                {chip(t('flashcards.all'), difficulty.length === 0, clearDifficulty, 'difficulty-all')}
                {difficulties.map((d) =>
                  chip(String(d), difficulty.includes(d), () => toggleDifficulty(d), `difficulty-${d}`),
                )}
              </View>
            </>
          )}
          {showLevels && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.level')}</Text>
              <View style={styles.chipRow}>
                {chip(t('flashcards.all'), level == null, () => setLevel(null))}
                {chip(t('flashcards.core'), level === 'core', () => setLevel('core'))}
                {chip(t('flashcards.advance'), level === 'advance', () => setLevel('advance'))}
                {chip(t('flashcards.boundary'), level === 'boundary', () => setLevel('boundary'))}
              </View>
            </>
          )}
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.order')}</Text>
          <View style={styles.chipRow}>{chip(t('flashcards.shuffle'), shuffled, toggleShuffle)}</View>
        </View>

        <Text style={[styles.note, { color: colors.textTertiary }]}>{t('flashcards.provenanceNote')}</Text>

        {empty ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('flashcards.empty')}</Text>
          </View>
        ) : (
          <>
            {quiz ? (
              <View key={current.id} style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
                <View style={styles.cardHead}>
                  <Tag>{current.category}</Tag>
                  {difficultyLabel(current)}
                </View>
                <Text style={[styles.source, { color: colors.textTertiary }]}>{sourceLine(current)}</Text>
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
                <View style={styles.cardHead}>
                  <Tag>{current.category}</Tag>
                  {difficultyLabel(current)}
                </View>
                <Text style={[styles.source, { color: colors.textTertiary }]}>{sourceLine(current)}</Text>
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
  note: { fontSize: 11, lineHeight: 16 },
  filterWrap: { gap: Spacing.two },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.one,
  },
  filterHint: { fontSize: 11, fontWeight: '400', letterSpacing: 0 },
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
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: Spacing.two },
  difficultyBadge: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  badge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  front: { fontSize: 18, fontWeight: '700', lineHeight: 26, textAlign: 'center' },
  source: { fontSize: 11, textAlign: 'center' },
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
