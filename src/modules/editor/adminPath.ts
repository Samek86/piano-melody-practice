export function isAdminLocation(loc: { pathname: string; hash: string }): boolean {
  const path = (loc.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/admin' || path.endsWith('/admin')) return true;
  const hash = (loc.hash || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .replace(/\/+$/, '');
  return hash === 'admin';
}
