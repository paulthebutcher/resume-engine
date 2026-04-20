import React, { useState, useEffect } from 'react';
import { getOutcomeAnalytics } from '../api.js';

const DIM_LABELS = {
  hard_requirements: 'Hard Requirements',
  core_responsibilities: 'Core Responsibilities',
  domain_industry: 'Domain / Industry',
  seniority_scope: 'Seniority & Scope',
  strategic_value: 'Strategic Value',
  compensation_plausibility: 'Comp Fit',
};

function fmtPct(x) {
  return x == null ? '—' : `${Math.round(x * 100)}%`;
}

function fmtNum(x, digits = 0) {
  return x == null ? '—' : x.toFixed(digits);
}

function deltaColor(delta) {
  if (delta == null) return 'text-gray-400';
  if (delta >= 10) return 'text-green-600 dark:text-green-400';
  if (delta >= 3) return 'text-green-500 dark:text-green-300';
  if (delta <= -10) return 'text-red-600 dark:text-red-400';
  if (delta <= -3) return 'text-orange-500 dark:text-orange-400';
  return 'text-gray-500 dark:text-gray-400';
}

function buildTakeaway(data) {
  if (!data || data.funnel.positive + data.funnel.negative === 0) return null;
  const valid = data.correlations.filter((c) => c.delta != null);
  if (!valid.length) return null;
  const best = valid.reduce((a, b) => (b.delta > a.delta ? b : a));
  const worst = valid.reduce((a, b) => (b.delta < a.delta ? b : a));
  const lines = [];
  if (best.delta >= 5) {
    const threshold = Math.max(0, Math.round(best.positiveMean - 5));
    lines.push(
      `${DIM_LABELS[best.dimension]} has the strongest callback signal (+${Math.round(best.delta)}). Consider prioritizing roles where this score is ≥ ${threshold}.`
    );
  }
  if (worst.delta <= -5) {
    lines.push(
      `${DIM_LABELS[worst.dimension]} may be a false positive (${Math.round(worst.delta)}). High scores there aren't translating to callbacks.`
    );
  }
  return lines.length ? lines : null;
}

export default function Insights() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      setData(await getOutcomeAnalytics());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !data) load();
  }, [open]);

  const funnel = data?.funnel;
  const hasOutcomes = funnel && funnel.positive + funnel.negative > 0;
  const takeaways = buildTakeaway(data);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Insights</span>
          {funnel && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {funnel.positive} callback{funnel.positive === 1 ? '' : 's'} from {funnel.positive + funnel.negative} closed · {fmtPct(funnel.callbackRate)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={(e) => { e.stopPropagation(); load(); }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Refresh
            </button>
          )}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100 dark:border-gray-800">
          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {err && <p className="text-xs text-red-500">{err}</p>}

          {!loading && !err && data && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Total tracked" value={funnel.total} />
                <Stat label="Callbacks" value={funnel.positive} tone="positive" />
                <Stat label="Rejected / silent" value={funnel.negative} tone="negative" help={`silent = no reply in ${data.silenceDays}+ days`} />
                <Stat label="Pending" value={funnel.pending} />
              </div>

              {!hasOutcomes ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  No closed applications yet. Mark jobs as <span className="font-medium">Applied</span>, then update them to <span className="font-medium">Heard back</span>, <span className="font-medium">Rejected</span>, or <span className="font-medium">Offer</span> using the status dropdown on each job. After {data.silenceDays} days with no update, an <span className="font-medium">Applied</span> job is counted as silent.
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Dimension deltas (callback mean − rejected/silent mean)</p>
                    <div className="space-y-1">
                      {data.correlations
                        .slice()
                        .sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999))
                        .map((c) => (
                          <div key={c.dimension} className="flex items-center text-xs">
                            <span className="w-44 shrink-0 text-gray-600 dark:text-gray-400">{DIM_LABELS[c.dimension]}</span>
                            <span className="w-20 tabular-nums text-gray-500">{fmtNum(c.positiveMean)} vs {fmtNum(c.negativeMean)}</span>
                            <span className={`w-16 text-right tabular-nums font-semibold ${deltaColor(c.delta)}`}>
                              {c.delta == null ? '—' : (c.delta > 0 ? '+' : '') + c.delta.toFixed(1)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {takeaways && takeaways.length > 0 && (
                    <div className="rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3 space-y-1">
                      {takeaways.map((t, i) => (
                        <p key={i} className="text-xs text-blue-900 dark:text-blue-200">{t}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, help }) {
  const toneClass =
    tone === 'positive' ? 'text-green-600 dark:text-green-400'
    : tone === 'negative' ? 'text-red-600 dark:text-red-400'
    : 'text-gray-900 dark:text-gray-100';
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 p-2" title={help || ''}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
