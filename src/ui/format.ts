const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Today", "Yesterday", then "Mon 2 Nov" (with the year when it isn't this year). */
export function relativeDay(day: string | null): string {
  if (!day) return 'Date unknown';
  const date = parseDay(day);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((start - date.getTime()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const base = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export const monthName = (m: number) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];

/** A release day or month for a "not out yet" tag: "10 Feb 2027" or "Feb 2027"; empty when unknown. */
export function releaseLabel(on: string | null | undefined): string {
  if (!on) return '';
  const [y, m, d] = on.split('-').map(Number);
  if (!y || !m) return on;
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}
