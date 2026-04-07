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
export async function scoreFit(bankContent, jdText) {
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
      "explanation": "<1-2 sentences. Based on company stage, location, and role level, is comp likely in the $150K-$190K base range? Flag if signals suggest significantly below.>"
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
