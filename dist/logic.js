/* Shared, pure selection logic. Also used by the repository's tests. */
(() => {
  const DAY = 86400000;
  const isNew = (o, now, days = 7) => {
    const added = Date.parse(o.addedAt);
    return added <= now && added > now - days * DAY;
  };
  const today = (now,zone='Asia/Kolkata') => new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const isClosed = (o, now) => Boolean(o.entryStatus === 'closed' || (o.deadline !== null && Date.parse(o.deadline) <= now) || (o.deadlineDate && today(now,o.deadlineTimezone) > o.deadlineDate));
  const entryStatus = (o,now) => isClosed(o,now) ? 'closed' : o.opensOn && today(now) < o.opensOn ? 'upcoming' : o.entryStatus === 'upcoming' && (!o.opensOn || today(now) < o.opensOn) ? 'upcoming' : o.entryStatus === 'check' ? 'check' : 'open';
  const deadlineValue = o => o.deadline !== null ? Date.parse(o.deadline) : o.deadlineDate ? Date.parse(o.deadlineDate+'T00:00:00Z') : Infinity;
  const isActionable = (o,now) => entryStatus(o,now) === 'open';
  function rank(items, sort = 'prestige') {
    return [...items].sort((a,b) => {
      let result;
      if (sort === 'prize') result = b.prizeUsd - a.prizeUsd || b.organizer.prestige - a.organizer.prestige;
      else if (sort === 'deadline') result = deadlineValue(a) - deadlineValue(b) || b.organizer.prestige - a.organizer.prestige;
      else if (sort === 'newest') result = Date.parse(b.addedAt) - Date.parse(a.addedAt) || b.organizer.prestige - a.organizer.prestige;
      else result = b.organizer.prestige - a.organizer.prestige || b.prizeUsd - a.prizeUsd;
      return result || deadlineValue(a) - deadlineValue(b) || a.title.localeCompare(b.title);
    });
  }
  function select(items, state, saved, now, newWindowDays = 7) {
    const query = (state.search || '').trim().toLowerCase();
    return rank(items.filter(o => {
      if (state.view === 'new' && !isNew(o, now, newWindowDays)) return false;
      if (state.view === 'saved' && !saved.has(o.id)) return false;
      const status=entryStatus(o,now);
      if (state.status === 'open' && state.view !== 'saved' && status !== 'open') return false;
      if (['upcoming','check','closed'].includes(state.status) && status !== state.status) return false;
      if (state.status === 'closing' && (!isActionable(o,now) || deadlineValue(o) === Infinity || deadlineValue(o) > now + 7 * DAY)) return false;
      if (state.category !== 'all' && o.category !== state.category && !(o.categories || []).includes(state.category)) return false;
      if (state.kind !== 'all' && o.organizer.kind !== state.kind) return false;
      if (state.format !== 'all' && o.format !== state.format) return false;
      if (state.team === 'solo' && (!o.team || o.team.min > 1)) return false;
      if (state.team === 'team' && (!o.team || o.team.min === 1)) return false;
      if (query && ![o.title,o.summary,o.organizer.name,o.category,o.location,o.eligibility,...o.tags].join(' ').toLowerCase().includes(query)) return false;
      return true;
    }), state.sort);
  }
  globalThis.OpenCall = { DAY, isNew, isClosed, isActionable, entryStatus, rank, select };
})();
