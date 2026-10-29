import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleCalendar } from '../src/calendar-export.js';

test('calendar export uses weekly floating local times, escapes titles, and folds long UTF-8 lines', () => {
  const date = new Date(2026, 9, 26, 12, 0); // Monday in the user's local calendar
  const output = scheduleCalendar([{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: `动画,${'番'.repeat(30)};\nEND:VEVENT`, weekday: 1, watchTime: '23:50', duration: 30 }], date);
  assert.match(output, /DTSTART:20261026T235000\r\nDTEND:20261027T002000/);
  assert.match(output, /RRULE:FREQ=WEEKLY/);
  assert.match(output, /SUMMARY:动画\\,/);
  assert.ok(output.includes('\\;\\nEND:VEVENT'));
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(output.split('BEGIN:VEVENT').length - 1, 1);
  assert.throws(() => scheduleCalendar([{ id: 'bad' }], date), /无效/);
});
