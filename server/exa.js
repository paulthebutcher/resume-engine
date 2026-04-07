/**
 * Exa search integration for job discovery.
 * API key is stored in scout_config table (key: 'exa_api_key').
 */
import crypto from 'crypto';
import { getConfig } from './scout-db.js';

const EXA_API = 'https://api.exa.ai/search';

const JOB_DOMAINS = [
  'lever.co',
  'greenhouse.io',
  'workday.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'jobvite.com',
  'ashbyhq.com',
  'icims.com',
  'taleo.net',
  'bamboohr.com',
  'rippling.com',
  'careers.google.com',
];

export function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function getOneWeekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

export function getOneMonthAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

export function getExaApiKey() {
  return getConfig('exa_api_key') || null;
}

export async function searchExa(query, { dateFilter = 'week', numResults = 10 } = {}) {
  const apiKey = getExaApiKey();
  if (!apiKey) return [];

  let startDate = null;
  if (dateFilter === 'day') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    startDate = d.toISOString().split('T')[0];
  } else if (dateFilter === 'week') {
    startDate = getOneWeekAgo();
  } else if (dateFilter === 'month') {
    startDate = getOneMonthAgo();
  }

  const body = {
    query,
    num_results: numResults,
    type: 'neural',
    include_domains: JOB_DOMAINS,
    contents: {
      text: { maxCharacters: 4000 },
    },
  };

  if (startDate) body.start_published_date = startDate;

  let data;
  try {
    const res = await fetch(EXA_API, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Exa API error ${res.status}: ${errText}`);
    }
    data = await res.json();
  } catch (err) {
    console.warn('[Exa] Search failed:', err.message);
    return [];
  }

  return (data.results || []).map((r) => parseJobListing(r));
}

export function parseJobListing(r) {
  const url = r.url || '';
  const rawTitle = r.title || '';
  const text = r.text || '';

  let source = 'exa';
  let source_id = hashUrl(url);
  let company = '';
  let role_title = rawTitle;

  // Detect Lever URL: jobs.lever.co/{company}/{id}
  const leverMatch = url.match(/jobs\.lever\.co\/([^/]+)\/([^/?#]+)/);
  if (leverMatch) {
    source = 'exa_lever';
    source_id = leverMatch[2]; // lever posting ID for dedup
    company = leverMatch[1].replace(/-/g, ' ');
  }

  // Detect Greenhouse URL: boards.greenhouse.io/{company}/jobs/{id}
  const ghMatch = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (ghMatch) {
    source = 'exa_greenhouse';
    source_id = ghMatch[2];
    company = ghMatch[1].replace(/-/g, ' ');
  }

  // Ashby: jobs.ashbyhq.com/{company}/{id}
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([^/?#]+)/);
  if (ashbyMatch) {
    source = 'exa_ashby';
    source_id = ashbyMatch[2];
    company = ashbyMatch[1].replace(/-/g, ' ');
  }

  // Parse role_title and company from page title
  // Common patterns: "Role Title at Company", "Role Title | Company", "Role Title - Company"
  // Also: "Role Title - Company | Lever" (strip trailing " | Lever")
  const cleanTitle = rawTitle.replace(/\s*[|]\s*(Lever|Greenhouse|Ashby|Workday|SmartRecruiters|iCIMS|Jobvite)\s*$/i, '').trim();
  const titleMatch = cleanTitle.match(/^(.+?)\s*(?:\bat\b|[-–|])\s*(.+)$/);
  if (titleMatch) {
    role_title = titleMatch[1].trim();
    if (!company) company = titleMatch[2].trim();
  } else {
    role_title = cleanTitle || rawTitle;
  }

  return {
    source,
    source_id,
    company: company || '',
    role_title: role_title || rawTitle,
    location: extractLocation(text),
    posting_url: url,
    jd_text: text,
  };
}

function extractLocation(text) {
  const first600 = text.slice(0, 600);

  // "Location: City, ST" or "Location: Remote"
  const locLabel = first600.match(/(?:location|based in|located in)[:\s]+([A-Za-z][^,\n]{2,30}(?:,\s*[A-Z]{2})?)/i);
  if (locLabel) return locLabel[1].trim();

  // Remote signal before city extraction
  if (/\bfully\s+remote\b|\bremote[\s-]first\b/i.test(first600)) return 'Remote';

  // City, ST pattern
  const cityState = first600.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2})\b/);
  if (cityState) return `${cityState[1].trim()}, ${cityState[2]}`;

  if (/\bremote\b/i.test(first600)) return 'Remote';

  return '';
}
