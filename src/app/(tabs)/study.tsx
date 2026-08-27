import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COURSES, getTodayItem } from '@/data/courses';
import { useCourse } from '@/hooks/use-course';
import { Radius, Shadows, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function StudyScreen() {
  const colors = useTheme();
  const [course, setCourseId] = useCourse();
  const item = getTodayItem(course);
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const correct = selected === item.answerIndex;

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
                accessibilityLabel={`切换到${c.name}`}
                accessibilityState={{ selected: active }}>
                <Text style={[styles.courseChipText, { color: active ? '#fff' : colors.text }]}>
                  {c.shortName}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.courseName, { color: colors.textSecondary }]}>
          {course.name} · {course.description}
        </Text>

        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: course.color }]}>
            <Text style={styles.badgeText}>{course.shortName}</Text>
          </View>
          <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
            Day {item.day} · 每日一学
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }, Shadows.card]}>
          <Text style={[styles.body, { color: colors.text }]}>{item.body}</Text>
        </View>

        <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>小测验</Text>
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
                onPress={() => !answered && setSelected(i)}
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
              { backgroundColor: correct ? colors.successBg : colors.errorBg },
            ]}>
            <Text style={[styles.explanationTitle, { color: correct ? '#237804' : '#a8071a' }]}>
              {correct ? '🎉 答对了！' : '💡 正确答案是 ' + String.fromCharCode(65 + item.answerIndex)}
            </Text>
            <Text style={[styles.explanationText, { color: colors.text }]}>{item.explanation}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  courseSwitcher: { flexDirection: 'row', gap: Spacing.two },
  courseChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  courseChipText: { fontSize: 13, fontWeight: '700' },
  courseName: { fontSize: 12, marginTop: -Spacing.two },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  badge: { borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dayLabel: { fontSize: 13 },
  title: { fontSize: 24, fontWeight: '800' },
  card: { borderRadius: Radius.lg, padding: Spacing.three },
  body: { fontSize: 15, lineHeight: 23 },
  questionLabel: { fontSize: 12, fontWeight: '700', marginTop: Spacing.two },
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
  explanation: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.one },
  explanationTitle: { fontSize: 15, fontWeight: '800' },
  explanationText: { fontSize: 14, lineHeight: 21 },
});
