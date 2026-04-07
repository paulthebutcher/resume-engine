import React, { useState } from 'react';
import JobCard from './JobCard.jsx';

const APP_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'not_applied', label: 'Not Applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

export default function JobList({ jobs, onDeleted, onUpdated, onRerun, bankUpdatedAt }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [appFilter, setAppFilter] = useState('');

  const filtered = jobs.filter((j) => {
    // Text search
    if (search) {
      const s = search.toLowerCase();
      const textMatch =
        (j.company || '').toLowerCase().includes(s) ||
        (j.role_title || '').toLowerCase().includes(s) ||
        j.jd_text.toLowerCase().includes(s);
      if (!textMatch) return false;
    }

    // App status filter
    if (appFilter === 'applied') return j.application_status === 'applied';
    if (appFilter === 'active') return ['heard_back', 'interviewing'].includes(j.application_status);
    if (appFilter === 'closed') return ['rejected', 'offer', 'passed'].includes(j.application_status);
    if (appFilter === 'not_applied') return !j.application_status;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'composite_score') return (b.composite_score || 0) - (a.composite_score || 0);
    if (sortBy === 'company') return (a.company || '').localeCompare(b.company || '');
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            Jobs <span className="text-sm font-normal text-gray-500">({jobs.length})</span>
          </h2>
          <div className="flex gap-1">
            {APP_STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setAppFilter(f.value)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  appFilter === f.value
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600 w-44"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none"
          >
            <option value="created_at">Newest</option>
            <option value="composite_score">Fit Score</option>
            <option value="company">Company</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          {jobs.length === 0
            ? 'No jobs yet. Paste a job description above to get started.'
            : 'No jobs match the current filter.'}
        </p>
      )}
      {sorted.map((job) => (
        <JobCard key={job.id} job={job} onDeleted={onDeleted} onUpdated={onUpdated} onRerun={onRerun} bankUpdatedAt={bankUpdatedAt} />
      ))}
    </div>
  );
}
