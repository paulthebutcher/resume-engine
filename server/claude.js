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

Use the fit assessment to guide your tailoring — prioritize addressing identified gaps, lean into confirmed strengths, and mirror JD language where the candidate has authentic evidence.

Return ONLY valid JSON. No markdown fences, no preamble.

{
  "tailored_resume": "<full plain-text resume. NO markdown, NO asterisks. Hyphens for bullets. ALL CAPS headers. Start from default, swap bank items for JD gaps, mirror JD language, reorder by relevance. Never fabricate.>",
  "outreach_blurb": "<3-4 sentences. Confident, role-specific, paste-ready. Address the top gap from the fit assessment directly — don't ignore it, reframe it as a strength or acknowledge it honestly.>",
  "tailoring_notes": "<2-3 sentences explaining what you changed from the default and why. What got swapped in, what got deprioritized.>"
}

Tailoring rules:
- Start from default resume structure
- Swap bank items only when they address a JD gap the default misses
- Remove weakest-fit bullet when swapping to maintain length
- Mirror JD terminology where authentic
- Preserve all real metrics exactly
- Keep candidate voice consistent
- IMPORTANT: The candidate does NOT have a bachelor's degree. Never list "B.S." or any degree. Use "Chemical Engineering Studies" or an "Early Career" section.
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
