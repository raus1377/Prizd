import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expired,syncOpportunities,researchToOpportunity} from '../scripts/sync.mjs';

const date = text => Date.parse(text);
const settings={name:'Open Call',categories:['Hackathon','Case competition','Marketing','Research','Engineering'],newWindowDays:7,defaultSort:'prestige',prizeUsdRates:{USD:1}};
const organizer={id:'old',name:'Example',kind:'Organization',prestige:50,monogram:'E',color:'#444444',website:'https://example.org'};
const item=(id,title,deadline=null,more={})=>({id,title,category:'Hackathon',organizerId:'old',summary:'Build practical software',deadline,location:'Worldwide',format:'Online',eligibility:'Students',team:null,prize:{amount:null,currency:'USD',kind:'undisclosed',description:'Unconfirmed'},tags:[],url:`https://example.org/${id}`,entryStatus:'open',addedAt:'2026-10-01T00:00:00Z',...more});

test('expiry respects timezone, exact timestamps, date-only, event-end fallback, unknown dates',()=>{
  const now=date('2026-10-11T18:30:00Z');
  assert.equal(expired(item('one','One','2026-10-11T18:29:00Z'),now),true);
  assert.equal(expired(item('two','Two','2026-10-11T18:31:00Z'),now),false);
  assert.equal(expired(item('three','Three',null,{deadlineDate:'2026-10-11',deadlineTimezone:'Asia/Kolkata'}),now),true);
  assert.equal(expired(item('four','Four',null,{deadlineDate:'2026-10-11',deadlineTimezone:'Etc/GMT+12'}),now),false);
  assert.equal(expired(item('five','Five',null,{eventEndDate:'2026-10-11'}),now),true);
  assert.equal(expired(item('six','Six',null),now),false);
  assert.equal(expired(item('seven','Seven',null,{entryStatus:'closed'}),now),true);
});

test('sync imports native and sanitized research, skips duplicates, prunes expired, consumes uploads',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'open-call-sync-'));
  const mkdirs=async()=>{
    await mkdir(path.join(root,'data/opportunities'),{recursive:true});await mkdir(path.join(root,'data/inbox'),{recursive:true});
    await writeFile(path.join(root,'data/settings.json'),JSON.stringify(settings));
    await writeFile(path.join(root,'data/organizers.json'),JSON.stringify([organizer]));
  };
  try {
    await mkdirs();
    const old=item('old-event','Old event','2026-10-10T00:00:00Z');
    const existing=item('same-event','Existing',null,{url:'https://example.org/existing'});
    await writeFile(path.join(root,'data/opportunities/old-event.json'),JSON.stringify(old));
    await writeFile(path.join(root,'data/opportunities/same-event.json'),JSON.stringify(existing));
    const incoming=item('new-event','New event',null,{deadlineDate:'2026-10-20',deadlineTimezone:'Asia/Kolkata'});
    const duplicate={id:'duplicate',name:'Existing',primary_url:'https://example.org/existing?utm_source=something',verification_status:'confirmed'};
    const research={id:'research-thing',name:'Research thing',primary_url:'https://example.edu/event',verification_status:'unverified',details_from_source:'User studies at secret university and has a 6.8 CGPA'};
    await writeFile(path.join(root,'data/inbox/batch.json'),JSON.stringify([incoming,duplicate,research]));
    const at=date('2026-10-12T00:00:00Z');
    const dry=await syncOpportunities({root,now:at,dryRun:true});
    assert.deepEqual(dry.removedExpired,['Old event']);
    assert.equal((await readdir(path.join(root,'data/inbox'))).length,1);
    const report=await syncOpportunities({root,now:at});
    assert.equal(report.imported.length,2);
    assert.equal(report.duplicates.length,1);
    assert.equal(report.removedExpired.length,1);
    assert.equal((await readdir(path.join(root,'data/inbox'))).length,0);
    const names=await readdir(path.join(root,'data/opportunities'));
    assert.equal(names.includes('old-event.json'),false);
    assert.equal(names.includes('new-event.json'),true);
    const parsed=JSON.parse(await readFile(path.join(root,'data/opportunities/research-thing.json')));
    assert.equal(parsed.entryStatus,'check');
    assert.equal(parsed.deadline,null);
    assert.ok(!JSON.stringify(parsed).includes('CGPA'));
    assert.ok(!JSON.stringify(parsed).includes('secret university'));
  } finally {await rm(root,{recursive:true,force:true});}
});
