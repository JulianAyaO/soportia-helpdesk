export function relativeTime(value: string | number | Date | null | undefined, now = Date.now()): string {
  if (value == null || value === '') return '—';
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return minutes === 1 ? 'hace 1 min' : `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'hace 1 h' : `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 d' : `hace ${days} d`;
}
