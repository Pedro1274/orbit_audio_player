export function shuffled(ids, current, random = Math.random) {
  const rest = ids.filter(id => id !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return current != null && ids.includes(current) ? [current, ...rest] : rest;
}
export function nextTrack(order, current, repeat, ended = false) {
  if (!order.length) return null;
  if (ended && repeat === 'one' && order.includes(current)) return current;
  const position = order.indexOf(current);
  if (position + 1 < order.length) return order[position + 1];
  return repeat === 'all' ? order[0] : null;
}
export const formatTime = value => Number.isFinite(value) && value >= 0 ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '—:—';
