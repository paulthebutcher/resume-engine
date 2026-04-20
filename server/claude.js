import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

function parseJSON(text, label) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Failed to parse ${label} response as JSON`);
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`Invalid JSON in ${label} response: ${e.message}`);
  }
}

// ── Step 1: Fit Assessment ────────────────────────────────────────────────────
export async function scoreFit(bankContent, jdText, compTarget = { min: 150000, max: 190000 }) {
  const targetMinK = Math.round(compTarget.min / 1000);
  const targetMaxK = Math.round(compTarget.max / 1000);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a job fit assessor for a senior product/strategy executive. You receive their experience bank and a target job description. Your job is to evaluate fit accurately and honestly across multiple dimensions.

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "company": "<company name parsed from JD>",
  "role_title": "<role title parsed from JD>",
  "dimensions": {
    "hard_requirements": {
      "score": <0-100>,
      "weight": 25,
      "explanation": "<1-2 sentences. Does the candidate meet stated requirements — years of experience, specific skills, domain expertise, education, management scope? Be honest about gaps.>"
    },
    "core_responsibilities": {
      "score": <0-100>,
      "weight": 25,
      "explanation": "<1-2 sentences. How directly do the candidate's strongest accomplishments map to the top 3-5 responsibilities in the JD? Look for specific evidence, not adjacent experience.>"
    },
    "domain_industry": {
      "score": <0-100>,
      "weight": 15,
      "explanation": "<1-2 sentences. Is the candidate coming from a relevant industry or is there a real translation gap? Be specific about what transfers and what doesn't.>"
    },
    "seniority_scope": {
      "score": <0-100>,
      "weight": 15,
      "explanation": "<1-2 sentences. Is the role's scope (team size, budget, reporting line, decision authority) aligned with the candidate's level? Flag if over- or under-leveled.>"
    },
    "strategic_value": {
      "score": <0-100>,
      "weight": 10,
      "explanation": "<1-2 sentences. Even if fit is imperfect, is there strategic value in applying — network, interview practice, target company, domain expansion?>"
    },
    "compensation_plausibility": {
      "score": <0-100>,
      "weight": 10,
      "explanation": "<1-2 sentences. Score how attractive this role's likely base compensation is RELATIVE TO the candidate's target of $${targetMinK}K–$${targetMaxK}K. Infer likely comp from company stage, funding, location, role level, and any stated ranges. Scoring: signals clearly AT OR ABOVE $${targetMaxK}K → 85–100; signals within or near the $${targetMinK}K–$${targetMaxK}K target → 80–95; ~10% below target → 60–75; 20%+ below target → <50; no compensation signals in the JD → ~70 (neutral). Above-target pay is GOOD and must score high.>"
    }
  },
  "composite_score": <0-100, weighted average of dimensions>,
  "summary": "<2-3 sentences. Overall fit assessment — strongest alignment, most significant gaps, and a clear apply/skip/apply-strategically signal.>",
  "gaps_to_address": ["<gap 1>", "<gap 2>"]
}

Scoring guidance:
- 90-100: Clear, evidence-backed match on this dimension
- 70-89: Strong match with minor gaps
- 50-69: Partial match, notable gaps but not disqualifying
- 30-49: Weak match, significant gaps
- 0-29: No meaningful match on this dimension

Be honest. A realistic 55 is more useful than an inflated 75. The candidate uses these scores to decide where to spend limited time.

IMPORTANT: The candidate does NOT have a bachelor's degree. Treat any hard requirement for a degree as a gap, but not a disqualifier for product/strategy roles.`,
    messages: [{
      role: 'user',
      content: `=== EXPERIENCE BANK ===\n${bankContent}\n\n=== TARGET JOB DESCRIPTION ===\n${jdText}`,
    }],
  });

  return parseJSON(response.content[0].text, 'fit assessment');
}

