'use client';

import { useEffect, useState } from 'react';

export function useIsManager() {
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsManager(false);
      setLoading(false);
      return;
    }
    void fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const role = data?.user?.role ?? data?.role;
        setIsManager(role === 'manager');
        if (role) localStorage.setItem('userRole', role);
      })
      .catch(() => setIsManager(false))
      .finally(() => setLoading(false));
  }, []);

  return { isManager, loading };
}
