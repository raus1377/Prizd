/**
 * Idempotent OPEN CALL inbox ingestion and expiration maintenance.
 * No API keys or dependencies. Reads ONLY updates/inbox and existing catalog.
 * Fail-closed: all incoming records are parsed and validated before any writes.
 */
import { readFile, readdir, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSettings, validateOpportunity, validDate } from './model.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const location = (...parts) => path.join(root, ...parts);
const INBOX = location('updates','inbox');
const LIVE = location('data','opportunities');
const ARCHIVE = location('data','archive');
const runAt = new Date();
const now = runAt.toISOString();
const defaultColor = '#242424';
const slug = text => String(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const asList = value => Array.isArray(value) ? value : [value];
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const readJson = async (...parts) => JSON.parse(await readFile(location(...parts),'utf8'));
const organizerList = await readJson('data','organizers.json');
const settings = await readJson('data','settings.json');
validateSettings(settings, organizerList);
const organizers = new Map(organizerList.map(x => [x.id, {...x}]));
const stored = new Map();
const records = new Map();
const allFiles = (await readdir(LIVE)).filter(f => f.endsWith('.json')).sort();
for (const file of allFiles) {
  const o = await readJson('data','opportunities',file);
  if (records.has(o.id)) throw Error(`Existing duplicate id: ${o.id}`);
  stored.set(o.id,file);records.set(o.id,o);
}

// Structured TXT format supports repeated "Key: value" blocks separated by ---.
const convertValue = (key, value) => {
  if (['deadline','deadlineDate','opensOn','sourceUrl'].includes(key) && /^(unknown|none|null)$/i.test(value)) return null;
  if (key === 'tags' || key === 'notes' || key === 'categories') return value.split(',').map(x => x.trim()).filter(Boolean);
  if (['teamMin','teamMax','prizeAmount','organizerPrestige'].includes(key)) return /^(none|unknown|null)$/i.test(value) ? null : Number(value);
  return value;
};
const txtKeys = {
  id:'id',title:'title',category:'category',summary:'summary',deadline:'deadline',
  deadlinedate:'deadlineDate',deadlinetimezone:'deadlineTimezone',deadlinelabel:'deadlineLabel',
  location:'location',format:'format',eligibility:'eligibility',url:'url',sourceurl:'sourceUrl',
  entrystatus:'entryStatus',openson:'opensOn',tags:'tags',notes:'notes',categories:'categories',
  organizer:'organizer',organizerid:'organizerId',organizername:'organizerName',
  organizerkind:'organizerKind',organizerwebsite:'organizerWebsite',organizerprestige:'organizerPrestige',
  teammin:'teamMin',teammax:'teamMax',teamtext:'teamText',
  prizeamount:'prizeAmount',prizecurrency:'prizeCurrency',prizekind:'prizeKind',prizedescription:'prizeDescription'
};
function parseStructuredText(text, source) {
  const blocks = text.split(/^\s*---\s*$/m).map(x => x.trim()).filter(Boolean);
  return blocks.map((block,index) => {
    const record = {};
    for(const line of block.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*?)\s*$/);
      if(!match) throw Error(`${source} block ${index+1}: expected Key: value, got ${line}`);
      const mapped = txtKeys[match[1].toLowerCase().replace(/[^a-z]/g,'')];
      if(!mapped) throw Error(`${source} block ${index+1}: unknown field ${match[1]}`);
      record[mapped] = convertValue(mapped,match[2]);
    }
    return record;
  });
}
function unpackJson(data, source) {
  if (Array.isArray(data)) return {upsert:data, remove:[]};
  if (!isObject(data)) throw Error(`${source}: expected JSON object or array`);
  if ('upsert' in data || 'remove' in data) {
    const add = data.upsert ?? [];
    const remove = data.remove ?? [];
    if(!Array.isArray(add) || !Array.isArray(remove)) throw Error(`${source}: upsert and remove must be arrays`);
    return {upsert:add,remove};
  }
  return {upsert:[data],remove:[]};
}
const upserts = [];
const removals = [];
const processed = [];
for (const file of (await readdir(INBOX)).sort()) {
  if (file.startsWith('.') || file === 'README.md') continue;
  const filePath = path.join(INBOX,file);
  const text = await readFile(filePath,'utf8');
  if (file.endsWith('.remove') || file === 'remove.txt') {
    removals.push(...text.split(/\r?\n/).map(x => x.trim()).filter(x=>x && !x.startsWith('#')));
  } else if (file.endsWith('.json')) {
    const batch = unpackJson(JSON.parse(text),file);upserts.push(...batch.upsert);removals.push(...batch.remove);
  } else if (file.endsWith('.jsonl')) {
    for(const [n,line] of text.split(/\r?\n/).entries()) {
      if(!line.trim()) continue;
      const batch = unpackJson(JSON.parse(line),`${file}:${n+1}`);upserts.push(...batch.upsert);removals.push(...batch.remove);
    }
  } else if (file.endsWith('.txt')) {
    upserts.push(...parseStructuredText(text,file));
  } else throw Error(`Unsupported file updates/inbox/${file}. Supported: .json, .jsonl, structured .txt, .remove`);
  processed.push(filePath);
}

