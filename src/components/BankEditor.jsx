import React, { useState, useEffect } from 'react';
import { getBank, saveBank } from '../api.js';

export default function BankEditor({ onSaved }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBank()
      .then((data) => setContent(data.content || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBank(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Experience Bank</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All your roles, accomplishments, metrics, skills, education. The raw material for resume generation.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste your complete experience here — roles, accomplishments, metrics, skills, education, everything..."
        className="w-full h-[70vh] p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
      />
    </div>
  );
}
