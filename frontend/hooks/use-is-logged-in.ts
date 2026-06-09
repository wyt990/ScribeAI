'use client';

import { useEffect, useState } from 'react';

/** 客户端检测是否已登录（localStorage 中有 token） */
export function useIsLoggedIn() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  return loggedIn;
}
