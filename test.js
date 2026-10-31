const E = require('./engine.js');
const assert = require('assert');
const z = (y, m, d, h, mi = 0) => E.zoned(y, m, d, h, mi);
let pass = 0;
function check(name, got, want) { assert.strictEqual(got, want, `${name}: got ${got}, want ${want}`); pass++; console.log('ok -', name); }

// Setup: start Thu Oct 22 2026, budget $50/day, daily reset 3:00, first pay reset Thu Nov 5 23:00
function base() {
  return {
    settings: {
      budgetHistory: [{ at: 0, amount: 5000, scope: 'permanent' }],
      resetTimeHistory: [{ at: 0, hour: 3, minute: 0 }],
      scheduleHistory: [{ at: 0, startDate: '2026-10-22', resetAt: z(2026, 11, 5, 23) }]
    },
    entries: []
  };
}
const spend = (st, t, c) => st.entries.push({ id: String(t), at: t, amount: c, note: '' });

let s = base();
check('before 3am on start day: not started', E.compute(s, z(2026, 10, 22, 2)).started, false);
check('day 1 full budget', E.compute(s, z(2026, 10, 22, 10)).remaining, 5000);
spend(s, z(2026, 10, 22, 12), 2000);
check('day 1 after $20 spend', E.compute(s, z(2026, 10, 22, 13)).remaining, 3000);
check('2:59am still day 1', E.compute(s, z(2026, 10, 23, 2, 59)).remaining, 3000);
check('day 2 surplus rolls over', E.compute(s, z(2026, 10, 23, 4)).remaining, 8000);
check('carry in shown', E.compute(s, z(2026, 10, 23, 4)).carryIn, 3000);
spend(s, z(2026, 10, 23, 18), 15000);
check('day 2 overspend goes negative', E.compute(s, z(2026, 10, 23, 19)).remaining, -7000);
check('day 3 overspend carries', E.compute(s, z(2026, 10, 24, 4)).remaining, -2000);
check('day 4 recovers', E.compute(s, z(2026, 10, 25, 4)).remaining, 3000);

// Period reset: positive wiped
s = base();
// through Nov 5 3am = 15 credits of $50, no spending
check('Nov 5 before period reset, surplus accumulated', E.compute(s, z(2026, 11, 5, 22)).remaining, 15 * 5000);
check('Nov 5 23:30 after period reset, surplus wiped', E.compute(s, z(2026, 11, 5, 23, 30)).remaining, 0);
check('Nov 6 new day fresh budget only', E.compute(s, z(2026, 11, 6, 4)).remaining, 5000);

// Period reset: negative carries
s = base();
spend(s, z(2026, 11, 5, 12), 15 * 5000 + 12000); // overspend by $120 total
check('negative carries through period reset', E.compute(s, z(2026, 11, 5, 23, 30)).remaining, -12000);
check('negative keeps reducing next period', E.compute(s, z(2026, 11, 6, 4)).remaining, -7000);
check('next period end is 14 days later', E.compute(s, z(2026, 11, 6, 4)).periodEnd, z(2026, 11, 19, 23));

// Mid-period budget change: forward only, reverts at period end
s = base();
const changeAt = z(2026, 10, 25, 12);
s.settings.budgetHistory.push({ at: changeAt, amount: 3000, scope: 'period', until: E.nextPeriodBoundary(s.settings, changeAt) });
check('change does not alter past days', E.compute(s, z(2026, 10, 25, 13)).remaining, 4 * 5000);
check('next day uses new amount', E.compute(s, z(2026, 10, 26, 4)).remaining, 4 * 5000 + 3000);
check('budget reverts after period reset', E.budgetAt(s.settings, z(2026, 11, 6, 3)), 5000);
check('override active on Nov 5', E.budgetAt(s.settings, z(2026, 11, 5, 3)), 3000);

// Permanent change
s = base();
s.settings.budgetHistory.push({ at: z(2026, 10, 25, 12), amount: 4000, scope: 'permanent' });
check('permanent change persists into next period', E.budgetAt(s.settings, z(2026, 11, 20, 3)), 4000);

// DST: Nov 1 2026 fall back. Reset should stay at 3:00 local
s = base();
const b = E.dailyBoundaries(s.settings, z(2026, 11, 3, 12));
const p = E.parts(b.find(t => E.parts(t).d === 2));
check('3am reset after DST change stays 3am', p.h, 3);
check('one credit per day across DST', b.length, 13); // Oct 22..Nov 3

// Daily reset time change applies forward
s = base();
s.settings.resetTimeHistory.push({ at: z(2026, 10, 24, 12), hour: 5, minute: 0 });
check('old reset time used before change', E.compute(s, z(2026, 10, 24, 4)).remaining, 3 * 5000);
check('new reset time: 4am Oct 25 still previous day', E.compute(s, z(2026, 10, 25, 4)).remaining, 3 * 5000);
check('new reset time: 5am Oct 25 credits', E.compute(s, z(2026, 10, 25, 5)).remaining, 4 * 5000);

// Schedule change applies forward
s = base();
s.settings.scheduleHistory.push({ at: z(2026, 10, 28, 12), startDate: '2026-10-29', resetAt: z(2026, 11, 12, 23) });
check('period end moved by schedule change', E.compute(s, z(2026, 10, 30, 4)).periodEnd, z(2026, 11, 12, 23));

// Edit / delete recalculates
s = base();
spend(s, z(2026, 10, 22, 12), 2000);
s.entries[0].amount = 1000;
check('edit recalculates', E.compute(s, z(2026, 10, 22, 13)).remaining, 4000);
s.entries = [];
check('delete recalculates', E.compute(s, z(2026, 10, 22, 13)).remaining, 5000);

// Start fresh: rebuild settings from a new start date; old spends stop counting
s = base();
spend(s, z(2026, 10, 23, 12), 9000);
s.settings = {
  budgetHistory: [{ at: 0, amount: 4000, scope: 'permanent' }],
  resetTimeHistory: [{ at: 0, hour: 3, minute: 0 }],
  scheduleHistory: [{ at: 0, startDate: '2026-10-30', resetAt: z(2026, 11, 5, 23) }]
};
check('start fresh: new budget applies on new start day', E.compute(s, z(2026, 10, 30, 17)).remaining, 4000);
spend(s, z(2026, 10, 30, 12), 1500);
check('start fresh: new spends count', E.compute(s, z(2026, 10, 30, 17)).remaining, 2500);
check('start fresh: old spend kept as uncounted', E.history(s, z(2026, 10, 30, 17)).uncounted.length, 1);

// History by day
s = base();
spend(s, z(2026, 10, 22, 12), 2000);
spend(s, z(2026, 10, 23, 9), 7000);
spend(s, z(2026, 10, 23, 14), 1000);
const h = E.history(s, z(2026, 10, 24, 10)).days;
check('history: one row per day, newest first', h.length, 3);
check('history: Oct 23 spent', h[1].spent, 8000);
check('history: Oct 23 entries', h[1].entries.length, 2);
check('history: Oct 23 carry in', h[1].carryIn, 3000);
check('history: Oct 23 ending balance', h[1].endBalance, 0);
check('history: today matches compute', h[0].endBalance, E.compute(s, z(2026, 10, 24, 10)).remaining);

console.log(`\n${pass} checks passed`);
