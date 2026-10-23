// Shared helpers for the Edge Functions (Deno).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
export const SITE_URL = (Deno.env.get('SITE_URL') || '').replace(/\/+$/, '');
export const FUNCTIONS_URL = (Deno.env.get('FUNCTIONS_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1`).replace(/\/+$/, '');
export const INTERESTS = ['Hackathons', 'Internships', 'Case comps'];

const origins = (Deno.env.get('ALLOWED_ORIGINS') || SITE_URL).split(',').map(s => s.trim()).filter(Boolean);
export function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allow = origins.includes(origin) ? origin : (origins[0] || '');
  return { 'access-control-allow-origin': allow, 'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' };
}
export const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });
export const redirect = (path: string) => new Response(null, { status: 303, headers: { location: `${SITE_URL}${path}` } });
export const isEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function sendMail(to: string, subject: string, html: string, text: string, unsubscribeUrl?: string) {
  const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('MAIL_FROM');
  if (!key || !from) throw new Error('RESEND_API_KEY and MAIL_FROM must be set');
  const headers: Record<string, string> = unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to, subject, html, text, headers }) });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
