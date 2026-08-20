import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getTodayItem } from '@/data/content';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 内容起始日：从这一天开始按天轮换内容（第 1 天 → 今天） */
const CONTENT_START = new Date(2025, 7, 30);

export default function StudyScreen() {
  const colors = useTheme();
  const item = getTodayItem(CONTENT_START);
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const correct = selected === item.answerIndex;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.badge,
              { backgroundColor: item.subject === 'CSA' ? '#1CB0F6' : '#CE82FF' },
            ]}>
            <Text style={styles.badgeText}>AP {item.subject}</Text>
          </View>
          <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
            Day {item.day} · 每日一学
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.body, { color: colors.text }]}>{item.body}</Text>
        </View>

        <Text style={[styles.questionLabel, { color: colors.textSecondary }]}>小测验</Text>
        <Text style={[styles.question, { color: colors.text }]}>{item.question}</Text>

        <View style={styles.options}>
          {item.options.map((opt, i) => {
            const isSelected = selected === i;
            const isAnswer = i === item.answerIndex;
            let bg = colors.backgroundElement;
            let border = 'transparent';
            if (answered) {
              if (isAnswer) {
                bg = '#D7FFB8';
                border = '#58CC02';
              } else if (isSelected) {
                bg = '#FFD7D7';
                border = '#EA2B2B';
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
              { backgroundColor: correct ? '#D7FFB8' : '#FFD7D7' },
            ]}>
            <Text style={[styles.explanationTitle, { color: '#333' }]}>
              {correct ? '🎉 答对了！' : '💡 正确答案是 ' + String.fromCharCode(65 + item.answerIndex)}
            </Text>
            <Text style={styles.explanationText}>{item.explanation}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dayLabel: { fontSize: 13 },
  title: { fontSize: 24, fontWeight: '800' },
  card: { borderRadius: 16, padding: Spacing.three },
  body: { fontSize: 15, lineHeight: 23 },
  questionLabel: { fontSize: 12, fontWeight: '700', marginTop: Spacing.two },
  question: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  options: { gap: Spacing.two },
  option: {
    borderRadius: 12,
    borderWidth: 2,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 15, flex: 1 },
  mark: { fontSize: 18, color: '#58CC02', fontWeight: '900' },
  markWrong: { color: '#EA2B2B' },
  pressed: { opacity: 0.8 },
  explanation: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  explanationTitle: { fontSize: 15, fontWeight: '800' },
  explanationText: { fontSize: 14, lineHeight: 21, color: '#333' },
});