// ── Step 2: Tailor Resume ─────────────────────────────────────────────────────
export async function tailorResume(bankContent, defaultResume, jdText, fitAssessment) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `You are a resume tailoring engine for a senior product/strategy executive. You receive their experience bank, default resume, target JD, and a pre-computed fit assessment.

A recruiter will spend 30 seconds on this resume and decide: forward to hiring manager, maybe, or reject. Your job is to engineer that 30-second read so the verdict is "forward".

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "tailored_resume": "<full plain-text resume. NO markdown, NO asterisks. Hyphens for bullets. ALL CAPS headers. Start from default, apply the tailoring playbook below, never fabricate.>",
  "outreach_blurb": "<3-4 sentences. Confident, role-specific, paste-ready. Address the top gap from the fit assessment directly — don't ignore it, reframe it as a strength or acknowledge it honestly.>",
  "tailoring_notes": "<2-3 sentences explaining what you changed from the default and why. Which gaps you prioritized, which you deprioritized, what got swapped in from the bank.>"
}

═══ TAILORING PLAYBOOK ═══

1. GAP PRIORITIZATION
The fit assessment lists gaps and dimension scores. Rank the gaps by impact:
- Gaps in dimensions with weight ≥ 20 (hard_requirements, core_responsibilities) → TOP PRIORITY. Spend real estate here.
- Gaps in weight-15 dimensions (domain_industry, seniority_scope) → SECONDARY. Address through strategic swaps from the bank if the evidence exists; mirror JD language even when it doesn't.
- Gaps in weight-10 dimensions (strategic_value, compensation) → TERTIARY. Keyword mirroring only; don't rewrite bullets for these.
Address the top 2 gaps in actual bullet content. Handle the rest via summary phrasing and keyword presence.

2. TOP-THIRD SURGERY
The summary + the most recent role's first three bullets are where the 30-second recruiter read lives. These are non-negotiable real estate:
- Summary (2-3 sentences): rewrite for THIS JD. Lead with the single strongest credential that maps to the role title. Second sentence addresses the #1 gap via transferable evidence. Third sentence ties scope/impact to the JD's level.
- Most recent role's first three bullets: each one must carry a specific signal the JD is looking for. If the default's top bullets don't do this, swap them for bank items that do. These three bullets ARE the resume for most readers.

3. BULLET QUALITY BAR
Every bullet in the tailored resume must have ALL THREE:
(a) A strong verb — led, built, launched, shipped, scaled, drove, reduced, grew, negotiated, established. Never "assisted with", "involved in", "contributed to", "participated in", "worked on", "helped".
(b) A quantified outcome OR a specific scope marker. A number ($X revenue, X% lift, X-person team, X markets), or a concrete scope (full P&L, 0-to-1 launch, cross-functional org of X).
(c) A JD-relevant domain or capability signal when the underlying evidence supports it.

If a default-resume bullet doesn't meet this bar for THIS JD, either rewrite it using bank content (without fabricating metrics), or cut it and pull a stronger item from the bank. Do not ship vague bullets like "advised on product decisions" or "managed cross-functional initiatives".

Vary rhythm and sentence length. Not every bullet should follow "[verb] [metric] [scope]" — some can be narrative-led where that tells the story better. Avoid the machine-generated cadence.

4. PRESERVATION RULES
- Preserve all real metrics from the bank EXACTLY. Never round up, never invent.
- Never claim experience the bank doesn't support. Better to mirror JD language ("familiar with X") than to fabricate a credential.
- Keep candidate voice consistent with the default resume.
- Target 500-650 words total.

5. HARD CONSTRAINTS
- The candidate does NOT have a bachelor's degree. Never list "B.S." or any degree. Use "Chemical Engineering Studies" or an "Early Career" section.
- Contact: Paul Butcher | Salt Lake City, UT | 216-903-5833 | hello@paulb.pro | paulb.pro | LinkedIn: /in/pabutcher`,
    messages: [{
      role: 'user',
      content: `=== EXPERIENCE BANK ===\n${bankContent}\n\n=== APPROVED DEFAULT RESUME ===\n${defaultResume}\n\n=== TARGET JOB DESCRIPTION ===\n${jdText}\n\n=== FIT ASSESSMENT ===\n${JSON.stringify(fitAssessment)}`,
    }],
  });

  return parseJSON(response.content[0].text, 'tailor');
}

// ── Step 3: Match Evaluation ──────────────────────────────────────────────────
export async function evaluateMatch(tailoredResume, jdText) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a resume-to-JD match evaluator. You receive a tailored resume and a job description. Evaluate how well this specific resume presents the candidate for this specific role.

You are evaluating the RESUME, not the candidate. A strong candidate with a poorly tailored resume should score lower than the same candidate with a well-tailored resume.

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "match_score": <0-100>,
  "keyword_coverage": "<1-2 sentences. How well does the resume incorporate the JD's key terms, skills, and language? Would an ATS keyword scan find strong overlap?>",
  "evidence_strength": "<1-2 sentences. Does the resume provide specific, quantified evidence for the JD's core requirements, or is it vague?>",
  "gap_visibility": "<1-2 sentences. Are there obvious requirements from the JD that the resume doesn't address at all? List them.>",
  "improvement_suggestion": "<1 concrete suggestion for how the resume could better address this JD, if anything.>"
}

