import { StyleSheet, Text, View } from 'react-native';

import { buildWeekGrid } from '@/lib/checkins';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  checkedSet: Set<string>;
  /** 完成当日题量的日期（比仅打卡更深一档） */
  completedSet: Set<string>;
  weeks?: number;
}

const CELL = 13;
const GAP = 4;

/** GitHub 风格热力图：每列一周（周一在顶），最后一列是本周，今天有橙色描边 */
export function StreakCalendar({ checkedSet, completedSet, weeks = 12 }: Props) {
  const colors = useTheme();
  const cells = buildWeekGrid(checkedSet, completedSet, weeks);
  const todayKey = cells[cells.length - 1].dateKey;

  return (
    <View style={styles.wrap}>
      <View style={styles.weekdayLabels}>
        {['一', '三', '五', '日'].map((d) => (
          <View key={d} style={{ height: CELL, justifyContent: 'center' }}>
            <Text style={styles.labelText}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((c) => {
          const isToday = c.dateKey === todayKey;
          return (
            <View
              key={c.dateKey}
              style={[
                styles.cell,
                {
                  backgroundColor: c.completed
                    ? colors.success
                    : c.checked
                      ? '#B7EB8F'
                      : colors.fillTertiary,
                  borderColor: isToday ? colors.warning : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  weekdayLabels: { gap: GAP, paddingTop: 1 },
  labelText: { fontSize: 9, color: '#8c8c8c' },
  grid: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    gap: GAP,
    height: 7 * CELL + 6 * GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
    borderWidth: 1.5,
  },
});
