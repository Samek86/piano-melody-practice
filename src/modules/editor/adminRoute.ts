import { useEffect, useState } from 'react';
import { isAdminLocation } from './adminPath';

export function useAdminRoute(): boolean {
  const [active, setActive] = useState(() => isAdminLocation(window.location));
  useEffect(() => {
    const sync = () => setActive(isAdminLocation(window.location));
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  return active;
}

export function leaveAdmin(): void {
  let path = window.location.pathname || '/';
  if (path.replace(/\/+$/, '').endsWith('/admin')) {
    path = path.replace(/\/admin\/?$/, '') || '/';
  }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
