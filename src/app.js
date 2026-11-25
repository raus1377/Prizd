(() => {
  'use strict';
  const data = window.__PRIZD_DATA__;
  if (!data) { document.getElementById('result-count').textContent = 'Data could not load. Please refresh.'; return; }
  const { isNew, isClosed, isActionable, entryStatus, rank, select, heroPicks, cardLocation, homeOrder, prizeText, prizeKind, teamText, isInternship, supportText, DAY } = window.Prizd;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const settings = data.settings;
  const opportunities = data.opportunities;
  const params = new URLSearchParams(location.search);
  const defaults = { view:'all', category:'all', kind:'all', format:'all', paid:'no', team:'all', status:'all', sort:settings.defaultSort, search:'' };
  const state = { ...defaults };
  const allowed = {view:['all','new','saved'],category:['all',...settings.categories],kind:['all','Company','College','Organization','Community'],format:['all','Online','In person','Hybrid','To confirm'],paid:['no','yes'],team:['all','solo','team'],status:['open','all','closing','upcoming','check'],sort:['featured','prestige','prize','deadline','newest']};
  for (const key of Object.keys(allowed)) if (allowed[key].includes(params.get(key))) state[key] = params.get(key);
  state.search = params.get('q') || '';
  let saved;
  let storageAvailable = true;
  try { const raw = JSON.parse(localStorage.getItem('prizd-saved-v1') || localStorage.getItem('open-call-saved-v1') || '[]'); saved = new Set(Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : []); } catch { saved = new Set(); storageAvailable = false; }
  let currentLayout = 'grid';
  try { currentLayout = (localStorage.getItem('prizd-layout') || localStorage.getItem('open-call-layout')) === 'list' ? 'list' : 'grid'; } catch { /* Browsing still works without storage. */ }
  let now = Date.now();
  let toastTimer;
  const PAGE_SIZE = 6;
  const fullCatalog = /\/opportunities\/(?:index\.html)?$/.test(location.pathname);
  const root = fullCatalog ? '../' : './';
  $('brand-name').textContent = settings.name;
  document.title = settings.seoTitle || `${settings.name} — The Opportunity Index`;
  $('footer-year').textContent = new Date().getFullYear();
  $('updated-label').textContent = `INDEX UPDATED ${new Date(data.builtAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}`;
  $('search').value = state.search;
  for (const [key,id] of [['kind','kind-filter'],['format','format-filter'],['team','team-filter'],['status','status-filter'],['sort','sort']]) $(id).value = state[key];
  const bookmark = active => `<svg width="15" height="19" viewBox="0 0 15 19" fill="${active ? 'currentColor' : 'none'}" aria-hidden="true"><path d="M2 1.5h11v15L7.5 13 2 16.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  const shortDate = value => new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}).toUpperCase();
  const statusLabel = o => ({open:'Open',upcoming:'Upcoming',check:'Check entry',closed:'Closed'}[entryStatus(o,now)]);
  function deadlineText(o) {
    const status=entryStatus(o,now);
    if (o.deadline === null && !o.deadlineDate) return {date:o.opensOn ? 'OPENS '+shortDate(o.opensOn+'T12:00:00Z') : 'DATE TO CONFIRM',remaining:statusLabel(o),urgent:false};
    const date=o.deadline || o.deadlineDate+'T12:00:00Z';
    const days=Math.ceil((Date.parse(date)-now)/DAY);
    return {date:shortDate(date),remaining:status==='closed' ? 'Entry closed' : status==='check' ? 'Check entry details' : o.deadline === null ? 'Exact time unannounced' : days<=1 ? 'Closes within 24h' : `${days} days left`,urgent:status==='open' && days>0 && days<=7};
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'),2500); }
  function syncURL() {
    const p = new URLSearchParams();
    for (const key of Object.keys(allowed)) if (state[key] !== defaults[key]) p.set(key,state[key]);
    if (state.search) p.set('q',state.search);
    const url = `${location.pathname}${p.size ? '?' + p : ''}${location.hash}`;
    try { history.replaceState(null,'',url); } catch { /* Direct local-file use is supported. */ }
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }),{rootMargin:'40px',threshold:.06}) : null;
  function card(o, index) {
    const d=deadlineText(o), isSaved=saved.has(o.id), status=entryStatus(o,now);
    return `<article class="opportunity-card card-reveal" style="transition-delay:${Math.min(index%3,2)*55}ms" data-id="${escape(o.id)}">
      <div class="card-top"><span class="organizer-icon" style="color:${o.organizer.color}" aria-hidden="true">${escape(o.organizer.monogram)}</span><div class="card-tags">${isNew(o,now,settings.newWindowDays)?'<span class="small-badge new-badge">NEW</span>':''}${status!=='open'?`<span class="small-badge status-${status}">${statusLabel(o).toUpperCase()}</span>`:''}</div><button class="save-button" data-save="${escape(o.id)}" aria-label="${isSaved?'Remove from':'Save to'} shortlist: ${escape(o.title)}" aria-pressed="${isSaved}">${bookmark(isSaved)}</button></div>
      <div class="card-main"><div class="card-organizer">${escape(o.organizer.name)}<span></span>${escape(cardLocation(o))}</div><h3 class="card-title"><a href="${root}${escape(o.detailPath)}">${escape(o.title)}</a></h3><p class="card-summary">${escape(o.summary)}</p></div>
      <div class="card-meta"><span>${escape(o.category)}</span><span>${escape(o.format)}</span>${isInternship(o)?'':`<span>${escape(teamText(o))}</span>`}</div>
      <div class="card-bottom"><div><span class="prize-label">${prizeKind(o)}</span><span class="prize-value">${escape(prizeText(o))}</span></div><div class="deadline${d.urgent?' urgent':''}"><strong>${d.date}</strong>${d.remaining}</div></div>
      <div class="card-actions"><a href="${root}${escape(o.detailPath)}" aria-label="Read about ${escape(o.title)}">READ MORE <span>↗</span></a></div>
    </article>`;
  }
  function render() {
    now = Date.now();
    observer?.disconnect();
    renderHero();
    const open = opportunities.filter(o => isActionable(o,now));
    const newItems = open.filter(o => isNew(o,now,settings.newWindowDays));
    const savedCount = opportunities.filter(o => !isClosed(o,now) && saved.has(o.id)).length;
    const items = select(opportunities,state,saved,now,settings.newWindowDays);
    const mixed = state.view === 'all' && state.category === 'all' && !state.search.trim();
    const ordered = homeOrder(items,mixed);
    const visible = fullCatalog ? items : ordered.slice(0,PAGE_SIZE);
    $('view-more').hidden = fullCatalog || visible.length >= items.length;
    $('view-more').textContent = 'VIEW MORE OPPORTUNITIES (' + (items.length - visible.length) + ' remaining)';
    $('stat-open').textContent = String(open.length).padStart(2,'0');
    $('stat-new').textContent = String(newItems.length).padStart(2,'0');
    $('stat-organizers').textContent = String(new Set(open.map(o => o.organizerId)).size).padStart(2,'0');
    $('count-all').textContent = open.length;
    $('count-new').textContent = newItems.length;
    $('count-saved').textContent = savedCount;
    $('result-count').textContent = `${String(items.length).padStart(2,'0')} ${items.length === 1 ? 'OPPORTUNITY' : 'OPPORTUNITIES'}${state.view === 'new' ? ' / ADDED IN THE LAST ' + settings.newWindowDays + ' DAYS' : ''}`;
    document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active',el.dataset.view === state.view); el.setAttribute('aria-pressed',el.dataset.view === state.view); });
    $('paid-only').checked = state.paid === 'yes';
    document.querySelectorAll('[data-format]').forEach(el => { el.classList.toggle('active',el.dataset.format === state.format); el.setAttribute('aria-pressed',el.dataset.format === state.format); });
    document.querySelectorAll('.category-filters [data-category]').forEach(el => { el.classList.toggle('active',el.dataset.category === state.category); el.setAttribute('aria-pressed',el.dataset.category === state.category); });
    $('opportunity-grid').innerHTML = visible.map(card).join('');
    $('empty-state').hidden = items.length > 0;
    $('empty-message').textContent = state.view === 'saved' && savedCount === 0 ? 'Tap the bookmark on any opportunity to start your shortlist.' : 'Try a different filter. Your next opportunity might be one click away.';
    document.querySelectorAll('.card-reveal').forEach(el => observer ? observer.observe(el) : el.classList.add('visible'));
    syncURL();
  }
  const account = window.PrizdAccount;
  const gated = () => Boolean(account && account.enabled);
  function save(id) {
    if (gated() && !account.user && !saved.has(id) && !account.requireAuth('save')) return;
    saved.has(id) ? saved.delete(id) : saved.add(id);
    if (gated() && account.user) account.setSaved(id, saved.has(id));
    try { localStorage.setItem('prizd-saved-v1',JSON.stringify([...saved])); } catch { storageAvailable = false; }
    toast((saved.has(id) ? 'Added to your shortlist' : 'Removed from your shortlist') + (storageAvailable ? '' : ' · this session only'));
    render();
  }
  function openDetail(id) {
    const o = opportunities.find(x => x.id === id);
    if (o) location.assign(root + o.detailPath);
  }
  function reset() {
    Object.assign(state,defaults);
    $('search').value = '';
    for (const [key,id] of [['kind','kind-filter'],['format','format-filter'],['team','team-filter'],['status','status-filter'],['sort','sort']]) $(id).value = state[key];
    render();
  }
  document.addEventListener('click',event => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) { save(saveButton.dataset.save); return; }
    const card = event.target.closest('.opportunity-card');
    if (card && !event.target.closest('a,button')) { openDetail(card.dataset.id); return; }
    const category = event.target.closest('[data-category]');
    if (category) { state.category = state.category === category.dataset.category ? 'all' : category.dataset.category; state.view = 'all'; render(); return; }
    const format = event.target.closest('[data-format]');
    if (format) { state.format = state.format === format.dataset.format ? 'all' : format.dataset.format; $('format-filter').value = state.format; render(); return; }
    const view = event.target.closest('[data-view]');
    if (view) { state.view = view.dataset.view; if (state.view === 'all') state.category = 'all'; render(); }
    const quick = event.target.closest('[data-quick]');
    if (quick) { state.view = quick.dataset.quick; render(); closeMenu(); }
  });
  $('view-more').addEventListener('click',() => { location.assign(root + 'opportunities/' + location.search); });
  $('paid-only').addEventListener('change',event => { state.paid = event.target.checked ? 'yes' : 'no'; render(); });
  $('search').addEventListener('input',event => { state.search = event.target.value; render(); });
  for (const [key,id] of [['kind','kind-filter'],['format','format-filter'],['team','team-filter'],['status','status-filter'],['sort','sort']]) $(id).addEventListener('change',event => { state[key] = event.target.value; render(); });
  $('reset-filters').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
  $('filter-toggle').addEventListener('click',() => { const expanded = $('filter-toggle').getAttribute('aria-expanded') !== 'true';$('filter-toggle').setAttribute('aria-expanded',expanded);$('advanced-filters').hidden = !expanded; });
  const closeMenu = () => { $('site-menu').hidden = true; $('menu-toggle').setAttribute('aria-expanded','false'); };
  $('menu-toggle').addEventListener('click',() => { const expanded = $('menu-toggle').getAttribute('aria-expanded') !== 'true';$('menu-toggle').setAttribute('aria-expanded',expanded);$('site-menu').hidden = !expanded; });
  document.addEventListener('click',e => { if (!e.target.closest('.site-menu,.menu-toggle')) closeMenu(); });
  $('site-menu').querySelectorAll('a').forEach(a => a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e => { if (e.key === 'Escape') closeMenu();if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input,textarea,select') && !e.target.isContentEditable) { e.preventDefault();$('search').focus();$('opportunities').scrollIntoView({behavior:'smooth'}); } });
  function setLayout(layout) { currentLayout = layout; $('opportunity-grid').classList.toggle('list',layout === 'list');$('grid-view').classList.toggle('active',layout === 'grid');$('list-view').classList.toggle('active',layout === 'list');$('grid-view').setAttribute('aria-pressed',layout === 'grid');$('list-view').setAttribute('aria-pressed',layout === 'list');try{localStorage.setItem('prizd-layout',layout);}catch{} }
  $('grid-view').addEventListener('click',() => setLayout('grid'));$('list-view').addEventListener('click',() => setLayout('list'));
  let heroKey = null;
  function renderHero() {
    const topPicks = heroPicks(opportunities,now);
    const key = topPicks.map(o => o.id).join(',');
    if (key === heroKey) return;
    heroKey = key;
    if (!topPicks.length) { $('hero-shortlist').innerHTML = '<p>No opportunities listed yet.</p>'; return; }
    $('hero-shortlist').innerHTML=topPicks.map((o,i)=>`<a class="hero-pick" href="${root}${escape(o.detailPath)}" aria-label="Open ${escape(o.title)}"><span class="pick-number">0${i+1}</span><span><span class="pick-label">${escape(/research|internship/i.test(o.category) ? "Research" : o.category).toUpperCase()}</span><span class="pick-name">${escape(o.title)}</span></span><span class="pick-arrow" aria-hidden="true">↗</span></a>`).join('');
  }
  if ((state.kind !== 'all' || state.format !== 'all' || state.team !== 'all' || state.status !== 'all')) { $('advanced-filters').hidden = false; $('filter-toggle').setAttribute('aria-expanded',true); }
  render();setLayout(currentLayout);
  if (account && account.onChange) account.onChange(a => {
    if (a.enabled) saved = a.user ? new Set(a.saved) : new Set();
    try { localStorage.setItem('prizd-saved-v1',JSON.stringify([...saved])); } catch { /* storage may be blocked */ }
    
    render();
  });
  if (params.get('opportunity')) openDetail(params.get('opportunity'));
  setInterval(render,60000);
})();
