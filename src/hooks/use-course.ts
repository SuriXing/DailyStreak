import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { COURSES, getCourse, type Course } from '@/data/courses';

const COURSE_KEY = 'dailystreak.course';

/** 当前选择的课程，本地持久化（换设备不迁移，属于轻偏好） */
export function useCourse(): [Course, (id: string) => void] {
  const [courseId, setCourseIdState] = useState<string>(COURSES[0].id);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(COURSE_KEY).then((stored) => {
      if (active && stored) setCourseIdState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setCourseId = useCallback((id: string) => {
    setCourseIdState(id);
    AsyncStorage.setItem(COURSE_KEY, id).catch(() => {});
  }, []);

  return [getCourse(courseId), setCourseId];
}
