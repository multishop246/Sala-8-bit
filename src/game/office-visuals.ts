/** Purely decorative state: never writes tasks, presence, productivity or reports. */
export function visualHash(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export const ROBOT_DURATION = 15 * 60_000;
/** One shared daily window, stable across reloads and all members of an office. */
export function printerWindow(now: number, office: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  const start = Date.parse(`${day}T08:00:00-03:00`) + (visualHash(office + day) % (9 * 60)) * 60_000;
  return { day, start, end: start + ROBOT_DURATION, active: now >= start && now < start + ROBOT_DURATION };
}
export const STUDIO_ROLES = ['camera', 'stories', 'director', 'microphone'] as const;
export type StudioRole = typeof STUDIO_ROLES[number];
export const studioRole = (person: string, visit: number): StudioRole => STUDIO_ROLES[visualHash(`${person}:${visit}`) % STUDIO_ROLES.length];
