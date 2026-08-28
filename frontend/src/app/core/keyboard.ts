export function sendOnEnter(event: KeyboardEvent, send: () => void): void {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  send();
}

export function overlayIsOpen(): boolean {
  return !!document.querySelector('.cdk-overlay-container .cdk-overlay-pane');
}

/** Parent route for Esc navigation, or null when already at a root screen. */
export function parentRoute(url: string): string | null {
  const [path, query] = url.split('?');
  if (/^\/tickets\/[^/]+$/.test(path)) return '/tickets';
  if (path === '/tickets/new') return '/tickets';
  if (path === '/account') return '/dashboard';
  if (path === '/support') return '/dashboard';
  if (path.startsWith('/admin/')) return '/dashboard';
  if (path === '/tickets' && query) return '/tickets';
  return null;
}
