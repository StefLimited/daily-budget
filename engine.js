// Daily Budget engine. All money in integer cents. All schedule times in America/Los_Angeles.
(function (root) {
  const TZ = 'America/Los_Angeles';
  const DAY_STEP = 14; // pay period length in days

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  function parts(ms) {
    const o = {};
    for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = +p.value;
    return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
  }
  function offset(ms) {
    const p = parts(ms);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }
  // Pacific wall-clock time -> epoch ms
  function zoned(y, m, d, h, mi) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let r = guess - offset(guess);
    const o2 = offset(r);
    if (guess - o2 !== r) r = guess - o2;
    return r;
  }
  function addDays(y, m, d, n) {
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return { y, m, d }; }

  function sortAt(a) { return [...a].sort((x, y) => x.at - y.at); }

  function trackingStart(s) {
    const sch = sortAt(s.scheduleHistory)[0];
    const rt = sortAt(s.resetTimeHistory)[0];
    const d = parseDate(sch.startDate);
    return zoned(d.y, d.m, d.d, rt.hour, rt.minute);
  }

  // Daily reset moments in (prevBoundary, to]. Reset-time changes apply forward only.
  function dailyBoundaries(s, to) {
    const hist = sortAt(s.resetTimeHistory);
    const start = trackingStart(s);
    const out = [];
    let cur = parts(start);
    let date = { y: cur.y, m: cur.m, d: cur.d };
    let prev = -Infinity;
    for (let guard = 0; guard < 5000; guard++) {
      let chosen = null;
      for (let i = 0; i < hist.length; i++) {
        const c = zoned(date.y, date.m, date.d, hist[i].hour, hist[i].minute);
        const nextAt = i + 1 < hist.length ? hist[i + 1].at : Infinity;
        if (hist[i].at <= c && c < nextAt) { chosen = c; break; }
      }
      if (chosen === null) {
        // a change skipped over today's reset; use the newest rule in effect by end of day
        const eod = zoned(date.y, date.m, date.d, 23, 59);
        const last = hist.filter(h => h.at <= eod).pop();
        if (last) chosen = zoned(date.y, date.m, date.d, last.hour, last.minute);
      }
      if (chosen !== null && chosen > to) break;
      if (chosen !== null && chosen >= start && chosen > prev) { out.push(chosen); prev = chosen; }
      date = addDays(date.y, date.m, date.d, 1);
      if (zoned(date.y, date.m, date.d, 0, 0) > to + 86400000 * 2) break;
    }
    return out;
  }

  // Pay period reset moments, from each schedule entry forward, every 14 days at the same wall time.
  function periodBoundaries(s, to) {
    const hist = sortAt(s.scheduleHistory);
    const start = trackingStart(s);
    const out = [];
    for (let i = 0; i < hist.length; i++) {
      const lo = Math.max(hist[i].at, start);
      const hi = i + 1 < hist.length ? hist[i + 1].at : Infinity;
      const p = parts(hist[i].resetAt);
      // the payday date can be any past or future payday; step every 14 days in both directions from it
      const kStart = Math.floor((lo - hist[i].resetAt) / (DAY_STEP * 86400000)) - 1;
      for (let k = kStart; k < kStart + 2000; k++) {
        const dd = addDays(p.y, p.m, p.d, k * DAY_STEP);
        const t = zoned(dd.y, dd.m, dd.d, p.h, p.mi);
        if (t >= hi || t > to) break;
        if (t >= lo && t > start) out.push(t);
      }
    }
    return out.sort((a, b) => a - b);
  }

  function nextPeriodBoundary(s, now) {
    const list = periodBoundaries(s, now + 86400000 * 400);
    return list.find(t => t > now) ?? null;
  }

  function budgetAt(s, t) {
    let base = 0, override = null;
    for (const b of sortAt(s.budgetHistory)) {
      if (b.at > t) break;
      if (b.scope === 'period') override = { amount: b.amount, until: b.until };
      else { base = b.amount; override = null; }
    }
    return override && t < override.until ? override.amount : base;
  }

  // Weekend bump: extra per day on Saturday and Sunday. Applies forward from each change.
  function bumpAt(s, t) {
    let v = 0;
    for (const b of sortAt(s.weekendHistory || [])) { if (b.at > t) break; v = b.amount; }
    return v;
  }
  function weekday(t) { const p = parts(t); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }

  // Single pass over pay resets, daily credits and spends.
  // Weekend bump rules: weekend spending counts against the weekend's regular daily budgets first,
  // then the bump. Whatever bump is unspent when the next weekday starts is removed, so it never
  // carries into the week. Overspending carried in from the week still reduces the weekend.
  function walk(state, now) {
    const s = state.settings;
    const start = trackingStart(s);
    const events = [];
    for (const t of periodBoundaries(s, now)) events.push({ t, k: 0 });
    for (const t of dailyBoundaries(s, now)) {
      const dow = weekday(t), weekend = dow === 6 || dow === 0;
      events.push({ t, k: 1, amt: budgetAt(s, t), bump: weekend ? bumpAt(s, t) : 0, weekend });
    }
    for (const e of state.entries) if (e.at >= start && e.at <= now) events.push({ t: e.at, k: 2, e });
    events.sort((a, b) => a.t - b.t || a.k - b.k);
    const days = [];
    let bal = 0, pool = 0, wkBase = 0, wkSpend = 0, cur = null, lastPeriod = null;
    for (const ev of events) {
      if (ev.k === 0) {
        if (bal > 0) bal = 0;
        lastPeriod = ev.t;
        if (cur) cur.periodReset = true;
      } else if (ev.k === 1) {
        if (!ev.weekend && pool > 0) {
          const unspentBump = Math.max(0, pool - Math.max(0, wkSpend - wkBase));
          const dropped = Math.min(Math.max(bal, 0), unspentBump);
          bal -= dropped;
          if (cur) cur.bumpDropped = dropped;
        }
        if (!ev.weekend) { pool = 0; wkBase = 0; wkSpend = 0; }
        if (cur) cur.endBalance = bal;
        cur = { start: ev.t, budget: ev.amt, bump: ev.bump, weekend: ev.weekend, carryIn: bal, spent: 0,
                entries: [], periodReset: false, bumpDropped: 0 };
        days.push(cur);
        bal += ev.amt + ev.bump;
        if (ev.weekend) { pool += ev.bump; wkBase += ev.amt; }
      } else if (cur) {
        bal -= ev.e.amount; cur.spent += ev.e.amount; cur.entries.push(ev.e);
        if (cur.weekend) wkSpend += ev.e.amount;
      }
    }
    if (cur) cur.endBalance = bal;
    return { days, bal, lastPeriod, start, cur };
  }

  function compute(state, now) {
    const s = state.settings;
    const w = walk(state, now);
    const cur = w.cur;
    const todays = cur ? [...cur.entries].sort((a, b) => b.at - a.at) : [];
    const futureDaily = dailyBoundaries(s, now + 86400000 * 3).find(t => t > now) ?? null;
    return {
      started: now >= w.start,
      trackingStart: w.start,
      remaining: w.bal,
      carryIn: cur ? cur.carryIn : 0,
      todayBudget: cur ? cur.budget + cur.bump : 0,
      todayBump: cur ? cur.bump : 0,
      spentToday: cur ? cur.spent : 0,
      todays,
      periodStart: w.lastPeriod ?? w.start,
      periodEnd: nextPeriodBoundary(s, now),
      nextDailyReset: futureDaily,
      currentBudget: budgetAt(s, now),
      currentBump: bumpAt(s, now)
    };
  }

  // Day-by-day history, newest first. Spends before the tracking start are returned as `uncounted`.
  function history(state, now) {
    const w = walk(state, now);
    for (const d of w.days) d.entries.sort((a, b) => b.at - a.at);
    const uncounted = state.entries.filter(e => e.at < w.start).sort((a, b) => b.at - a.at);
    return { days: w.days.reverse(), uncounted };
  }

  root.BudgetEngine = { TZ, parts, zoned, addDays, compute, history, budgetAt, bumpAt, weekday, nextPeriodBoundary, trackingStart, dailyBoundaries, periodBoundaries };
  if (typeof module !== 'undefined') module.exports = root.BudgetEngine;
})(typeof window !== 'undefined' ? window : globalThis);
