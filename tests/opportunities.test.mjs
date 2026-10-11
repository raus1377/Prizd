import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rename, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateSettings, validateOpportunity, gitAddedAt, normalizeOpportunity, DAY } from '../scripts/model.mjs';
await import('../src/logic.js');
const { isNew, isClosed, isActionable, entryStatus, rank, select } = globalThis.OpenCall;
const now = Date.parse('2026-10-11T06:00:00Z');
const organizer = {id:'o',name:'Organizer',kind:'College',prestige:100,monogram:'O',color:'#111111',website:'https://example.com'};
const settings = { name:'Test',categories:['Hackathon','Product'],newWindowDays:7,defaultSort:'prestige',prizeUsdRates:{USD:1,INR:.01} };
const fixture = (changes = {}) => ({id:'test-call',title:'Test call',category:'Hackathon',organizerId:'o',organizer,summary:'A climate challenge',deadline:new Date(now+DAY).toISOString(),addedAt:new Date(now-3*DAY).toISOString(),location:'Worldwide',format:'Online',eligibility:'Students',team:{min:1,max:4},prize:{amount:500,currency:'USD',kind:'pool',description:'Prize pool'},prizeUsd:500,tags:['Climate'],url:'https://example.com/event',...changes});
const state = {view:'all',category:'all',kind:'all',format:'all',team:'all',status:'open',sort:'prestige',search:''};

