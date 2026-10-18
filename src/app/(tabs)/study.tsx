import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  availableDifficulties,
  availableKinds,
  filterCards,
  orderCards,
  shuffleCards,
  type CardKind,
  type CardOrder,
} from '@/lib/flashcard-session';
import { loadLocalDeck, type LocalDeck } from '@/data/local-bank';

/** 自由练：一场闪卡会话 —— 卡组 + 题型（+ AMC10 才有的难度），选择题点选、概念卡翻面。
 *  顺序一列里「乱序」与「由易到难 / 由难到易」互斥：排序会关掉乱序（见 pickOrder 的注释）。 */

/** 新顺序的种子：切换卡组/题型/顺序时重新洗一次，同一次会话里顺序保持稳定。 */
const nextSeed = () => Math.floor(Math.random() * 0xffffffff);

/** chip 的语义角色：一行里同一时刻只有一个能成立 = radio；能同时选中多个（难度分级）= checkbox。 */
type ChipRole = 'radio' | 'checkbox';

/** 一行筛选的容器语义：单选行读成 radiogroup，多选行读成 group（两者都带 aria-label 说明这一行是干什么的）。 */
type ChipGroupRole = 'radiogroup' | 'group';

/** react-native-web 转发给 DOM 的键盘事件（这份类型在 RN 的 View/Pressable 里没有）。 */
type WebKeyLike = { key?: string; code?: string; preventDefault?: () => void };

/**
 * 空格键要自己接住，Enter 不用。原因在 react-native-web 的 PressResponder.isValidKeyPress：
 * `key === 'Enter' || (空格 && isButtonish)`——Enter 对任何角色都成立，而空格只对原生 <button>
 * 或 role=button 成立。这一排 chip 改成 role=radio / checkbox 后，RNW 渲染的是
 * <div role="radio|checkbox">（AccessibilityUtil.propsToAccessibilityComponent 只把 role=button 映射成
 * <button>），于是空格会掉在地上并拿去滚动页面；这里补上空格，Enter 仍旧交给 Pressable，
 * 免得一次按键触发两次。非 web 平台没有这套 DOM 键盘语义，原样返回空对象。
 */
