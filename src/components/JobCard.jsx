import React, { useState } from 'react';
import { rerunJob, deleteJob, downloadDocx, setAppStatus, regenerateBullet } from '../api.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_STATUSES = [
  { value: null,           label: 'Not applied',  color: '' },
  { value: 'applied',      label: 'Applied',       color: 'text-blue-600 dark:text-blue-400' },
  { value: 'heard_back',   label: 'Heard back',    color: 'text-indigo-600 dark:text-indigo-400' },
  { value: 'interviewing', label: 'Interviewing',  color: 'text-violet-600 dark:text-violet-400' },
  { value: 'offer',        label: 'Offer',         color: 'text-green-600 dark:text-green-400' },
  { value: 'rejected',     label: 'Rejected',      color: 'text-red-500 dark:text-red-400' },
  { value: 'passed',       label: 'Passed',        color: 'text-gray-400' },
];

const DIMENSION_LABELS = {
  hard_requirements:      'Hard Requirements',
  core_responsibilities:  'Core Responsibilities',
  domain_industry:        'Domain / Industry',
  seniority_scope:        'Seniority & Scope',
  strategic_value:        'Strategic Value',
  compensation_plausibility: 'Comp Fit',
};

const STATUS_STEPS = ['queued', 'scoring', 'tailoring', 'evaluating', 'refining', 'complete'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score == null) return 'bg-gray-200 dark:bg-gray-700';
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-400';
  if (score >= 40) return 'bg-orange-400';
  return 'bg-red-500';
}

