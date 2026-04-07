import React, { useState, useEffect, useRef } from 'react';
import BankEditor from './components/BankEditor.jsx';
import ResumeEditor from './components/ResumeEditor.jsx';
import JobInput from './components/JobInput.jsx';
import JobList from './components/JobList.jsx';
import Scout from './components/Scout.jsx';
import { getJobs, getBank, getResume, getScoutStatus } from './api.js';

export default function App() {
  const [tab, setTab] = useState('Tailor');
  const [jobs, setJobs] = useState([]);
  const [bankUpdatedAt, setBankUpdatedAt] = useState(null);
  const [scoutBadge, setScoutBadge] = useState(0);
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dark') === 'true' ||
        (!localStorage.getItem('dark') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const esRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('dark', dark);
  }, [dark]);

  const loadJobs = async () => {
    try {
      const [jobsData, bankData, resumeData] = await Promise.all([getJobs(), getBank(), getResume()]);
      setJobs(jobsData);
      const bankTs = bankData?.updated_at || null;
      const resumeTs = resumeData?.updated_at || null;
      const latest = bankTs && resumeTs ? (bankTs > resumeTs ? bankTs : resumeTs) : (bankTs || resumeTs);
      setBankUpdatedAt(latest);
    } catch { /* server not ready */ }
  };

  const loadScoutBadge = async () => {
    try {
      const st = await getScoutStatus();
      setScoutBadge(st.unreviewed_count || 0);
    } catch { /* ignore */ }
  };

  const connectSSE = () => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource('/api/jobs/stream');
    esRef.current = es;

    // Named event: job update
    es.addEventListener('job', (e) => {
      try {
        const updatedJob = JSON.parse(e.data);
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === updatedJob.id);
          if (idx === -1) return [updatedJob, ...prev];
          const next = [...prev];
          next[idx] = updatedJob;
          return next;
        });
      } catch { /* ignore */ }
    });

    // Named event: scout update — delegate to Scout component handler
    es.addEventListener('scout', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'run_complete') loadScoutBadge();
        if (data.type === 'listing_scored') loadScoutBadge();
        window.__scoutEventHandler?.(data);
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(() => { connectSSE(); loadJobs(); }, 3000);
    };
  };

  useEffect(() => {
    loadJobs();
    loadScoutBadge();
    connectSSE();
    return () => { if (esRef.current) esRef.current.close(); };
  }, []);

  const handleJobDeleted = (id) => setJobs((prev) => prev.filter((j) => j.id !== id));
  const handleJobUpdated = (updatedJob) => setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));

  const TABS = [
    { key: 'Tailor', label: 'Tailor' },
    { key: 'Scout', label: 'Scout', badge: scoutBadge },
    { key: 'Experience Bank', label: 'Experience Bank' },
    { key: 'Default Resume', label: 'Default Resume' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold tracking-tight">Resume Engine</h1>
          <nav className="flex gap-1">
            {TABS.map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  tab === key
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {label}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={() => setDark(!dark)}
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          {dark ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6">
        {tab === 'Experience Bank' && <BankEditor onSaved={loadJobs} />}
        {tab === 'Default Resume' && <ResumeEditor onSaved={loadJobs} />}
        {tab === 'Scout' && (
          <Scout onListingPromoted={() => { setTab('Tailor'); loadJobs(); loadScoutBadge(); }} />
        )}
        {tab === 'Tailor' && (
          <div className="space-y-6">
            <JobInput onSubmit={loadJobs} />
            <JobList
              jobs={jobs}
              onDeleted={handleJobDeleted}
              onUpdated={handleJobUpdated}
              onRerun={loadJobs}
              bankUpdatedAt={bankUpdatedAt}
            />
          </div>
        )}
      </main>
    </div>
  );
}
