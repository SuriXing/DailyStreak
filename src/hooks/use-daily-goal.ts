import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const DAILY_GOALS = [3, 5, 10] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

const GOAL_KEY = 'dailystreak.goal';
const DEFAULT_GOAL: DailyGoal = 5;

/** 每日题量档位（3 保底 / 5 默认 / 10 进阶），本地持久化 */
export function useDailyGoal(): [DailyGoal, (g: DailyGoal) => void] {
  const [goal, setGoalState] = useState<DailyGoal>(DEFAULT_GOAL);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(GOAL_KEY).then((stored) => {
      if (active && stored && (DAILY_GOALS as readonly number[]).includes(Number(stored))) {
        setGoalState(Number(stored) as DailyGoal);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setGoal = useCallback((g: DailyGoal) => {
    setGoalState(g);
    AsyncStorage.setItem(GOAL_KEY, String(g)).catch(() => {});
  }, []);

  return [goal, setGoal];
}