function scoreTextColor(score) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function ScoreRing({ score, size = 36 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const dash = (pct / 100) * circ;

  let stroke = '#9ca3af';
  if (score != null) {
    if (score >= 80) stroke = '#22c55e';
    else if (score >= 60) stroke = '#facc15';
    else if (score >= 40) stroke = '#f97316';
    else stroke = '#ef4444';
  }

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke}
          strokeWidth={5} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold"
        style={{ color: stroke }}>
        {score != null ? score : '—'}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    queued:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    scoring:    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    tailoring:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    evaluating: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    refining:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    complete:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    error:      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const isActive = ['scoring', 'tailoring', 'evaluating', 'refining'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${styles[status] || ''}`}>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {status}
    </span>
  );
}

function ProgressSteps({ status }) {
  const idx = STATUS_STEPS.indexOf(status);
  if (idx === -1 || status === 'queued' || status === 'complete' || status === 'error') return null;
  return (
    <div className="flex items-center gap-1 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
      {['scoring', 'tailoring', 'evaluating', 'refining'].map((step, i, arr) => {
        const stepIdx = STATUS_STEPS.indexOf(step);
        const done = idx > stepIdx;
        const active = idx === stepIdx;
        return (
          <React.Fragment key={step}>
            <span className={`text-xs ${done ? 'text-green-600 dark:text-green-400' : active ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>
              {done ? '✓ ' : active ? '⟳ ' : ''}{step}
            </span>
            {i < arr.length - 1 && <span className="text-gray-300 dark:text-gray-600 text-xs">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function DimensionBar({ dimKey, dim }) {
  const [open, setOpen] = useState(false);
  const label = DIMENSION_LABELS[dimKey] || dimKey;
  const pct = Math.min(100, Math.max(0, dim.score));
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left group"
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-gray-600 dark:text-gray-400 w-44 shrink-0">{label}</span>
          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor(dim.score)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-semibold w-8 text-right ${scoreTextColor(dim.score)}`}>{dim.score}</span>
          <span className="text-gray-400 text-xs w-3">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-44 pl-2 mt-1 mb-1">{dim.explanation}</p>
      )}
    </div>
  );
}

function InteractiveResume({ text, jobId, onUpdated }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [steer, setSteer] = useState('');
  const [regenning, setRegenning] = useState(false);
  const [err, setErr] = useState('');
  const [lastNote, setLastNote] = useState(null);

  const lines = text.split('\n');

  const canRegen = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|EARLY CAREER)$/i.test(trimmed)) return false;
    if (/Paul Butcher \| Salt Lake City/.test(line)) return false;
    return true;
  };

  const handleRegen = async (idx) => {
    setRegenning(true);
    setErr('');
    try {
      const result = await regenerateBullet(jobId, { bulletText: lines[idx], steer });
      setLastNote({ idx, note: result.note });
      setEditingIdx(null);
      setSteer('');
      onUpdated?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRegenning(false);
    }
  };

  return (
    <div className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded font-mono max-h-80 overflow-y-auto">
      {lines.map((line, idx) => {
        const regenerable = canRegen(line);
        const isEditing = editingIdx === idx;
        const showNote = lastNote && lastNote.idx === idx;
        return (
          <div key={idx} className="group relative">
            <div className="flex items-start gap-2">
              <pre className="flex-1 whitespace-pre-wrap min-h-[1em]">{line || ' '}</pre>
              {regenerable && !isEditing && (
                <button
                  onClick={() => { setEditingIdx(idx); setSteer(''); setErr(''); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 shrink-0"
                  title="Regenerate this line"
                >
                  ⟲ Regen
                </button>
              )}
            </div>
            {isEditing && (
              <div className="mt-1 mb-2 ml-0 p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 space-y-1.5">
                <input
                  type="text"
                  value={steer}
                  onChange={(e) => setSteer(e.target.value)}
                  placeholder="What should this line emphasize? (optional — leave blank to just strengthen it)"
                  className="w-full px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 font-sans"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !regenning) handleRegen(idx);
                    if (e.key === 'Escape') { setEditingIdx(null); setSteer(''); }
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRegen(idx)}
                    disabled={regenning}
                    className="text-[11px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-sans"
                  >
                    {regenning ? 'Regenerating…' : 'Regenerate'}
                  </button>
                  <button
                    onClick={() => { setEditingIdx(null); setSteer(''); }}
                    className="text-[11px] text-gray-500 hover:text-gray-700 font-sans"
                  >
                    Cancel
                  </button>
                  {err && <span className="text-[11px] text-red-500 font-sans">{err}</span>}
                </div>
              </div>
            )}
            {showNote && !isEditing && (
              <p className="text-[10px] text-blue-700 dark:text-blue-400 italic pl-2 font-sans">
                {lastNote.note}
                <button onClick={() => setLastNote(null)} className="ml-2 text-gray-400 hover:text-gray-600">×</button>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VerdictBadge({ verdict }) {
  const styles = {
    forward: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800',
    maybe:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
    reject:  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
  };
  const cls = styles[verdict] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-semibold ${cls}`}
      title="Recruiter scan verdict"
    >
      {verdict}
    </span>
  );
}

function AppStatusDropdown({ jobId, currentStatus, onUpdated }) {
  const current = APP_STATUSES.find((s) => s.value === currentStatus) || APP_STATUSES[0];
  const handleChange = async (e) => {
    const val = e.target.value === 'null' ? null : e.target.value;
    try {
      await setAppStatus(jobId, val);
      onUpdated({ application_status: val });
    } catch (err) {
      alert('Status update failed: ' + err.message);
    }
  };
  return (
    <select
      value={currentStatus ?? 'null'}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className={`text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-900 focus:outline-none cursor-pointer ${current.color}`}
    >
      {APP_STATUSES.map((s) => (
        <option key={String(s.value)} value={s.value ?? 'null'}>{s.label}</option>
      ))}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function JobCard({ job, onDeleted, onUpdated, onRerun, bankUpdatedAt }) {
  const [expanded, setExpanded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tailoringOpen, setTailoringOpen] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  const isStale =
    job.status === 'complete' &&
    bankUpdatedAt &&
    job.bank_version &&
    job.bank_version < bankUpdatedAt;

  const dimensions = job.fit_dimensions ? (() => { try { return JSON.parse(job.fit_dimensions); } catch { return null; } })() : null;
  const gaps = job.gaps_to_address ? (() => { try { return JSON.parse(job.gaps_to_address); } catch { return []; } })() : [];
  const recruiterScan = job.recruiter_scan ? (() => { try { return JSON.parse(job.recruiter_scan); } catch { return null; } })() : null;

  const canExpand = job.status === 'complete' || (job.composite_score != null && job.status !== 'error');

  const handleRerun = async (e) => {
    e.stopPropagation();
    try { await rerunJob(job.id); onRerun(); } catch (err) { alert('Re-run failed: ' + err.message); }
  };
  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this job?')) return;
    try { await deleteJob(job.id); onDeleted(job.id); } catch (err) { alert('Delete failed: ' + err.message); }
  };
  const handleExport = async (e) => {
    e.stopPropagation();
    setExporting(true);
    try { await downloadDocx(job.id); } catch (err) { alert('Export failed: ' + err.message); } finally { setExporting(false); }
  };
  const handleOptimisticUpdate = (fields) => onUpdated({ ...job, ...fields });

  const title = [job.company, job.role_title].filter(Boolean).join(' — ') || 'Processing...';
  const date = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">

      {/* ── Header row ── */}
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors ${canExpand ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ScoreRing score={job.composite_score} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={job.status} />
              <span className="font-medium text-sm truncate max-w-xs">{title}</span>
              {isStale && (
                <span title="Bank updated since tailored — consider re-tailoring"
                  className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  stale
                </span>
              )}
            </div>
            {job.status === 'complete' && (
              <div className="flex items-center gap-2 mt-0.5">
                {job.match_score != null && (
                  <span className={`text-xs ${scoreTextColor(job.match_score)}`}>
                    Match: {job.match_score}
                  </span>
                )}
                {job.recruiter_verdict && <VerdictBadge verdict={job.recruiter_verdict} />}
                <AppStatusDropdown jobId={job.id} currentStatus={job.application_status} onUpdated={handleOptimisticUpdate} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <span className="text-xs text-gray-400 hidden sm:block">{date}</span>
          {job.status === 'complete' && (
            <button onClick={handleExport} disabled={exporting}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              {exporting ? '...' : '.docx'}
            </button>
          )}
          {(job.status === 'complete' || job.status === 'error') && (
            <button onClick={handleRerun}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={isStale ? 'Re-tailor with updated bank' : 'Re-run'}>
              {isStale ? 'Re-tailor' : 'Re-run'}
            </button>
          )}
          <button onClick={handleDelete}
            className="px-2 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Del
          </button>
          {canExpand && <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>}
        </div>
      </button>

      {/* ── Progress steps (active jobs) ── */}
      <ProgressSteps status={job.status} />

      {/* ── Error ── */}
      {job.status === 'error' && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm border-t border-red-100 dark:border-red-900">
          {job.error}
        </div>
      )}

      {/* ── Expanded content ── */}
      {expanded && canExpand && (
        <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">

          {/* Fit Assessment */}
          {(job.composite_score != null || dimensions) && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fit Assessment</h4>
                <span className={`text-lg font-bold ${scoreTextColor(job.composite_score)}`}>
                  {job.composite_score ?? '—'}
                </span>
              </div>

              {job.fit_summary && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{job.fit_summary}</p>
              )}

              {dimensions && (
                <div className="space-y-1.5 pt-1">
                  {Object.entries(dimensions).map(([key, dim]) => (
                    <DimensionBar key={key} dimKey={key} dim={dim} />
                  ))}
                </div>
              )}

              {gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Gaps to address</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gaps.map((g, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tailored Resume */}
          {job.tailored_resume && (
            <div className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {showDraft && job.draft_resume ? 'Draft Resume (pre-refinement)' : 'Tailored Resume'}
                  </h4>
                  {job.draft_resume && !showDraft && (
                    <span
                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800"
                      title="This resume was refined based on the recruiter scan and match evaluation."
                    >
                      refined
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {job.draft_resume && (
                    <button
                      onClick={() => setShowDraft(!showDraft)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showDraft ? 'Show refined' : 'Show draft'}
                    </button>
                  )}
                  <CopyButton text={showDraft && job.draft_resume ? job.draft_resume : job.tailored_resume} />
                </div>
              </div>
              {showDraft && job.draft_resume ? (
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
                  {job.draft_resume}
                </pre>
              ) : (
                <InteractiveResume
                  text={job.tailored_resume}
                  jobId={job.id}
                  onUpdated={() => onRerun && onRerun()}
                />
              )}

              {/* Refinement notes */}
              {job.refinement_notes && !showDraft && (
                <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-900 rounded p-2">
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400 mb-0.5">Refinement notes</p>
                  <p className="text-xs text-teal-900 dark:text-teal-200">{job.refinement_notes}</p>
                </div>
              )}

              {/* Tailoring notes */}
              {job.tailoring_notes && (
                <div>
                  <button
                    onClick={() => setTailoringOpen(!tailoringOpen)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                  >
                    {tailoringOpen ? '▲' : '▼'} Tailoring notes
                  </button>
                  {tailoringOpen && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                      {job.tailoring_notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Match Evaluation */}
          {job.match_score != null && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Match Evaluation</h4>
                <span className={`text-lg font-bold ${scoreTextColor(job.match_score)}`}>
                  {job.match_score}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${scoreColor(job.match_score)}`} style={{ width: `${job.match_score}%` }} />
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Keyword coverage', val: job.match_keyword },
                  { label: 'Evidence strength', val: job.match_evidence },
                  { label: 'Gap visibility', val: job.match_gaps },
                ].filter(x => x.val).map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm">{val}</p>
                  </div>
                ))}
                {job.match_suggestion && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded p-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-0.5">Improvement suggestion</p>
                    <p className="text-sm text-blue-800 dark:text-blue-300">{job.match_suggestion}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recruiter Scan */}
          {recruiterScan && (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recruiter Scan</h4>
                {job.recruiter_verdict && <VerdictBadge verdict={job.recruiter_verdict} />}
              </div>

              {recruiterScan.instant_impression && (
                <blockquote className="text-sm italic text-gray-700 dark:text-gray-300 border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                  {recruiterScan.instant_impression}
                </blockquote>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recruiterScan.buried_strengths?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Buried strengths</p>
                    <ul className="space-y-1">
                      {recruiterScan.buried_strengths.map((s, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3 -indent-3">• {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {recruiterScan.red_flags?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Red flags</p>
                    <ul className="space-y-1">
                      {recruiterScan.red_flags.map((f, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300 pl-3 -indent-3">• {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {recruiterScan.top_fix && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900 rounded p-2">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">Top fix</p>
                  <p className="text-sm text-amber-900 dark:text-amber-200">{recruiterScan.top_fix}</p>
                </div>
              )}
            </div>
          )}

          {/* Outreach Blurb */}
          {job.outreach_blurb && (
            <div className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Outreach Blurb</h4>
                <CopyButton text={job.outreach_blurb} />
              </div>
              <p className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded">{job.outreach_blurb}</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
