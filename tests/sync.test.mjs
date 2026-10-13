import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
async function fixtureRoot() {
  const dest = await mkdtemp(path.join(tmpdir(),'open-call-sync-'));
  for(const folder of ['scripts','data','data/opportunities','data/archive','updates','updates/inbox']) await mkdir(path.join(dest,folder),{recursive:true});
  for (const file of ['scripts/model.mjs','scripts/sync.mjs','data/settings.json','data/organizers.json']) await copyFile(path.join(sourceRoot,file),path.join(dest,file));
  const record=JSON.parse(await readFile(path.join(sourceRoot,'data/opportunities/qhack-2026.json'),'utf8'));
  const old={...record,id:'example-existing',deadline:'2099-11-04T19:00:00+05:30',addedAt:'2026-01-02T00:00:00Z'};
  const expired={...old,id:'example-expired',deadline:'2020-01-01T19:00:00+05:30'};
  await writeFile(path.join(dest,'data/opportunities/example-existing.json'),JSON.stringify(old,null,2)+'\n');
  await writeFile(path.join(dest,'data/opportunities/example-expired.json'),JSON.stringify(expired,null,2)+'\n');
  return dest;
}
const run=dir=>spawnSync(process.execPath,['scripts/sync.mjs'],{cwd:dir,encoding:'utf8'});

test('Sync merges and creates organizers, removes processed inputs and archives expired listings', async () => {
  const dest=await fixtureRoot();
  try {
    const upload={upsert:[
      {id:'example-existing',summary:'Updated summary without replacing the original addition date.'},
      {id:'new-example',title:'New Opportunity',category:'Hackathon',organizer:{name:'New Organizer',kind:'Company',website:'https://www.nasa.gov',prestige:52},url:'https://www.nasa.gov',deadline:'2099-10-30T09:15:00+05:30'}
    ]};
    await writeFile(path.join(dest,'updates/inbox/upload.json'),JSON.stringify(upload));
    const done=run(dest);
    assert.equal(done.status,0,done.stderr || done.stdout);
    const updated=JSON.parse(await readFile(path.join(dest,'data/opportunities/example-existing.json'),'utf8'));
    const created=JSON.parse(await readFile(path.join(dest,'data/opportunities/new-example.json'),'utf8'));
    const organizer=JSON.parse(await readFile(path.join(dest,'data/organizers.json'),'utf8'));
    assert.equal(updated.summary,upload.upsert[0].summary);
    assert.equal(updated.addedAt,'2026-01-02T00:00:00Z');
    assert.equal(created.entryStatus,'check');
    assert.equal(created.deadline,'2099-10-30T09:15:00+05:30');
    assert.ok(organizer.some(x=>x.id==='new-organizer'&&x.prestige===52));
    assert.ok((await readdir(path.join(dest,'data/archive'))).includes('example-expired.json'));
    assert.deepEqual(await readdir(path.join(dest,'updates/inbox')),[]);
    assert.equal(run(dest).status,0,'Second run must be idempotent');
  } finally { await rm(dest,{recursive:true,force:true}); }
});

test('Invalid input fails before writing or deleting the inbox file', async () => {
  const dest=await fixtureRoot();
  try {
    const target=path.join(dest,'data/opportunities/example-existing.json');
    const original=await readFile(target,'utf8');
    await writeFile(path.join(dest,'updates/inbox/bad.json'),JSON.stringify({id:'bad-event',title:'Bad Event',category:'Impossible',organizerId:'pennylane',url:'javascript:alert(1)'}));
    const result=run(dest);
    assert.notEqual(result.status,0);
    assert.equal(await readFile(target,'utf8'),original);
    assert.ok((await readdir(path.join(dest,'updates/inbox'))).includes('bad.json'));
    assert.deepEqual(await readdir(path.join(dest,'data/archive')),[]);
  } finally { await rm(dest,{recursive:true,force:true}); }
});