function resolveOrganizer(input, record) {
  // Existing organizerId wins; can optionally supply extra metadata in the same record.
  const spec = isObject(input.organizer) ? input.organizer : {};
  const name = input.organizerName ?? (typeof input.organizer === 'string' ? input.organizer : spec.name);
  const namedMatch = name ? [...organizers.values()].find(x => slug(x.name) === slug(name)) : null;
  const id = input.organizerId || spec.id || namedMatch?.id || (name ? slug(name) : record?.organizerId);
  if(!id) throw Error(`${input.title || input.id || 'New listing'}: provide organizerId or organizerName`);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw Error(`Invalid organizer id: ${id}`);
  const previous = organizers.get(id);
  if(!previous && !name) throw Error(`New organizer ${id}: include organizerName (or organizer object with name)`);
  const url = input.organizerWebsite ?? spec.website ?? previous?.website ?? input.url ?? record?.url;
  const kind = input.organizerKind ?? spec.kind ?? previous?.kind ?? 'Organization';
  const prestige = input.organizerPrestige ?? spec.prestige ?? previous?.prestige ?? 40;
  const label = (input.organizerName || (isObject(input.organizer) && input.organizer.name)) ?? previous?.name ?? name;
  const updated = {
    ...(previous||{}), id, name:label, kind, prestige, 
    monogram:spec.monogram ?? previous?.monogram ?? String(label).slice(0,2).toUpperCase(),
    color:spec.color ?? previous?.color ?? defaultColor,
    website:url
  };
  organizers.set(id,updated);
  return id;
}
function upsert(input) {
  if (!isObject(input)) throw Error('Each upsert must be an object');
  const inputId = input.id || (input.title ? slug(input.title) : null);
  if(!inputId) throw Error('Upsert needs id or title');
  const old = records.get(inputId);
  const organizerId = resolveOrganizer(input,old);
  const overrides = {...input};
  for (const key of ['organizer','organizerName','organizerKind','organizerWebsite','organizerPrestige','teamMin','teamMax','prizeAmount','prizeCurrency','prizeKind','prizeDescription']) delete overrides[key];
  const team = input.team !== undefined ? input.team : input.teamMin !== undefined || input.teamMax !== undefined ? {min:input.teamMin ?? old?.team?.min ?? 1, max:input.teamMax ?? old?.team?.max ?? null} : old?.team ?? null;
  const prize = {
    ...(old?.prize ?? {amount:null,currency:'USD',kind:'undisclosed',description:'Prize information has not been verified.'}),
    ...(input.prize ?? {})
  };
  for(const [key,to] of [['prizeAmount','amount'],['prizeCurrency','currency'],['prizeKind','kind'],['prizeDescription','description']]) if(input[key] !== undefined) prize[to] = input[key];
  const data = {
    ...(!old ? {id:inputId,summary:'Details not yet verified.',deadline:null,location:'Not specified',format:'To confirm',eligibility:'Check official eligibility requirements.',tags:[],entryStatus:'check'} : old),
    ...overrides,id:inputId,organizerId,team,prize,
    // A correction must not masquerade as a newly added event.
    addedAt: old?.addedAt ?? input.addedAt ?? now
  };
  if(input.deadlineDate !== undefined && input.deadline === undefined && !old) data.deadline = null;
  records.set(data.id,data);
}
for (const entry of upserts) upsert(entry);

// Deletion is explicit by immutable ID, not by fuzzy title.
for (const id of removals) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw Error(`Invalid removal ID: ${id}`);
  records.delete(id);
}

function localDay(date,zone) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const obj = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
function expired(o) {
  if(o.entryStatus === 'closed') return true;
  if(o.deadline) return validDate(o.deadline) && Date.parse(o.deadline) <= runAt.getTime();
  if(o.deadlineDate) return localDay(runAt,o.deadlineTimezone ?? 'Asia/Kolkata') > o.deadlineDate;
  return false;
}

// Validate entire target state before mutating disk.
const completeOrganizers = [...organizers.values()];
validateSettings(settings,completeOrganizers);
const archiveIds = [];
for(const [id,item] of records) {
  validateOpportunity(item,`listing ${id}`,settings,completeOrganizers);
  if(expired(item)) archiveIds.push(id);
}
await mkdir(ARCHIVE,{recursive:true});
let changed=0;
async function writeChanged(file,content) {
  let existing=null;
  try { existing=await readFile(file,'utf8'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
  if(existing !== content) { await writeFile(file,content);changed++; }
}
for(const id of archiveIds) {
  const item = records.get(id);
  await writeChanged(path.join(ARCHIVE,`${id}.json`),JSON.stringify(item,null,2)+'\n');
  records.delete(id);
}
// Explicit removals are also archived instead of lost permanently.
for (const id of removals) {
  if(stored.has(id) && !archiveIds.includes(id)) {
    const original=await readJson('data','opportunities',stored.get(id));
    await writeChanged(path.join(ARCHIVE,`${id}.json`),JSON.stringify(original,null,2)+'\n');
  }
}
await writeChanged(location('data','organizers.json'),JSON.stringify(completeOrganizers,null,2)+'\n');
for(const [id,item] of records) {
  const filename=stored.get(id) ?? `${id}.json`;
  await writeChanged(path.join(LIVE,filename),JSON.stringify(item,null,2)+'\n');
  // Returning an archived opportunity makes it active again.
  const archiveFile=path.join(ARCHIVE,`${id}.json`);
  try { await unlink(archiveFile);changed++; } catch(e) { if(e.code !== 'ENOENT') throw e; }
}
for(const [id,file] of stored) {
  if(!records.has(id)) { await unlink(path.join(LIVE,file));changed++; }
}
for(const file of processed) await unlink(file);
console.log(`Inbox: ${processed.length} files; upserts: ${upserts.length}; explicit removals: ${removals.length}; expired: ${archiveIds.length}; modified files: ${changed}.`);
