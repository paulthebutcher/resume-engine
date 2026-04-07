import React, { useState, useEffect, useCallback } from 'react';
import {
  getScoutSearches, addScoutSearch, updateScoutSearch, deleteScoutSearch, testScoutSearch,
  getScoutListings, dismissListing, promoteListing, patchListing, fetchListingJd,
  getScoutStatus, runScout,
  getScoutConfig, saveScoutConfig,
} from '../api.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(score) {
  if (score == null) return 'bg-gray-100 dark:bg-gray-800';
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  if (score >= 40) return 'bg-orange-100 dark:bg-orange-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function SourceBadge({ source }) {
  if (!source) return null;
  const isExa = source.startsWith('exa');
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      isExa
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
    }`}>
      {isExa ? 'Exa' : 'ATS'}
    </span>
  );
}

const DATE_FILTER_OPTIONS = [
  { value: 'day', label: 'Past day' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'any', label: 'Any time' },
];

// ── Searches ──────────────────────────────────────────────────────────────────

function SearchRow({ search, onUpdate, onDelete }) {
  const [testResults, setTestResults] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    setTestError('');
    try {
      const data = await testScoutSearch(search.id);
      setTestResults(data.results);
    } catch (err) {
      setTestError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const dateLabel = DATE_FILTER_OPTIONS.find((o) => o.value === search.date_filter)?.label || search.date_filter || 'Past week';

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{search.query}</p>
          <p className="text-xs text-gray-500">{dateLabel}</p>
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button
          onClick={() => onUpdate(search.id, { active: search.active ? 0 : 1 })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${search.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${search.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <button onClick={() => onDelete(search.id)} className="text-xs text-red-500 hover:text-red-700">Del</button>
      </div>
      {testError && (
        <p className="text-xs text-red-500 pb-2 px-1">{testError}</p>
      )}
      {testResults !== null && (
        <div className="pb-2 space-y-1">
          {testResults.length === 0 ? (
            <p className="text-xs text-gray-400 px-1">No results found</p>
          ) : testResults.map((r, i) => (
            <div key={i} className="text-xs bg-gray-50 dark:bg-gray-800/50 rounded px-2 py-1.5 flex items-start gap-2">
              <SourceBadge source={r.source} />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{r.role_title}</span>
                {r.company && <span className="text-gray-500"> · {r.company}</span>}
                {r.location && <span className="text-gray-400"> · {r.location}</span>}
              </div>
              {r.posting_url && (
                <a href={r.posting_url} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline shrink-0">↗</a>
              )}
            </div>
          ))}
          <button onClick={() => setTestResults(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">Dismiss results</button>
        </div>
      )}
    </div>
  );
}

function AddSearchForm({ onAdd }) {
  const [form, setForm] = useState({ query: '', date_filter: 'week' });

  const handleAdd = async () => {
    if (!form.query) return;
    await onAdd({ query: form.query, date_filter: form.date_filter, locations: [] });
    setForm({ query: '', date_filter: 'week' });
  };

  return (
    <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <p className="text-xs font-medium text-gray-500">Add search</p>
      <div className="flex gap-2">
        <input value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder='e.g. "Head of Product technology company"'
          className="flex-1 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none" />
        <select value={form.date_filter} onChange={(e) => setForm({ ...form, date_filter: e.target.value })}
          className="px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none">
          {DATE_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!form.query}
          className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm disabled:opacity-50">
          Add
        </button>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsPanel({ config, onConfigSaved }) {
  const [exaKey, setExaKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!config?.exa_api_key_set);
  const [savingKey, setSavingKey] = useState(false);

  const [locationMode, setLocationMode] = useState(config?.location_mode || 'us_metro');
  const [customCities, setCustomCities] = useState((config?.custom_cities || []).join('\n'));

  const [includeKw, setIncludeKw] = useState((config?.title_keywords || []).join(', '));
  const [excludeKw, setExcludeKw] = useState((config?.title_exclude || []).join(', '));
  const [savingSettings, setSavingSettings] = useState(false);

  const handleSaveKey = async () => {
    if (!exaKey.trim()) return;
    setSavingKey(true);
    try {
      await saveScoutConfig({ exa_api_key: exaKey.trim() });
      setExaKey('');
      setShowKeyInput(false);
      onConfigSaved();
    } catch (err) {
      alert('Failed to save key: ' + err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveScoutConfig({
        location_mode: locationMode,
        custom_cities: customCities.split('\n').map((s) => s.trim()).filter(Boolean),
        title_keywords: includeKw.split(',').map((s) => s.trim()).filter(Boolean),
        title_exclude: excludeKw.split(',').map((s) => s.trim()).filter(Boolean),
      });
      onConfigSaved();
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Exa API Key */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Exa API Key</h3>
        <p className="text-xs text-gray-500">
          Required for Exa-based job searches. Get a key at{' '}
          <span className="font-mono text-xs">exa.ai</span>.
        </p>
        {config?.exa_api_key_set && !showKeyInput ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{config.exa_api_key_preview}</span>
            <button onClick={() => setShowKeyInput(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Change</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={exaKey}
              onChange={(e) => setExaKey(e.target.value)}
              placeholder="exa_..."
              className="flex-1 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <button onClick={handleSaveKey} disabled={savingKey || !exaKey.trim()}
              className="px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm disabled:opacity-50">
              {savingKey ? 'Saving…' : 'Save'}
            </button>
            {config?.exa_api_key_set && (
              <button onClick={() => setShowKeyInput(false)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded text-sm">Cancel</button>
            )}
          </div>
        )}
      </div>

      {/* Location Filter */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Location Filter</h3>
        <p className="text-xs text-gray-500">Applied to Exa results. ATS watchlist listings are not filtered.</p>
        <select
          value={locationMode}
          onChange={(e) => setLocationMode(e.target.value)}
          className="px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none"
        >
          <option value="any">Any location</option>
          <option value="us_metro">US metro areas (500K+ population)</option>
          <option value="custom">Custom cities</option>
        </select>
        {locationMode === 'custom' && (
          <textarea
            value={customCities}
            onChange={(e) => setCustomCities(e.target.value)}
            placeholder="One city or region per line, e.g.&#10;Salt Lake City&#10;Denver&#10;Remote"
            rows={4}
            className="w-full px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none resize-none"
          />
        )}
      </div>

      {/* Title Keywords */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Title Keywords</h3>
        <div className="space-y-1.5">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Include (comma-separated)</label>
            <input value={includeKw} onChange={(e) => setIncludeKw(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Exclude (comma-separated)</label>
            <input value={excludeKw} onChange={(e) => setExcludeKw(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none" />
          </div>
        </div>
      </div>

      <button onClick={handleSaveSettings} disabled={savingSettings}
        className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm font-medium disabled:opacity-50">
        {savingSettings ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}

// ── Listing Card ──────────────────────────────────────────────────────────────

function ListingCard({ listing, onDismiss, onPromote, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoted, setPromoted] = useState(!!listing.promoted_to_job_id);
  const [fetchingJd, setFetchingJd] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ company: listing.company, role_title: listing.role_title });

  const dimensions = listing.fit_dimensions
    ? (() => { try { return JSON.parse(listing.fit_dimensions); } catch { return null; } })()
    : null;
  const gaps = listing.gaps_to_address
    ? (() => { try { return JSON.parse(listing.gaps_to_address); } catch { return []; } })()
    : [];

  const isExa = listing.source?.startsWith('exa');
  const jdTruncated = isExa && (listing.jd_text?.length >= 3800);

  const handlePromote = async () => {
    setPromoting(true);
    try {
      await onPromote(listing.id);
      setPromoted(true);
    } catch (err) {
      alert('Promote failed: ' + err.message);
    } finally {
      setPromoting(false);
    }
  };

  const handleFetchJd = async (e) => {
    e.stopPropagation();
    setFetchingJd(true);
    try {
      const result = await fetchListingJd(listing.id);
      onUpdate(listing.id, { jd_text: result.jd_text });
    } catch (err) {
      alert('Could not fetch full JD: ' + err.message);
    } finally {
      setFetchingJd(false);
    }
  };

  const handleSaveMeta = async (e) => {
    e.stopPropagation();
    await onUpdate(listing.id, metaForm);
    setEditingMeta(false);
  };

  const DIMENSION_LABELS = {
    hard_requirements: 'Hard Req.',
    core_responsibilities: 'Core Resp.',
    domain_industry: 'Domain',
    seniority_scope: 'Seniority',
    strategic_value: 'Strategic',
    compensation_plausibility: 'Comp',
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-opacity ${listing.dismissed ? 'opacity-40' : ''} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900`}>
      <button
        onClick={() => listing.auto_score_status === 'scored' && setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {/* Score badge */}
        <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${scoreBg(listing.composite_score)} ${scoreColor(listing.composite_score)}`}>
          {listing.composite_score ?? (listing.auto_score_status === 'scoring' ? '…' : '–')}
        </div>

        <div className="flex-1 min-w-0">
          {editingMeta ? (
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <input value={metaForm.role_title} onChange={(e) => setMetaForm({ ...metaForm, role_title: e.target.value })}
                className="flex-1 px-1.5 py-0.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none" />
              <input value={metaForm.company} onChange={(e) => setMetaForm({ ...metaForm, company: e.target.value })}
                className="w-36 px-1.5 py-0.5 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none" />
              <button onClick={handleSaveMeta} className="text-xs px-1.5 py-0.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded">Save</button>
              <button onClick={(e) => { e.stopPropagation(); setEditingMeta(false); }} className="text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm">{listing.role_title}</span>
              <SourceBadge source={listing.source} />
              {listing.promoted_to_job_id && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">tailoring</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setEditingMeta(true); setMetaForm({ company: listing.company, role_title: listing.role_title }); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✎
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">
            {listing.company}{listing.location ? ` · ${listing.location}` : ''} · {new Date(listing.discovered_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {jdTruncated && !listing.promoted_to_job_id && (
            <button
              onClick={handleFetchJd}
              disabled={fetchingJd}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
              title="JD text was truncated — click to fetch full version"
            >
              {fetchingJd ? '…' : 'Fetch JD'}
            </button>
          )}
          {listing.posting_url && (
            <a href={listing.posting_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Open ↗
            </a>
          )}
          {!promoted && !listing.dismissed && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePromote(); }}
              disabled={promoting}
              className="px-2 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded hover:opacity-90 disabled:opacity-50"
            >
              {promoting ? '…' : 'Tailor This'}
            </button>
          )}
          {!listing.dismissed && !promoted && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(listing.id); }}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Dismiss
            </button>
          )}
          {listing.auto_score_status === 'scored' && (
            <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </button>

      {expanded && listing.auto_score_status === 'scored' && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
          {listing.fit_summary && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{listing.fit_summary}</p>
          )}
          {dimensions && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {Object.entries(dimensions).map(([key, dim]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 shrink-0">{DIMENSION_LABELS[key] || key}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${dim.score >= 80 ? 'bg-green-500' : dim.score >= 60 ? 'bg-yellow-400' : dim.score >= 40 ? 'bg-orange-400' : 'bg-red-500'}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold w-6 text-right ${scoreColor(dim.score)}`}>{dim.score}</span>
                </div>
              ))}
            </div>
          )}
          {gaps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {gaps.map((g, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{g}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Scout Component ──────────────────────────────────────────────────────

export default function Scout({ onListingPromoted }) {
  const [searches, setSearches] = useState([]);
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [section, setSection] = useState('listings'); // listings | watchlist | searches | settings
  const [hideDismissed, setHideDismissed] = useState(true);
  const [minScore, setMinScore] = useState('');
  const [running, setRunning] = useState(false);
  const [progressLog, setProgressLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadListings = useCallback(async () => {
    try {
      const l = await getScoutListings({ hideDismissed: hideDismissed ? 'true' : 'false', minScore: minScore || undefined });
      setListings(l);
    } catch { /* ignore */ }
  }, [hideDismissed, minScore]);

  const loadAll = useCallback(async () => {
    try {
      const [s, l, st, cfg] = await Promise.all([
        getScoutSearches(),
        getScoutListings({ hideDismissed: hideDismissed ? 'true' : 'false', minScore: minScore || undefined }),
        getScoutStatus(),
        getScoutConfig(),
      ]);
      setSearches(s);
      setListings(l);
      setStatus(st);
      setConfig(cfg);
    } catch { /* server not ready */ }
    setLoading(false);
  }, [hideDismissed, minScore]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleScoutEvent = useCallback((data) => {
    if (data.type === 'run_started') {
      setRunning(true);
      setProgressLog([{ text: 'Run started…', time: Date.now() }]);
    }
    if (data.type === 'search_complete') {
      setProgressLog((prev) => [...prev, {
        text: `Exa: "${data.query}" → ${data.count} result${data.count !== 1 ? 's' : ''}`,
        time: Date.now(),
      }]);
    }
    if (data.type === 'company_checked') {
      setProgressLog((prev) => [...prev, {
        text: `ATS: ${data.company} → ${data.count} posting${data.count !== 1 ? 's' : ''}`,
        time: Date.now(),
      }]);
    }
    if (data.type === 'listing_scored') {
      setProgressLog((prev) => {
        // Debounce scored events into a single counter line
        const last = prev[prev.length - 1];
        if (last?.isScoreCounter) {
          return [...prev.slice(0, -1), { ...last, count: last.count + 1, text: `Scoring listings… (${last.count + 1} done)` }];
        }
        return [...prev, { text: 'Scoring listings… (1 done)', isScoreCounter: true, count: 1, time: Date.now() }];
      });
      loadListings();
    }
    if (data.type === 'run_complete') {
      const s = data.stats;
      setProgressLog((prev) => [...prev, {
        text: `Done — ${s.new_listings} new, ${s.scored} scored, ${s.skipped} skipped${s.errors ? `, ${s.errors} errors` : ''}`,
        isDone: true,
        time: Date.now(),
      }]);
      setRunning(false);
      loadAll();
    }
  }, [loadAll, loadListings]);

  useEffect(() => {
    window.__scoutEventHandler = handleScoutEvent;
    return () => { delete window.__scoutEventHandler; };
  }, [handleScoutEvent]);

  const handleRunScout = async () => {
    setRunning(true);
    setProgressLog([]);
    try { await runScout(); } catch (err) { alert(err.message); setRunning(false); }
  };

  const handleDismiss = async (id) => {
    await dismissListing(id);
    setListings((prev) => prev.map((l) => l.id === id ? { ...l, dismissed: 1 } : l));
  };

  const handlePromote = async (id) => {
    const result = await promoteListing(id);
    setListings((prev) => prev.map((l) => l.id === id ? { ...l, promoted_to_job_id: result.id } : l));
    onListingPromoted?.();
  };

  const handleUpdateListing = async (id, fields) => {
    await patchListing(id, fields);
    setListings((prev) => prev.map((l) => l.id === id ? { ...l, ...fields } : l));
  };

  const scoredCount = listings.filter((l) => l.auto_score_status === 'scored' && !l.dismissed && !l.promoted_to_job_id).length;
  const pendingCount = listings.filter((l) => ['pending', 'scoring'].includes(l.auto_score_status)).length;

  const SECTIONS = [
    { key: 'listings', label: `Listings${scoredCount > 0 ? ` (${scoredCount})` : ''}` },
    { key: 'searches', label: `Searches (${searches.length})` },
    { key: 'settings', label: 'Settings' },
  ];

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading...</p>;

  return (
    <div className="space-y-5">
      {/* Run Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scout</h2>
          <p className="text-sm text-gray-500">
            {!config?.exa_api_key_set && (
              <span className="text-amber-600 dark:text-amber-400">Exa API key not set — </span>
            )}
            {status?.last_run
              ? `Last run ${new Date(status.last_run.finished_at).toLocaleString()} — ${status.last_run.new_listings} new, ${status.last_run.scored} scored`
              : 'No runs yet'}
            {pendingCount > 0 && ` · ${pendingCount} scoring...`}
          </p>
        </div>
        <button
          onClick={handleRunScout}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {running && <span className="w-3 h-3 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" />}
          {running ? 'Running...' : 'Run Scout Now'}
        </button>
      </div>

      {/* Progress log */}
      {progressLog.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 space-y-0.5">
          {progressLog.map((entry, i) => (
            <p key={i} className={`text-xs font-mono ${entry.isDone ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
              {entry.text}
            </p>
          ))}
          {running && (
            <p className="text-xs font-mono text-gray-400 animate-pulse">…</p>
          )}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              section === s.key
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Listings ── */}
      {section === 'listings' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={hideDismissed} onChange={(e) => setHideDismissed(e.target.checked)} className="rounded" />
              Hide dismissed
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Min score:</label>
              <input type="number" min="0" max="100" value={minScore} onChange={(e) => setMinScore(e.target.value)}
                placeholder="0" className="w-16 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
            </div>
            <span className="text-sm text-gray-400">{listings.length} listings</span>
          </div>

          {listings.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-gray-500 mb-2">No listings yet.</p>
              <p className="text-sm text-gray-400">
                {config?.exa_api_key_set
                  ? 'Click "Run Scout Now" to discover job postings.'
                  : 'Add your Exa API key in Settings, then click "Run Scout Now".'}
              </p>
            </div>
          )}

          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onDismiss={handleDismiss}
              onPromote={handlePromote}
              onUpdate={handleUpdateListing}
            />
          ))}
        </div>
      )}

      {/* ── Searches ── */}
      {section === 'searches' && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 mb-3">
            Semantic searches run against job posting sites via Exa. Use descriptive role queries for best results.
            {!config?.exa_api_key_set && <span className="text-amber-600 dark:text-amber-400"> Add your Exa API key in Settings to enable.</span>}
          </p>
          {searches.map((s) => (
            <SearchRow key={s.id} search={s}
              onUpdate={async (id, data) => {
                await updateScoutSearch(id, data);
                setSearches(await getScoutSearches());
              }}
              onDelete={async (id) => {
                await deleteScoutSearch(id);
                setSearches(await getScoutSearches());
              }}
            />
          ))}
          <AddSearchForm onAdd={async (data) => {
            await addScoutSearch(data);
            setSearches(await getScoutSearches());
          }} />
        </div>
      )}

      {/* ── Settings ── */}
      {section === 'settings' && config && (
        <SettingsPanel config={config} onConfigSaved={async () => {
          const cfg = await getScoutConfig();
          setConfig(cfg);
        }} />
      )}
    </div>
  );
}
