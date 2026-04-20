import React, { useState, useEffect } from 'react';
import { getBank, saveBank, getUserConfig, saveUserConfig } from '../api.js';

function CompTargetCard() {
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getUserConfig()
      .then((cfg) => {
        setMin(String(cfg.min));
        setMax(String(cfg.max));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const minNum = Number(min);
    const maxNum = Number(max);
    if (!Number.isInteger(minNum) || !Number.isInteger(maxNum) || minNum <= 0 || maxNum <= 0) {
      setError('Enter positive whole numbers.');
      return;
    }
    if (minNum > maxNum) {
      setError('Min must be less than or equal to max.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await saveUserConfig({ min: minNum, max: maxNum });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Target Compensation</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Base salary range used when scoring role fit. Roles at or above this range score high; below-target roles score low.
        </p>
      </div>
      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className="block text-xs text-gray-500 mb-1">Min base ($)</span>
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </label>
        <label className="flex-1">
          <span className="block text-xs text-gray-500 mb-1">Max base ($)</span>
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

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
      <CompTargetCard />
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
