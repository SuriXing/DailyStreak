import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COURSES, getTodayItem, type Course, type StudyItem } from '@/data/courses';
import { useCourse } from '@/hooks/use-course';
import { useDailyGoal } from '@/hooks/use-daily-goal';
import { useSessionUser } from '@/hooks/use-session-user';
import { useIsDesktop } from '@/hooks/use-media';
import { localizeStudyItem, useI18n } from '@/i18n';
import {
  buildSessionPlan,
  computeMastery,
  fetchAnswers,
  recordAnswer,
  todayAnsweredCount,
  type AnswerRecord,
} from '@/lib/answers';
import { withTimeout } from '@/lib/timeout';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/contexts/theme-preference';

type Phase = 'ready' | 'quiz' | 'done';

export default function StudyScreen() {
  const colors = useTheme();
  const { resolved } = useThemePreference();
  const user = useSessionUser();
  const { t, locale } = useI18n();
  const [course, setCourseId] = useCourse();
  const [goal] = useDailyGoal();
  const isDesktop = useIsDesktop();

  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('ready');
  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const item = queue[index];
  /** 展示用：按当前语言本地化的题目（逻辑仍用结构化 course） */
  const localizedItem = item ? localizeStudyItem(item, locale) : null;
  const localizedToday = localizeStudyItem(getTodayItem(course), locale);
  const mastery = useMemo(() => computeMastery(course, answers), [course, answers]);
  const todayAnswered = todayAnsweredCount(answers);

  const load = useCallback(() => {
    if (!user) return;
    withTimeout(fetchAnswers(user.id, course.id), 10000)
      .then((ans) => setAnswers(ans))
      .catch(() => setAnswers([]))
      .finally(() => setLoading(false));
  }, [user, course.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 安全网：无论任何原因（user 未就绪/请求挂起），loading 最多持续 15 秒
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(timer);
  }, []);

  function startSession() {
    const plan = buildSessionPlan(course, answers, goal);
    if (plan.total === 0) return; // 没有到期复习也没有新题时留在就绪页
    const q = [...plan.reviews, ...plan.news];
    setQueue(q);
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setPhase('quiz');
  }

  function choose(optIndex: number) {
    if (!item || selected !== null) return;
    setSelected(optIndex);
    const correct = optIndex === item.answerIndex;
    if (correct) setCorrectCount((c) => c + 1);
    if (user) {
      recordAnswer(user.id, course.id, item.id, correct).catch(() => {});
    }
  }

  function next() {
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1);
      setSelected(null);
    } else {
      setPhase('done');
      // 刷新答题记录（驱动下次复习调度与打卡页进度）
      if (user) {
        fetchAnswers(user.id, course.id)
          .then((ans) => setAnswers(ans))
          .catch(() => {});
      }
    }
  }

  function finish() {
    setPhase('ready');
  }

  const answered = selected !== null;
  const isLast = index + 1 >= queue.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.courseSwitcher}>
          {COURSES.map((c) => {
            const active = c.id === course.id;
            return (
              <Pressable
                key={c.id}
                style={({ pressed }) => [
                  styles.courseChip,
                  {
                    backgroundColor: active ? c.color : colors.backgroundElement,
                    borderColor: active ? c.color : colors.border,
                  },
                  pressed && styles.pressed,
                ]}
                onPress={() => setCourseId(c.id)}
                accessibilityLabel={t('a11y.switchCourse', { name: c.name })}
                accessibilityState={{ selected: active }}>
                <Text style={[styles.courseChipText, { color: active ? '#fff' : colors.text }]}>
                  {c.shortName}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : phase === 'ready' ? (
          <ReadyView
            courseName={course.name}
            courseColor={course.color}
            goal={goal}
            todayAnswered={todayAnswered}
            todayBody={localizedToday.body}
            todayTitle={localizedToday.title}
            masteryPercent={mastery.percent}
            plan={buildSessionPlan(course, answers, goal)}
            onStart={startSession}
            isDesktop={isDesktop}
          />
        ) : phase === 'quiz' && localizedItem ? (
          <QuizView
            item={localizedItem}
            courseColor={course.color}
            index={index}
            total={queue.length}
            selected={selected}
            answered={answered}
            onChoose={choose}
            onNext={next}
            isLast={isLast}
            isDesktop={isDesktop}
          />
        ) : (
          <DoneView
            courseColor={course.color}
            correctCount={correctCount}
            total={queue.length}
            masteryBefore={mastery}
            answersAfter={answers}
            course={course}
            onFinish={finish}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReadyView(props: {
  courseName: string;
  courseColor: string;
  goal: number;
  todayAnswered: number;
  todayTitle: string;
  todayBody: string;
  masteryPercent: number;
  plan: { reviews: StudyItem[]; news: StudyItem[]; total: number };
  onStart: () => void;
  isDesktop: boolean;
}) {
  const colors = useTheme();
  const { t } = useI18n();
  const { plan } = props;
  return (
    <View style={styles.readyWrap}>
      <Text style={[styles.courseName, { color: colors.textSecondary }]}>{props.courseName}</Text>

      <View style={[styles.readyCols, props.isDesktop && styles.readyColsRow]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card, props.isDesktop && styles.readyCol]}>
          <View style={[styles.badge, { backgroundColor: props.courseColor }]}>
            <Text style={styles.badgeText}>{t('study.todayPractice')}</Text>
          </View>
          <Text style={[styles.readyTitle, { color: colors.text }]}>
            {props.todayAnswered >= props.goal
              ? t('study.doneToday')
              : t('study.remaining', { count: props.goal - props.todayAnswered })}
          </Text>
          <Text style={[styles.readyBody, { color: colors.textSecondary }]}>
            {t('study.plan', {
              total: plan.total,
              reviews: plan.reviews.length,
              news: plan.news.length,
            })}
            {plan.reviews.length === 0 ? t('study.noReviews') : ''}
          </Text>
          <Text style={[styles.readyBody, { color: colors.textSecondary }]}>
            {t('study.masteryLine', { percent: props.masteryPercent, goal: props.goal })}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: props.courseColor },
              pressed && styles.pressed,
            ]}
            onPress={props.onStart}>
            <Text style={styles.primaryButtonText}>
              {props.todayAnswered >= props.goal ? t('study.practiceAgain') : t('study.start')}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card, props.isDesktop && styles.readyCol]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('study.todayTopic')}</Text>
          <Text style={[styles.body, { color: colors.text }]}>{props.todayBody}</Text>
        </View>
      </View>
    </View>
  );
}

