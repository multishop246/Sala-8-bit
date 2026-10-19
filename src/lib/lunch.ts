export const lunchOverdue = (state: string | undefined, since: number, now: number) =>
  state === 'almoco' && Number.isFinite(since) && now - since >= 60 * 60 * 1000;
