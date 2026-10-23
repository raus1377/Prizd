(() => {
  'use strict';
  const data = window.__PRIZD_DATA__;
  if (!data) { document.getElementById('result-count').textContent = 'Data could not load. Please refresh.'; return; }
  const { isNew, isClosed, isActionable, entryStatus, rank, select, prizeText, prizeKind, teamText, DAY } = window.Prizd;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const settings = data.settings;
  const opportunities = data.opportunities;
  const params = new URLSearchParams(location.search);
  const defaults = { view:'all', region:'Global', category:'all', kind:'all', format:'all', team:'all', status:'open', sort:settings.defaultSort, search:'' };
  const state = { ...defaults };
  const allowed = {view:['all','new','saved'],region:['Global','India'],category:['all',...settings.categories],kind:['all','Company','College','Organization','Community'],format:['all','Online','In person','Hybrid','To confirm'],team:['all','solo','team'],status:['open','all','closing','upcoming','check','closed'],sort:['prestige','prize','deadline','newest']};
  for (const key of Object.keys(allowed)) if (allowed[key].includes(params.get(key))) state[key] = params.get(key);
  state.search = params.get('q') || '';
  let saved;
  let storageAvailable = true;
  try { const raw = JSON.parse(localStorage.getItem('prizd-saved-v1') || localStorage.getItem('open-call-saved-v1') || '[]'); saved = new Set(Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : []); } catch { saved = new Set(); storageAvailable = false; }
  let currentLayout = 'grid';
  try { currentLayout = (localStorage.getItem('prizd-layout') || localStorage.getItem('open-call-layout')) === 'list' ? 'list' : 'grid'; } catch { /* Browsing still works without storage. */ }
  let now = Date.now();
  let detailId = null;
  let toastTimer;
  $('brand-name').textContent = settings.name;
  document.title = settings.seoTitle || `${settings.name} — The Opportunity Index`;
  $('footer-year').textContent = new Date().getFullYear();
  $('updated-label').textContent = `INDEX UPDATED ${new Date(data.builtAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}`;
  const regionOf = o => o.region || 'Global';
  let chipKey = '';
  function renderCategories() {
    const used = new Set(opportunities.filter(o => regionOf(o) === state.region).flatMap(o => [o.category,...(o.categories || [])]));
    const list = settings.categories.filter(c => used.has(c));
    if (state.category !== 'all' && !list.includes(state.category)) state.category = 'all';
    const key = list.join('|');
    if (key === chipKey) return;
    chipKey = key;
    $('category-filters').innerHTML = ['all',...list].map(c => `<button data-category="${escape(c)}" aria-pressed="${state.category === c}" class="${state.category === c ? 'active' : ''}">${c === 'all' ? 'Everything' : escape(c)}</button>`).join('');
  }
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
      <div class="card-main"><div class="card-organizer">${escape(o.organizer.name)}<span></span>${escape(o.organizer.kind)}</div><h3 class="card-title">${o.url?`<a href="${escape(o.url)}" target="_blank" rel="noopener noreferrer">${escape(o.title)}</a>`:escape(o.title)}</h3><p class="card-summary">${escape(o.summary)}</p></div>
      <div class="card-meta"><span>${escape(o.category)}</span><span>${escape(o.format)}</span><span>${escape(teamText(o))}</span></div>
      <div class="card-bottom"><div><span class="prize-label">${prizeKind(o)}</span><span class="prize-value">${escape(prizeText(o))}</span></div><div class="deadline${d.urgent?' urgent':''}"><strong>${d.date}</strong>${d.remaining}</div></div>
      <div class="card-actions"><button data-detail="${escape(o.id)}" aria-label="Details for ${escape(o.title)}">DETAILS <span>+</span></button>${o.url?`<a href="${escape(o.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open official page for ${escape(o.title)}">${status==='open'?'VISIT EVENT':status==='check'?'CHECK ENTRY':'EVENT PAGE'} <span aria-hidden="true">↗</span></a>`:''}</div>
    </article>`;
  }
  function render() {
    now = Date.now();
    observer?.disconnect();
    renderCategories();
    renderHero();
    const open = opportunities.filter(o => regionOf(o) === state.region && isActionable(o,now));
    const newItems = open.filter(o => isNew(o,now,settings.newWindowDays));
    const savedCount = opportunities.filter(o => saved.has(o.id)).length;
    const items = select(opportunities,state,saved,now,settings.newWindowDays);
    $('stat-open').textContent = String(open.length).padStart(2,'0');
    $('stat-new').textContent = String(newItems.length).padStart(2,'0');
    $('stat-organizers').textContent = String(new Set(open.map(o => o.organizerId)).size).padStart(2,'0');
    $('count-all').textContent = open.length;
    for (const r of ['Global','India']) $('count-' + r.toLowerCase()).textContent = opportunities.filter(o => regionOf(o) === r && isActionable(o,now)).length;
    $('count-new').textContent = newItems.length;
    $('count-saved').textContent = savedCount;
    $('result-count').textContent = `${String(items.length).padStart(2,'0')} ${items.length === 1 ? 'OPPORTUNITY' : 'OPPORTUNITIES'}${state.view === 'new' ? ' / ADDED IN THE LAST ' + settings.newWindowDays + ' DAYS' : ''}`;
    document.querySelectorAll('[data-region]').forEach(el => { el.classList.toggle('active',el.dataset.region === state.region); el.setAttribute('aria-pressed',el.dataset.region === state.region); });
    document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active',el.dataset.view === state.view); el.setAttribute('aria-pressed',el.dataset.view === state.view); });
    document.querySelectorAll('.category-filters [data-category]').forEach(el => { el.classList.toggle('active',el.dataset.category === state.category); el.setAttribute('aria-pressed',el.dataset.category === state.category); });
    $('opportunity-grid').innerHTML = items.map(card).join('');
    $('empty-state').hidden = items.length > 0;
    $('empty-message').textContent = state.view === 'saved' && savedCount === 0 ? 'Tap the bookmark on any opportunity to start your shortlist.' : 'Try a different filter. Your next opportunity might be one click away.';
    document.querySelectorAll('.card-reveal').forEach(el => observer ? observer.observe(el) : el.classList.add('visible'));
    syncURL();
  }
  function save(id) {
    saved.has(id) ? saved.delete(id) : saved.add(id);
    try { localStorage.setItem('prizd-saved-v1',JSON.stringify([...saved])); } catch { storageAvailable = false; }
    toast((saved.has(id) ? 'Added to your shortlist' : 'Removed from your shortlist') + (storageAvailable ? '' : ' · this session only'));
    render();
    if (detailId === id) renderDetail(id);
  }
  function renderDetail(id) {
    const o=opportunities.find(x=>x.id===id);if(!o)return;
    const date=o.deadline ? `${new Date(o.deadline).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short'})} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : o.deadlineDate ? `${new Date(o.deadlineDate+'T12:00:00Z').toLocaleDateString('en-GB',{dateStyle:'long',timeZone:'UTC'})} · exact cutoff time not announced` : 'Not announced';
    const status=entryStatus(o,now);
    $('detail-content').innerHTML=`<div class="detail-kicker"><span class="organizer-icon" style="color:${o.organizer.color}">${escape(o.organizer.monogram)}</span>${escape(o.organizer.name)} / ${escape(o.category)}</div><h2 id="detail-title">${escape(o.title)}</h2><p class="detail-status status-${status}">${statusLabel(o).toUpperCase()}${o.opensOn?' · OPENS '+shortDate(o.opensOn+'T12:00:00Z'):''}</p><p class="detail-summary">${escape(o.summary)}</p><dl class="detail-grid"><div><dt>${prizeKind(o)}</dt><dd>${escape(prizeText(o))}</dd></div><div><dt>REWARD DETAILS</dt><dd>${escape(o.prize.description)}</dd></div><div><dt>${escape(o.deadlineLabel || 'ENTRY DEADLINE').toUpperCase()}</dt><dd>${escape(date)}</dd></div><div><dt>FORMAT & LOCATION</dt><dd>${escape(o.format)} · ${escape(o.location)}</dd></div><div><dt>WHO CAN APPLY</dt><dd>${escape(o.eligibility)}</dd></div><div><dt>TEAM SIZE</dt><dd>${escape(teamText(o))}</dd></div></dl>${o.notes?.length?`<div class="entry-notes"><h3>ENTRY NOTES</h3><ul>${o.notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul></div>`:''}<div class="detail-tags">${o.tags.map(t=>`<span>${escape(t)}</span>`).join('')}</div><div class="detail-actions">${o.url?`<a href="${escape(o.url)}" target="_blank" rel="noopener noreferrer">VISIT OFFICIAL PAGE <span>↗</span></a>`:''}<button data-save="${escape(id)}">${bookmark(saved.has(id))} ${saved.has(id)?'SAVED':'SAVE OPPORTUNITY'}</button><button data-share="${escape(id)}">COPY LINK ↗</button>${o.sourceUrl&&o.sourceUrl!==o.url?`<a href="${escape(o.sourceUrl)}" target="_blank" rel="noopener noreferrer">SOURCE / RULES ↗</a>`:''}</div><p class="detail-added">ADDED ${shortDate(o.addedAt)} · ORGANIZER PRIORITY ${o.organizer.prestige}/100 · RANKING IS SET BY THE CURATOR</p>`;
  }
  function openDetail(id) {
    if (!opportunities.some(o => o.id === id)) return;
    detailId = id;
    renderDetail(id);
    if (!$('detail-dialog').open) $('detail-dialog').showModal();
    document.body.style.overflow = 'hidden';
  }
  function reset() {
    Object.assign(state,defaults,{ region:state.region });
    $('search').value = '';
    for (const [key,id] of [['kind','kind-filter'],['format','format-filter'],['team','team-filter'],['status','status-filter'],['sort','sort']]) $(id).value = state[key];
    render();
  }
  document.addEventListener('click',async event => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) { save(saveButton.dataset.save); return; }
    const detail = event.target.closest('[data-detail]');
    if (detail) { openDetail(detail.dataset.detail); return; }
    const share = event.target.closest('[data-share]');
    if (share) {
      const url = new URL(location.href);url.search = '';url.searchParams.set('opportunity',share.dataset.share);url.hash = 'opportunities';
      try { await navigator.clipboard.writeText(url.href); toast('Opportunity link copied'); } catch { toast('Copy this page address to share the index'); }
      return;
    }
    const category = event.target.closest('[data-category]');
    if (category) { state.category = category.dataset.category; state.view = 'all'; render(); }
    const region = event.target.closest('[data-region]');
    if (region) { state.region = region.dataset.region; render(); return; }
    const view = event.target.closest('[data-view]');
    if (view) { state.view = view.dataset.view; render(); }
    const quick = event.target.closest('[data-quick]');
    if (quick) { state.view = quick.dataset.quick; render(); closeMenu(); }
  });
  $('search').addEventListener('input',event => { state.search = event.target.value; render(); });
  for (const [key,id] of [['kind','kind-filter'],['format','format-filter'],['team','team-filter'],['status','status-filter'],['sort','sort']]) $(id).addEventListener('change',event => { state[key] = event.target.value; render(); });
  $('reset-filters').addEventListener('click',reset);$('empty-reset').addEventListener('click',reset);
  $('filter-toggle').addEventListener('click',() => { const expanded = $('filter-toggle').getAttribute('aria-expanded') !== 'true';$('filter-toggle').setAttribute('aria-expanded',expanded);$('advanced-filters').hidden = !expanded; });
  const closeMenu = () => { $('site-menu').hidden = true; $('menu-toggle').setAttribute('aria-expanded','false'); };
  $('menu-toggle').addEventListener('click',() => { const expanded = $('menu-toggle').getAttribute('aria-expanded') !== 'true';$('menu-toggle').setAttribute('aria-expanded',expanded);$('site-menu').hidden = !expanded; });
  document.addEventListener('click',e => { if (!e.target.closest('.site-menu,.menu-toggle')) closeMenu(); });
  $('site-menu').querySelectorAll('a').forEach(a => a.addEventListener('click',closeMenu));
  $('dialog-close').addEventListener('click',() => $('detail-dialog').close());
  $('detail-dialog').addEventListener('click',e => { if (e.target === $('detail-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  $('detail-dialog').addEventListener('close',() => { document.body.style.overflow = '';detailId = null; });
  document.addEventListener('keydown',e => { if (e.key === 'Escape') closeMenu();if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input,textarea,select') && !e.target.isContentEditable && !$('detail-dialog').open) { e.preventDefault();$('search').focus();$('opportunities').scrollIntoView({behavior:'smooth'}); } });
  function setLayout(layout) { currentLayout = layout; $('opportunity-grid').classList.toggle('list',layout === 'list');$('grid-view').classList.toggle('active',layout === 'grid');$('list-view').classList.toggle('active',layout === 'list');$('grid-view').setAttribute('aria-pressed',layout === 'grid');$('list-view').setAttribute('aria-pressed',layout === 'list');try{localStorage.setItem('prizd-layout',layout);}catch{} }
  $('grid-view').addEventListener('click',() => setLayout('grid'));$('list-view').addEventListener('click',() => setLayout('list'));
  let heroKey = '';
  function renderHero() {
    const topPicks = rank(opportunities.filter(o => regionOf(o) === state.region && o.url && isActionable(o,now))).slice(0,3);
    const key = state.region + '|' + topPicks.map(o => o.id).join(',');
    if (key === heroKey) return;
    heroKey = key;
    $('hero-shortlist').innerHTML=topPicks.map((o,i)=>`<a class="hero-pick" href="${escape(o.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escape(o.title)}"><span class="pick-number">0${i+1}</span><span><span class="pick-label">${escape(o.organizer.name).toUpperCase()} / ${escape(o.category).toUpperCase()}</span><span class="pick-name">${escape(o.title)}</span></span><span class="pick-arrow" aria-hidden="true">↗</span></a>`).join('');
  }
  if (state.kind !== 'all' || state.format !== 'all' || state.team !== 'all' || state.status !== 'open') { $('advanced-filters').hidden = false; $('filter-toggle').setAttribute('aria-expanded',true); }
  render();setLayout(currentLayout);
  if (params.get('opportunity')) openDetail(params.get('opportunity'));
  setInterval(() => { if (!$('detail-dialog').open) render(); },60000);
})();