test('New includes additions within seven days, excludes future dates and the exact cutoff', () => {
  assert.equal(isNew(fixture(),now,7),true);
  assert.equal(isNew(fixture({addedAt:new Date(now-7*DAY).toISOString()}),now,7),false);
  assert.equal(isNew(fixture({addedAt:new Date(now-7*DAY+1).toISOString()}),now,7),true);
  assert.equal(isNew(fixture({addedAt:new Date(now+1).toISOString()}),now,7),false);
});
test('Organizer prestige takes priority over a larger prize; same tier breaks ties by prize', () => {
  const top=fixture({id:'top',prizeUsd:100});
  const large=fixture({id:'large',organizer:{...organizer,prestige:80},prizeUsd:1e6});
  const sameTier=fixture({id:'same-tier',prizeUsd:200});
  assert.deepEqual(rank([large,top,sameTier]).map(x=>x.id),['same-tier','top','large']);
  assert.deepEqual(rank([large,top,sameTier],'prize').map(x=>x.id),['large','same-tier','top']);
});
test('Unknown deadlines remain open and sort last; an exact deadline is closed', () => {
  const unknown=fixture({id:'unknown',deadline:null});
  const closed=fixture({id:'closed',deadline:new Date(now).toISOString()});
  assert.equal(isClosed(unknown,now),false);assert.equal(isClosed(closed,now),true);
  assert.deepEqual(select([unknown,closed,fixture()],state,new Set(),now).map(x=>x.id),['test-call','unknown']);
});
test('Search and category, organizer, format and team filters combine', () => {
  const one=fixture();const two=fixture({id:'two',category:'Product',organizer:{...organizer,kind:'Company'},format:'Hybrid',team:{min:2,max:4}});
  assert.deepEqual(select([one,two],{...state,search:'CLIMATE',kind:'College',format:'Online',team:'solo'},new Set(),now).map(x=>x.id),['test-call']);
  assert.deepEqual(select([one,two],{...state,category:'Product',team:'team'},new Set(),now).map(x=>x.id),['two']);
});
test('Saved collection retains past deadlines; closing soon excludes them and unknown dates', () => {
  const closed=fixture({id:'past',deadline:new Date(now-1).toISOString()});
  const unknown=fixture({id:'unknown',deadline:null});
  assert.deepEqual(select([closed,unknown],{...state,view:'saved'},new Set(['past']),now).map(x=>x.id),['past']);
  assert.deepEqual(select([closed,unknown,fixture()],{...state,status:'closing'},new Set(),now).map(x=>x.id),['test-call']);
});
test('Prize comparisons normalize currency instead of comparing nominal amounts', () => {
  const usd=normalizeOpportunity(fixture({prize:{amount:1000,currency:'USD',kind:'pool',description:'Pool'}}),organizer,settings,null,now);
  const inr=normalizeOpportunity(fixture({id:'inr',prize:{amount:50000,currency:'INR',kind:'pool',description:'Pool'}}),organizer,settings,null,now);
  assert.equal(usd.prizeUsd,1000);assert.equal(inr.prizeUsd,500);assert.equal(rank([inr,usd],'prize')[0].id,'test-call');
});
test('Validation rejects executable URLs, naive timestamps and invalid relationships', () => {
  validateSettings(settings,[organizer]);validateOpportunity(fixture(),'test.json',settings,[organizer]);
  for(const changes of [{url:'javascript:alert(1)'},{deadline:'2026-11-02T18:00:00'},{organizerId:'missing'},{team:{min:4,max:1}},{prize:{amount:-1,currency:'USD',kind:'pool',description:'Pool'}}]) assert.throws(()=>validateOpportunity(fixture(changes),'test.json',settings,[organizer]));
});
test('A date-only deadline expires after that calendar day in the specified timezone', () => {
  const day=fixture({deadline:null,deadlineDate:'2026-10-11',deadlineTimezone:'Asia/Kolkata'});
  assert.equal(isClosed(day,Date.parse('2026-10-11T18:29:59Z')),false);
  assert.equal(isClosed(day,Date.parse('2026-10-11T18:30:00Z')),true);
});
test('Upcoming, uncertain and closed entries have separate collections and never appear as open', () => {
  const upcoming=fixture({id:'future',entryStatus:'upcoming',opensOn:'2026-10-12'});
  const check=fixture({id:'check',entryStatus:'check'});
  const closed=fixture({id:'closed',entryStatus:'closed'});
  const items=[fixture(),upcoming,check,closed];
  assert.deepEqual(select(items,state,new Set(),now).map(o=>o.id),['test-call']);
  for(const [status,id] of [['upcoming','future'],['check','check'],['closed','closed']]) assert.deepEqual(select(items,{...state,status},new Set(),now).map(o=>o.id),[id]);
  assert.equal(entryStatus(upcoming,Date.parse('2026-10-11T18:30:00Z')),'open');
  assert.equal(isActionable(check,now),false);
});
test('Secondary categories match their filters and unknown team sizes do not imply solo eligibility', () => {
  const cross=fixture({categories:['Product'],team:null});
  assert.equal(select([cross],{...state,category:'Product'},new Set(),now).length,1);
  for(const team of ['solo','team']) assert.equal(select([cross],{...state,team},new Set(),now).length,0);
});
test('Validation accepts unresolved facts without manufacturing dates or team limits', () => {
  validateOpportunity(fixture({deadline:null,deadlineDate:'2026-10-11',format:'To confirm',team:null,entryStatus:'check',notes:['Check entry terms.']}),'test.json',settings,[organizer]);
  validateOpportunity(fixture({team:{min:2,max:null},opensOn:'2026-11-02',entryStatus:'upcoming'}),'test.json',settings,[organizer]);
  for(const changes of [{deadlineDate:'2026-02-30'},{opensOn:'tomorrow'},{entryStatus:'maybe'},{deadlineTimezone:'Unknown/Zone'},{notes:'not an array'},{categories:['Missing']}]) assert.throws(()=>validateOpportunity(fixture(changes),'test.json',settings,[organizer]));
});
test('Published catalog uses event links and valid organizer relationships for every listing', async () => {
  const root=new URL('../data/',import.meta.url);
  const configured=JSON.parse(await readFile(new URL('settings.json',root),'utf8'));
  const organizers=JSON.parse(await readFile(new URL('organizers.json',root),'utf8'));
  const files=await readdir(new URL('opportunities/',root));
  assert.ok(files.some(f=>f.endsWith('.json')));
  const ids=new Set();
  for(const file of files.filter(f=>f.endsWith('.json'))) {
    const o=JSON.parse(await readFile(new URL('opportunities/'+file,root),'utf8'));
    validateOpportunity(o,file,configured,organizers);
    assert.equal(ids.has(o.id),false);ids.add(o.id);
    assert.equal(new URL(o.url).hostname.endsWith('example.com'),false);
    assert.equal('isDemo' in o,false);
    assert.equal(file.startsWith('example-'),false);
  }
});
test('Git birth date survives subsequent edits and a file rename', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'open-call-test-'));
  const run=(args,date)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,...(date ? {GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date} : {})}});
  try {
    run(['init','-q']);run(['config','user.email','tests@example.invalid']);run(['config','user.name','Test']);
    await writeFile(path.join(dir,'opportunity.json'),'original');run(['add','.']);run(['commit','-qm','Add opportunity'],'2026-10-01T00:00:00Z');
    await writeFile(path.join(dir,'opportunity.json'),'edited');run(['add','.']);run(['commit','-qm','Edit opportunity'],'2026-10-10T00:00:00Z');
    assert.equal(Date.parse(gitAddedAt(dir,'opportunity.json')),Date.parse('2026-10-01T00:00:00Z'));
    await rename(path.join(dir,'opportunity.json'),path.join(dir,'renamed.json'));run(['add','-A']);run(['commit','-qm','Rename opportunity'],'2026-10-11T00:00:00Z');
    const date=gitAddedAt(dir,'renamed.json');assert.equal(Date.parse(date),Date.parse('2026-10-01T00:00:00Z'));
    assert.equal(isNew(fixture({addedAt:date}),now,7),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('Repository has no absolute asset paths and deployment fetches full Git history', async () => {
  const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
  assert.equal(/(?:src|href)="\/(?!\/)/.test(html),false);
  const yaml=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(yaml,/fetch-depth: 0/);assert.match(yaml,/path: dist/);
});
