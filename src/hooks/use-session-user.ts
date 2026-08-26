import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export function useSessionUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) return;
    // getSession 是本地读取（AsyncStorage/localStorage），不走网络，
    // 避免慢网络下 getUser() 挂起导致页面无限转圈；token 校验由后续请求自动完成。
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setUser(data.session?.user ?? null);
      });
    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, s) => {
      if (active) setUser(s?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return user;
}
