import React, { useState, useRef } from 'react';
import { createJob } from '../api.js';
import { parseJD } from '../parseJD.js';

export default function JobInput({ onSubmit }) {
  const [jdText, setJdText] = useState('');
  const [company, setCompany] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Track whether user has manually overridden the auto-parsed fields
  const companyEdited = useRef(false);
  const roleTitleEdited = useRef(false);

  const handleJdChange = (e) => {
    const text = e.target.value;
    setJdText(text);
    const { company: parsedCompany, roleTitle: parsedRole } = parseJD(text);
    if (!companyEdited.current) setCompany(parsedCompany);
    if (!roleTitleEdited.current) setRoleTitle(parsedRole);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jdText.trim()) return;
    setSubmitting(true);
    try {
      await createJob({ jd_text: jdText, company: company || undefined, role_title: roleTitle || undefined });
      setJdText('');
      setCompany('');
      setRoleTitle('');
      companyEdited.current = false;
      roleTitleEdited.current = false;
      onSubmit();
    } catch (err) {
      alert('Submit failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-3">
        <input
          type="text"
          value={company}
          onChange={(e) => { companyEdited.current = true; setCompany(e.target.value); }}
          onBlur={() => { if (!company) companyEdited.current = false; }}
          placeholder="Company (auto-parsed)"
          className="flex-1 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
        />
        <input
          type="text"
          value={roleTitle}
          onChange={(e) => { roleTitleEdited.current = true; setRoleTitle(e.target.value); }}
          onBlur={() => { if (!roleTitle) roleTitleEdited.current = false; }}
          placeholder="Role title (auto-parsed)"
          className="flex-1 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
        />
      </div>
      <textarea
        value={jdText}
        onChange={handleJdChange}
        placeholder="Paste a job description here..."
        className="w-full h-40 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
      />
      <button
        type="submit"
        disabled={submitting || !jdText.trim()}
        className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {submitting ? 'Submitting...' : 'Tailor'}
      </button>
    </form>
  );
}