Scoring: This is about presentation quality, not candidate fit. A 60 fit candidate with an 85 match resume has done excellent tailoring work. A 90 fit candidate with a 60 match resume is leaving value on the table.`,
    messages: [{
      role: 'user',
      content: `=== TAILORED RESUME ===\n${tailoredResume}\n\n=== TARGET JOB DESCRIPTION ===\n${jdText}`,
    }],
  });

  return parseJSON(response.content[0].text, 'match evaluation');
}

// ── Step 2.5: Refine (conditional) ────────────────────────────────────────────
export async function refineResume({ draftResume, jdText, matchResult, scanResult, fitDimensions, roleTitle, company }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `You are a senior resume writer doing a targeted refinement pass. A draft resume was already tailored for the JD. A critical reader — the recruiter scan — has now flagged specific weaknesses. Your job is surgical: rewrite the weak sections to address the flags without breaking what already works.

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "refined_resume": "<full plain-text resume, same format as draft. Hyphens for bullets, ALL CAPS headers, no markdown. Target 500-650 words.>",
  "refinement_notes": "<2-3 sentences. What you changed, which specific flags drove each change, what you left alone and why.>"
}

═══ REFINEMENT RULES ═══

1. ADDRESS THE FLAGS, DON'T REWRITE THE RESUME
- Read the recruiter scan's "red_flags" and "top_fix". Each flag is a target for surgical edits.
- Read the match evaluation's "improvement_suggestion". Apply it concretely.
- Read the recruiter scan's "buried_strengths" — these are strengths the reader missed. Promote them into the top third so they're NOT buried anymore.
- Leave everything else alone. Do not rewrite sections the recruiter didn't flag.

2. NO FABRICATION — EVER
- If a red flag points to missing experience (e.g., "no direct underwriting experience"), you cannot invent it. You can: mirror JD vocabulary, reframe adjacent experience with honest transfer language, or acknowledge the gap in the summary and pivot to the strongest transferable evidence.
- Never add numbers, titles, dates, or scope claims not in the original draft unless they're in the experience bank context you already had for the draft.

3. TOP-THIRD IS PRIVILEGED REAL ESTATE
- Summary + first role's first three bullets are where flagged issues MUST be addressed. If a red flag is "no credit risk background", the summary is where you address it — not buried in bullet 8.
- Moving a buried strength INTO the top three bullets is usually the biggest lever. Cut a weaker bullet there to make room.

4. BULLET QUALITY BAR (same as tailor step)
Any bullet you touch must have: strong verb + quantified outcome or scope + JD-relevant signal. No "assisted with" / "involved in" / "contributed to".

5. PRESERVE METRICS EXACTLY
Any number in the draft came from the bank. Don't round, don't drop, don't invent.

6. HARD CONSTRAINTS
- No bachelor's degree — never list "B.S." or any degree.
- Contact line must remain: Paul Butcher | Salt Lake City, UT | 216-903-5833 | hello@paulb.pro | paulb.pro | LinkedIn: /in/pabutcher`,
    messages: [{
      role: 'user',
      content: `=== ROLE ===\n${roleTitle} at ${company}\n\n=== JOB DESCRIPTION ===\n${jdText}\n\n=== DRAFT RESUME (tailored, needs refinement) ===\n${draftResume}\n\n=== FIT DIMENSIONS ===\n${JSON.stringify(fitDimensions)}\n\n=== MATCH EVALUATION ===\n${JSON.stringify(matchResult)}\n\n=== RECRUITER SCAN ===\n${JSON.stringify(scanResult)}`,
    }],
  });

  return parseJSON(response.content[0].text, 'refine');
}

// ── Step 4: Recruiter Scan ────────────────────────────────────────────────────
export async function recruiterScan(tailoredResume, jdText, roleTitle, company) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You are a seasoned tech recruiter screening resumes for a "${roleTitle}" role at ${company}. You have 30 seconds per resume and 80 to get through. You are deciding: forward to hiring manager, reject, or maybe.

Read the resume like a skim, not a deep read. What pops in the first 5 seconds? What would a human notice that a keyword scanner would miss? What would make you hesitate?

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "verdict": "forward" | "maybe" | "reject",
  "instant_impression": "<1-2 sentences. What a recruiter sees in the top third of the resume — the one-line story that jumps out, before reading carefully.>",
  "buried_strengths": ["<relevant strength the recruiter would likely miss in a 30-second scan — something in the resume that supports the role but isn't in the top third or isn't phrased prominently. 1-3 items.>"],
  "red_flags": ["<thing that would make a recruiter pause: title mismatch, short tenure, gap, unclear scope, mismatched domain. Be specific to THIS resume and JD. 1-3 items.>"],
  "top_fix": "<1 sentence. The single most impactful edit to move from the current verdict to a stronger one. Concrete and actionable — not 'tailor better'.>"
}

Be honest. If the resume is weak for this specific role, say reject. A realistic "maybe" beats an inflated "forward". A "forward" should mean: this resume, as-is, would survive a recruiter screen and reach the hiring manager.`,
    messages: [{
      role: 'user',
      content: `=== ROLE ===\n${roleTitle} at ${company}\n\n=== JOB DESCRIPTION ===\n${jdText}\n\n=== CANDIDATE RESUME ===\n${tailoredResume}`,
    }],
  });

  return parseJSON(response.content[0].text, 'recruiter scan');
}

