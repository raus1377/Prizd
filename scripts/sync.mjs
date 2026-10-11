/**
 * Import JSON uploads from data/inbox and permanently remove expired listings.
 * Run: node scripts/sync.mjs [--dry-run]
 * Supports complete OPEN CALL opportunity JSON or conservative research records.
 * No third-party dependencies, API keys or external requests.
 */
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSettings, validateOpportunity } from './model.mjs';

const defaultRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const safeSlug = input => String(input || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0, 100);
const canonicalUrl = input => {
  try {
    const u = new URL(input);
    if (!['https:','http:'].includes(u.protocol)) return '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = decodeURI(u.pathname).toLowerCase().replace(/\/+$/, '') || '/';
    return `${host}${pathname}`;
  } catch { return ''; }
};
const normalizeTitle = input => String(input || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const dateInZone = (now, zone) => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(key => parts.find(x=>x.type===key).value).join('-');
};
export function expired(o, now=Date.now()) {
  if (o.entryStatus === 'closed') return true;
  if (o.deadline && Date.parse(o.deadline) <= now) return true;
  if (o.deadlineDate && dateInZone(now, o.deadlineTimezone || 'Asia/Kolkata') > o.deadlineDate) return true;
  // When no deadline was supplied, a documented event end can be used as a fallback.
  if (!o.deadline && !o.deadlineDate && o.eventEndDate && dateInZone(now, o.eventTimezone || 'Asia/Kolkata') > o.eventEndDate) return true;
  return false;
}
const readJson = async file => JSON.parse(await readFile(file,'utf8'));
const websiteUrl = input => {
  const candidates = [input.primary_url, ...(input.official_and_reference_urls || [])].filter(Boolean);
  return candidates.find(x=>{try {let h=new URL(x).hostname.toLowerCase();return !/linkedin\.com$|facebook\.com$|instagram\.com$/.test(h) && !x.includes('.pdf')}catch{return false}})
    || candidates.find(x=>{try {return /^https?:$/.test(new URL(x).protocol)}catch{return false}}) || null;
};
// Unstructured research files do not reliably encode dates, prizes or entry criteria.
// Keep these as CHECK records rather than manufacture missing fields.
export function researchToOpportunity(raw) {
  const title = String(raw.name || '').trim();
  const id = safeSlug(raw.id || title);
  const url = websiteUrl(raw);
  if (!id || !title || !url) throw new Error('Research record requires name, id and an official HTTP(S) URL');
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./,'');
  const isCase = /case competition|case league|stock pitch|business simulation/i.test(title);
  const isResearch = /internship|studentship|fellowship|research program/i.test(title);
  const category = isResearch ? 'Research' : isCase ? 'Case competition' : /ad competition|catchiest ad|marketing/i.test(title) ? 'Marketing' : 'Hackathon';
  return {
    id, title, category, organizerId: `import-${safeSlug(host).slice(0,65)}`,
    summary: 'Opportunity details are available from the linked event organizer. Check the official rules before applying.',
    deadline: null, location:'To confirm', format:'To confirm',
    eligibility:'See the official rules for participation and location restrictions.',
    team:null, prize:{amount:null,currency:'USD',kind:'undisclosed',description:'Award details require verification.'},
    tags:[category], url, entryStatus:'check',
    notes:['Imported from a research summary. Deadline, eligibility and rewards need structured confirmation before it can be marked open.'],
    // Store only neutral event metadata. Do NOT copy source-report prose or personal assessments.
    _organizer:{id:`import-${safeSlug(host).slice(0,65)}`,name:host,kind:'Organization',prestige:50,monogram:host.slice(0,2).toUpperCase(),color:'#444444',website:`https://${host}`}
  };
}
export async function syncOpportunities({root=defaultRoot,now=Date.now(),dryRun=false}={}) {
  const dir=path.join(root,'data','opportunities');
  const inbox=path.join(root,'data','inbox');
  await mkdir(inbox,{recursive:true});
  await mkdir(dir,{recursive:true});
  const settings=await readJson(path.join(root,'data/settings.json'));
  const organizers=await readJson(path.join(root,'data/organizers.json'));
  validateSettings(settings,organizers);
  const organizerById=new Map(organizers.map(x=>[x.id,x]));
  const tracked=new Map();
  const byId=new Map(),byTitle=new Map(),byUrl=new Map();
  const index = (file, opportunity) => {
    tracked.set(file,opportunity);
    byId.set(opportunity.id,file);
    byTitle.set(normalizeTitle(opportunity.title),file);
    byUrl.set(canonicalUrl(opportunity.url),file);
  };
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()) {
    const file=path.join(dir,name);const obj=await readJson(file);
    validateOpportunity(obj,name,settings,organizers);
    index(file,obj);
  }
  const report={imported:[],updated:[],duplicates:[],skippedRestricted:[],removedExpired:[],reviewNeeded:[],consumedInbox:[],dryRun};
  const uploads=(await readdir(inbox)).filter(x=>x.endsWith('.json') && x!=='index.json').sort();
  const pendingWrites=new Map();
  let organizersChanged=false;
  for(const name of uploads) {
    const incoming=path.join(inbox,name);
    const object=await readJson(incoming);
    const batch=Array.isArray(object)?object:[object];
    for (const raw of batch) {
      if (raw.verification_status === 'excluded_or_restricted') {report.skippedRestricted.push(raw.name||raw.id);continue;}
      const isNative=typeof raw.title === 'string' && raw.organizerId;
      const opportunity=isNative?{...raw}:researchToOpportunity(raw);
      const newOrganizer=opportunity._organizer;
      delete opportunity._organizer;
      const key=byId.get(opportunity.id) || byTitle.get(normalizeTitle(opportunity.title)) || byUrl.get(canonicalUrl(opportunity.url));
      if (key && !isNative) {
        report.duplicates.push(opportunity.title);
        continue;
      }
      if (newOrganizer && !organizerById.has(newOrganizer.id)) {
        organizerById.set(newOrganizer.id,newOrganizer);
        organizers.push(newOrganizer);
        organizersChanged=true;
      }
      // A native-format upload may update an existing record. Preserve its stable id and addition date.
      if(key) {
        const previous=tracked.get(key);
        opportunity.id=previous.id;
        if(previous.addedAt) opportunity.addedAt=previous.addedAt;
      }
      if (!organizerById.has(opportunity.organizerId)) throw new Error(`${name}: unknown organizerId ${opportunity.organizerId}; add it to data/organizers.json`);
      if (!opportunity.addedAt) opportunity.addedAt=new Date(now).toISOString();
      validateOpportunity(opportunity,name,settings,organizers);
      const target=key || path.join(dir, `${opportunity.id}.json`);
      // Detect collisions between different records when two files share an ID.
      if(!key && tracked.has(target)) throw new Error(`${name}: filename collision ${target}`);
      pendingWrites.set(target,opportunity);
      index(target,opportunity);
      report[key?'updated':'imported'].push(opportunity.title);
      if (opportunity.entryStatus==='check') report.reviewNeeded.push(opportunity.title);
    }
    report.consumedInbox.push(name);
  }
  for (const [file,obj] of tracked) {
    if(expired(obj,now)) {
      report.removedExpired.push(obj.title);
      pendingWrites.delete(file);
    }
  }
  if(!dryRun) {
    if(organizersChanged) await writeFile(path.join(root,'data/organizers.json'),JSON.stringify(organizers,null,2)+'\n');
    for(const [file,obj] of pendingWrites) if(!expired(obj,now)) await writeFile(file,JSON.stringify(obj,null,2)+'\n');
    for (const [file,obj] of tracked) if(expired(obj,now)) await rm(file,{force:true});
    for(const name of report.consumedInbox) await rm(path.join(inbox,name),{force:true});
  }
  return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const dryRun=process.argv.includes('--dry-run');
  const report=await syncOpportunities({dryRun});
  console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(report).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),...report},null,2));
}