function QuizView(props: {
  item: StudyItem;
  courseColor: string;
  index: number;
  total: number;
  selected: number | null;
  answered: boolean;
  onChoose: (i: number) => void;
  onNext: () => void;
  isLast: boolean;
  isDesktop: boolean;
}) {
  const colors = useTheme();
  const { t } = useI18n();
  const { item, answered, selected } = props;
  const { resolved } = useThemePreference();

  // 桌面端：左侧知识点栏 + 右侧答题栏
  const knowledgePane = (
    <View style={props.isDesktop && styles.quizPane}>
      <View style={[styles.badge, { backgroundColor: props.courseColor }]}>
        <Text style={styles.badgeText}>{item.subject}</Text>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
        <Text style={[styles.body, { color: colors.text }]}>{item.body}</Text>
      </View>
    </View>
  );

  const quizPane = (
    <View style={props.isDesktop && styles.quizPane}>
      <Text style={[styles.question, { color: colors.text }]}>{item.question}</Text>

      <View style={styles.options}>
        {item.options.map((opt, i) => {
          const isSelected = selected === i;
          const isAnswer = i === item.answerIndex;
          let bg = colors.backgroundElement;
          let border = colors.border;
          if (answered) {
            if (isAnswer) {
              bg = colors.successBg;
              border = colors.success;
            } else if (isSelected) {
              bg = colors.errorBg;
              border = colors.error;
            }
          }
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: bg, borderColor: border },
                pressed && !answered && styles.pressed,
              ]}
              onPress={() => props.onChoose(i)}
              disabled={answered}>
              <Text style={[styles.optionText, { color: colors.text }]}>
                {String.fromCharCode(65 + i)}. {opt}
              </Text>
              {answered && isAnswer && <Text style={styles.mark}>✓</Text>}
              {answered && isSelected && !isAnswer && <Text style={[styles.mark, styles.markWrong]}>✗</Text>}
            </Pressable>
          );
        })}
      </View>

      {answered && (
        <View
          style={[
            styles.explanation,
            { backgroundColor: selected === item.answerIndex ? colors.successBg : colors.errorBg },
          ]}>
          <Text
            style={[
              styles.explanationTitle,
              {
                color:
                  selected === item.answerIndex
                    ? resolved === 'dark'
                      ? '#b7eb8f'
                      : '#237804'
                    : resolved === 'dark'
                      ? '#ffa39e'
                      : '#a8071a',
              },
            ]}>
            {selected === item.answerIndex ? t('quiz.correct') : t('quiz.answerIs', { letter: String.fromCharCode(65 + item.answerIndex) })}
          </Text>
          <Text style={[styles.explanationText, { color: colors.text }]}>{item.explanation}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: props.courseColor },
              pressed && styles.pressed,
            ]}
            onPress={props.onNext}>
            <Text style={styles.primaryButtonText}>{props.isLast ? t('quiz.summary') : t('quiz.next')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (!props.isDesktop) {
    return (
      <View style={styles.quizWrap}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {t('quiz.progress', { current: props.index + 1, total: props.total })}
          </Text>
          <Text style={[styles.skillTag, { color: props.courseColor }]}>{item.skill}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.fillTertiary }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: props.courseColor, width: `${((props.index + (answered ? 1 : 0)) / props.total) * 100}%` },
            ]}
          />
        </View>
        {knowledgePane}
        {quizPane}
      </View>
    );
  }

  return (
    <View style={styles.quizWrap}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          {t('quiz.progress', { current: props.index + 1, total: props.total })}
        </Text>
        <Text style={[styles.skillTag, { color: props.courseColor }]}>{item.skill}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.fillTertiary }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: props.courseColor, width: `${((props.index + (answered ? 1 : 0)) / props.total) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.quizCols}>
        {knowledgePane}
        {quizPane}
      </View>
    </View>
  );
}

function DoneView(props: {
  course: Course;
  courseColor: string;
  correctCount: number;
  total: number;
  masteryBefore: { percent: number };
  answersAfter: AnswerRecord[];
  onFinish: () => void;
}) {
  const colors = useTheme();
  const { t } = useI18n();
  const after = computeMastery(props.course, props.answersAfter);
  const rate = props.total > 0 ? Math.round((props.correctCount / props.total) * 100) : 0;
  return (
    <View style={styles.readyWrap}>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
        <Text style={[styles.doneEmoji, { textAlign: 'center' }]}>
          {rate >= 80 ? '🏆' : rate >= 50 ? '👍' : '💪'}
        </Text>
        <Text style={[styles.readyTitle, { color: colors.text, textAlign: 'center' }]}>
          {t('done.title', { correct: props.correctCount, total: props.total })}
        </Text>
        <Text style={[styles.readyBody, { color: colors.textSecondary, textAlign: 'center' }]}>
          {t('done.accuracy', { rate, before: props.masteryBefore.percent, after: after.percent })}
        </Text>
        <Text style={[styles.readyBody, { color: colors.textSecondary, textAlign: 'center' }]}>
          {t('done.reviewTomorrow', { total: props.total })}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: props.courseColor },
            pressed && styles.pressed,
          ]}
          onPress={props.onFinish}>
          <Text style={styles.primaryButtonText}>{t('done.finish')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  courseSwitcher: { flexDirection: 'row', gap: Spacing.two },
  courseChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  courseChipText: { fontSize: 13, fontWeight: '700' },
  courseName: { fontSize: 12, marginTop: -Spacing.two },
  readyWrap: { gap: Spacing.three },
  readyCols: { gap: Spacing.three },
  readyColsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  readyCol: { flex: 1 },
  quizCols: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  quizPane: { flex: 1, gap: Spacing.three },
  badge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  readyTitle: { fontSize: 22, fontWeight: '800' },
  readyBody: { fontSize: 13, lineHeight: 20 },
  primaryButton: {
    borderRadius: Radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 23 },
  title: { fontSize: 24, fontWeight: '800' },
  quizWrap: { gap: Spacing.three },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 13, fontWeight: '700' },
  skillTag: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  question: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  options: { gap: Spacing.two },
  option: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 15, flex: 1 },
  mark: { fontSize: 18, color: '#52c41a', fontWeight: '900' },
  markWrong: { color: '#ff4d4f' },
  pressed: { opacity: 0.8 },
  explanation: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  explanationTitle: { fontSize: 15, fontWeight: '800' },
  explanationText: { fontSize: 14, lineHeight: 21 },
  doneEmoji: { fontSize: 48 },
});