// ── Bullet-level regeneration (interactive) ──────────────────────────────────
export async function regenerateBullet({ bulletText, steer, fullResume, jdText, bankContent, roleTitle, company }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `You are rewriting a SINGLE line from a tailored resume. The candidate has asked for a targeted rewrite with specific guidance.

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "new_bullet": "<the rewritten single line, plain text, no leading hyphen, no markdown. Preserve whatever prefix style the original used (e.g., if it was a bullet starting with '- ', return just the content after the '- '; if it was a role/company header line, return the full line.)>",
  "note": "<1 sentence explaining what you changed and why.>"
}

═══ RULES ═══

1. ONE LINE ONLY
Return a single replacement for the exact line given. Do not add context above or below. Do not split into multiple bullets.

2. APPLY THE STEER
The candidate's steer is the primary instruction. Interpret it faithfully. If they say "emphasize cross-functional leadership", do exactly that. If they say "make it shorter", do exactly that.

3. NO FABRICATION
- Only use facts supported by the experience bank context you've been given.
- If the steer asks for something the bank doesn't support (e.g., "add that I led a 50-person team" when the bank doesn't say so), do NOT invent. Return the best honest rewrite and note the constraint in the note field.
- Preserve existing metrics exactly — don't round, don't change numbers.

4. BULLET QUALITY
If the original was a bullet (typically starting with "- "): the new bullet must have a strong verb (led, built, shipped, scaled, drove, etc. — NOT assisted/involved/contributed), and either a quantified outcome OR concrete scope. JD-relevant vocabulary where it's honest.

5. HEADER LINES
If the original is a role/company/date header (e.g., "SENIOR PRODUCT MANAGER | STRIPE | 2022-PRESENT"), return the same structured format. Don't convert header lines into bullet content.

6. CONTEXT AWARENESS
You have the full tailored resume and JD as context. Keep voice and tense consistent with the rest of the resume. Don't duplicate content from neighboring bullets.`,
    messages: [{
      role: 'user',
      content: `=== ROLE ===\n${roleTitle} at ${company}\n\n=== JOB DESCRIPTION ===\n${jdText}\n\n=== FULL TAILORED RESUME (for context) ===\n${fullResume}\n\n=== EXPERIENCE BANK (source of truth) ===\n${bankContent}\n\n=== LINE TO REWRITE ===\n${bulletText}\n\n=== CANDIDATE'S STEER ===\n${steer || '(no specific steer — just make this line stronger per the bullet quality rules)'}`,
    }],
  });

  return parseJSON(response.content[0].text, 'regenerate bullet');
}

// ── Default Resume Generation (unchanged) ────────────────────────────────────
export async function generateDefaultResume(bankContent) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a resume writer for a senior product/strategy executive. You will receive their complete experience bank.

Generate a polished, ATS-safe default resume in plain text. This is their "best 70%" — strongest, most versatile content for Director/VP/Head-of-Product/Chief-of-Staff roles.

Rules:
- Plain text only. No markdown, no bold markers, no asterisks. Use hyphens for bullets.
- Sections in ALL CAPS: SUMMARY, EXPERIENCE, EDUCATION (or EARLY CAREER), SKILLS
- Summary: 2-3 sentences, confident and specific
- Experience: Reverse chronological. 3-5 bullets per role, strong verbs, metrics where available
- Preserve all real metrics exactly — never fabricate
- ATS-safe: no tables, columns, graphics, special characters
- ~500-650 words
- Direct, confident voice
- IMPORTANT: The candidate does NOT have a bachelor's degree. Never list "B.S." or any degree. Use "Chemical Engineering Studies" or an "Early Career" section instead of Education.
- Contact: Paul Butcher | Salt Lake City, UT | 216-903-5833 | hello@paulb.pro | paulb.pro | LinkedIn: /in/pabutcher

Return ONLY the resume text.`,
    messages: [{ role: 'user', content: bankContent }],
  });

  return response.content[0].text;
}