const spaceKeyProps = (onPress: () => void) =>
  Platform.OS === 'web'
    ? {
        onKeyDown: (e: WebKeyLike) => {
          if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
            e.preventDefault?.();
            onPress();
          }
        },
      }
    : {};

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
  // 难度排序：null = 不排序。与乱序**互斥**——"打乱"和"由易到难"是两种互相抵消的诉求
  // （洗完之后再排序等于没洗），所以两个开关永远最多有一个为真，见 toggleShuffle / pickOrder。
  const [order, setOrder] = useState<CardOrder>(null);
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
  /**
   * 排序开关的显示条件：当前卡组里至少有一张带分级的卡。
   * AMC10 概念卡整组没有 difficulty（难度那一行本来就不显示），按难度排序对它们无从下手，
   * 所以那一组不显示这两个 chip；只有一档时排序是恒等操作，仍然显示，
   * 免得同一个开关在别的卡组出现、在这里凭空消失。
   */
  const showOrder = difficulties.length > 0;

  const cards = useMemo(() => {
    const list = filterCards(
      { deck, level, difficulty: showDifficulty ? difficulty : null, kind: activeKind },
      pool,
    );
    // 排序优先于乱序：两者互斥（界面保证不会同时为真），这里再判一次是为了让 lib 的语义显式，
    // 而不是依赖"界面不出错"；order 为 null 时才轮到乱序。
    if (order) return orderCards(list, order);
    return shuffled ? shuffleCards(list, seed) : list;
  }, [pool, deck, level, difficulty, showDifficulty, activeKind, order, shuffled, seed]);

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
    const next = !shuffled;
    setShuffled(next);
    // 打开乱序就把排序清掉：两者语义冲突，同时成立只会有一个悄悄失效
    if (next) setOrder(null);
    resetSession();
  };

  /**
   * 难度排序：点一个方向就按那个方向排（再点一次同一个方向 = 取消排序，回到卡池原顺序）。
   * 选了排序一定把乱序关掉——"洗好后按难度重排"等于没洗，所以让两者互斥，
   * 而不是留一个在界面上假装还开着。切换后重开会话（下标与卡片一一对应，顺序变了旧下标就错位了）。
   */
  const pickOrder = (next: Exclude<CardOrder, null>) => {
    setOrder((prev) => (prev === next ? null : next));
    setShuffled(false);
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

  /** 每一行的分组名：读屏软件停在 chip 上时用它说明"这是哪一行的选项"。 */
  const deckGroup = t('flashcards.groupDeck');
  const kindGroup = t('flashcards.groupKind');
  const difficultyGroup = t('flashcards.groupDifficulty');
  const levelGroup = t('flashcards.groupLevel');
  const orderGroup = t('flashcards.groupOrder');

  /**
   * 筛选 chip：一行里的一个选项。
   *
   * 语义按"这一行怎么选"定，而不是按它长得像按钮：
   * - 卡组 / 题型 / 分层 / 顺序：同一时刻最多一个成立 → role=radio，容器 role=radiogroup。
   *   顺序那一行允许"一个都不选"（= 按卡池原顺序，再点一次选中的 chip 就回到这个状态），
   *   这是 radio 组里"可以没有选中项"的用法；反过来给每个 chip 一个 checkbox、再靠代码假装互斥，
   *   会让读屏软件告诉学生"这几个可以同时勾上"，那是谎报。
   * - 难度分级：本来就是多选（[3,4] = 只要 3 和 4）→ role=checkbox，容器 role=group。
   *
   * 选中态只用 aria-checked 表达：react-native-web 不认 accessibilityState——createDOMProps 只认
   * aria-* 别名和 accessibilityChecked/Selected 这些单项别名，accessibilityState={{ selected }} 整个对象
   * 会被丢掉，DOM 上一个属性都不会出现（仓库里踩过这个坑）。可读名把"哪一行 + 哪个选项 + 选中没有"
   * 一次说完，因为读屏软件停在 chip 上时不会自动念出这一行的标题，光一个"4"什么信息都没有。
   * 每个 chip 自己是一个 Tab 停靠点（tabIndex=0），没有做 roving tabindex 与方向键：
   * 代价是读一个 16 个卡组的单选组要按 16 次 Tab，好处是每个选项都能被 Tab 直接摸到，
   * 不会出现"选中项之外一个都进不去"的死角。
   */
  const chip = (opts: {
    label: string;
    group: string;
    role: ChipRole;
    active: boolean;
    onPress: () => void;
    testID: string;
  }) => (
    <Pressable
      key={opts.testID}
      testID={opts.testID}
      role={opts.role}
      aria-checked={opts.active}
      aria-label={t('flashcards.chipA11y', {
        group: opts.group,
        label: opts.label,
        state: opts.active ? t('flashcards.chipSelected') : t('flashcards.chipUnselected'),
      })}
      tabIndex={0}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: opts.active ? colors.primary : colors.backgroundElement,
          borderColor: opts.active ? colors.primary : colors.border,
        },
        pressed && styles.pressed,
      ]}
      onPress={opts.onPress}
      {...spaceKeyProps(opts.onPress)}>
      <Text style={[styles.chipText, { color: opts.active ? colors.primaryText : colors.text }]}>
        {opts.label}
      </Text>
    </Pressable>
  );

  /**
   * 一行筛选的容器：role 说明这一行是单选还是多选，aria-label 说明这一行在筛什么。
   * 只加在容器上，不加在那一行可见的标题 Text 上——标题是给人看的排版，不是 chip 的可读名。
   */
  const chipRow = (group: string, role: ChipGroupRole, children: ReactNode) => (
    <View role={role} aria-label={group} style={styles.chipRow}>
      {children}
    </View>
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
            role="radiogroup"
            aria-label={deckGroup}
            contentContainerStyle={styles.chipRow}>
            {chip({
              label: t('flashcards.all'),
              group: deckGroup,
              role: 'radio',
              active: deck == null,
              onPress: () => pickDeck(null),
              testID: 'deck-all',
            })}
            {decks.map((d: FlashcardDeck) =>
              chip({
                label: d.label,
                group: deckGroup,
                role: 'radio',
                active: deck === d.key,
                onPress: () => pickDeck(d.key),
                testID: `deck-${d.key}`,
              }),
            )}
          </ScrollView>
          {showKinds && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.kinds')}</Text>
              {chipRow(
                kindGroup,
                'radiogroup',
                <>
                  {chip({
                    label: t('flashcards.all'),
                    group: kindGroup,
                    role: 'radio',
                    active: kind == null,
                    onPress: () => pickKind(null),
                    testID: 'kind-all',
                  })}
                  {kinds.map((k) =>
                    chip({
                      label: k === 'quiz' ? t('flashcards.kindQuiz') : t('flashcards.kindConcept'),
                      group: kindGroup,
                      role: 'radio',
                      active: kind === k,
                      onPress: () => pickKind(k),
                      testID: `kind-${k}`,
                    }),
                  )}
                </>,
              )}
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
              {chipRow(
                difficultyGroup,
                // 多选行：每一档是一个 checkbox，「全部」= 一个都没勾上（点它 = 清空选择）
                'group',
                <>
                  {chip({
                    label: t('flashcards.all'),
                    group: difficultyGroup,
                    role: 'checkbox',
                    active: difficulty.length === 0,
                    onPress: clearDifficulty,
                    testID: 'difficulty-all',
                  })}
                  {difficulties.map((d) =>
                    chip({
                      label: String(d),
                      group: difficultyGroup,
                      role: 'checkbox',
                      active: difficulty.includes(d),
                      onPress: () => toggleDifficulty(d),
                      testID: `difficulty-${d}`,
                    }),
                  )}
                </>,
              )}
            </>
          )}
          {showLevels && (
            <>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.level')}</Text>
              {chipRow(
                levelGroup,
                'radiogroup',
                <>
                  {chip({
                    label: t('flashcards.all'),
                    group: levelGroup,
                    role: 'radio',
                    active: level == null,
                    onPress: () => setLevel(null),
                    testID: 'level-all',
                  })}
                  {chip({
                    label: t('flashcards.core'),
                    group: levelGroup,
                    role: 'radio',
                    active: level === 'core',
                    onPress: () => setLevel('core'),
                    testID: 'level-core',
                  })}
                  {chip({
                    label: t('flashcards.advance'),
                    group: levelGroup,
                    role: 'radio',
                    active: level === 'advance',
                    onPress: () => setLevel('advance'),
                    testID: 'level-advance',
                  })}
                  {chip({
                    label: t('flashcards.boundary'),
                    group: levelGroup,
                    role: 'radio',
                    active: level === 'boundary',
                    onPress: () => setLevel('boundary'),
                    testID: 'level-boundary',
                  })}
                </>,
              )}
            </>
          )}
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('flashcards.order')}</Text>
          {chipRow(
            orderGroup,
            'radiogroup',
            <>
              {chip({
                label: t('flashcards.shuffle'),
                group: orderGroup,
                role: 'radio',
                active: shuffled,
                onPress: toggleShuffle,
                testID: 'order-shuffle',
              })}
              {showOrder &&
                chip({
                  label: t('flashcards.orderAsc'),
                  group: orderGroup,
                  role: 'radio',
                  active: order === 'difficulty-asc',
                  onPress: () => pickOrder('difficulty-asc'),
                  testID: 'order-asc',
                })}
              {showOrder &&
                chip({
                  label: t('flashcards.orderDesc'),
                  group: orderGroup,
                  role: 'radio',
                  active: order === 'difficulty-desc',
                  onPress: () => pickOrder('difficulty-desc'),
                  testID: 'order-desc',
                })}
            </>,
          )}
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
