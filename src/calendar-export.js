function escapeText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function localTimestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}
function fold(line) {
  const encoder = new TextEncoder();
  let result = '', bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += char; bytes += size;
  }
  return result;
}
export function scheduleCalendar(items, now = new Date()) {
  if (!Array.isArray(items) || !(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('无法生成日历');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OtakuNeko//Watch Schedule//ZH', 'CALSCALE:GREGORIAN'];
  for (const item of items) {
    if (typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/.test(item.id) || typeof item.title !== 'string' || !Number.isInteger(item.weekday) || item.weekday < 1 || item.weekday > 7 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.watchTime) || !Number.isInteger(item.duration) || item.duration < 1 || item.duration > 1440) throw new Error('时间表数据无效，无法导出');
    const [hour, minute] = item.watchTime.split(':').map(Number);
    // UTC arithmetic preserves floating wall times even across a local DST transition.
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + (item.weekday - ((now.getDay() + 6) % 7 + 1) + 7) % 7, hour, minute));
    const end = new Date(start.getTime() + item.duration * 60000);
    lines.push('BEGIN:VEVENT', `UID:${item.id}@otakuneko`, `DTSTAMP:${stamp}`, `DTSTART:${localTimestamp(start)}`, `DTEND:${localTimestamp(end)}`, 'RRULE:FREQ=WEEKLY', `SUMMARY:${escapeText(item.title)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
