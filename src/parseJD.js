/**
 * Heuristic parser for job description text.
 * Returns { company, roleTitle } — either may be empty string if not found.
 */
export function parseJD(text) {
  if (!text || !text.trim()) return { company: '', roleTitle: '' };

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // --- Role title patterns ---
  const titlePrefixes = [
    /^(Chief\s+\w+\s+Officer)\b/i,
    /^(VP\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(Vice\s+President\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(SVP\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(EVP\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(Head\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(Director\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(Senior\s+Director\s+of\s+[\w\s]+?)(?:\s*[,|–\-]|$)/i,
    /^(General\s+Manager[\w\s,]*)(?:\s*[,|–\-]|$)/i,
    /^(Chief\s+of\s+Staff[\w\s,]*)(?:\s*[,|–\-]|$)/i,
    /^([\w\s]*(Product|Strategy|Operations|Growth|Revenue|Marketing|GTM|Sales|Partnerships|Business\s+Development)[\w\s]*(Manager|Lead|Director|VP|Head|Officer|Strategist))(?:\s*[,|–\-]|$)/i,
  ];

  // Scan all lines for a role title match
  let roleTitle = '';
  for (const line of lines.slice(0, 20)) {
    for (const pattern of titlePrefixes) {
      const m = line.match(pattern);
      if (m) {
        roleTitle = m[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }
    if (roleTitle) break;
  }

  // Fallback: if first non-empty line is short (< 60 chars) and has no period, treat as title
  if (!roleTitle && lines[0] && lines[0].length < 60 && !lines[0].includes('.')) {
    roleTitle = lines[0];
  }

  // --- Company name patterns ---
  const companyPatterns = [
    // "About Acme Corp" section header
    /^About\s+([A-Z][^\n]{2,50})$/i,
    // "at Acme Corp" in any line
    /\bat\s+([A-Z][A-Za-z0-9\s&.,'-]{1,40}?)(?:\s*[,.|]|\s+is\b|\s+we\b|\s+our\b|$)/,
    // "Company: Acme Corp" label
    /^Company[:\s]+([A-Z][A-Za-z0-9\s&.,'-]{1,40})/i,
    // "Join Acme Corp" near beginning
    /^Join\s+([A-Z][A-Za-z0-9\s&.,'-]{1,40?})(?:\s+as\b|\s+and\b|[,.]|$)/,
    // "Acme Corp is hiring" / "Acme Corp is looking"
    /^([A-Z][A-Za-z0-9\s&.,'-]{1,40})\s+is\s+(?:hiring|looking|seeking|searching)/i,
  ];

  let company = '';
  const fullText = text.slice(0, 3000); // only scan first ~3000 chars

  for (const line of lines.slice(0, 40)) {
    for (const pattern of companyPatterns) {
      const m = line.match(pattern);
      if (m) {
        const candidate = m[1].trim().replace(/\s+/g, ' ');
        // Skip if it looks like a sentence fragment (>5 words) or is all lowercase
        const words = candidate.split(' ');
        if (words.length <= 5 && candidate !== candidate.toLowerCase()) {
          company = candidate;
          break;
        }
      }
    }
    if (company) break;
  }

  // Fallback: scan full text for "at [Company]" pattern
  if (!company) {
    const m = fullText.match(/\bat\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3})/);
    if (m) company = m[1].trim();
  }

  return { company, roleTitle };
}
