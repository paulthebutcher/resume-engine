const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  // Handle blob responses (docx)
  if (res.headers.get('content-type')?.includes('wordprocessingml')) {
    return res.blob();
  }
  return res.json();
}

// Bank
export const getBank = () => request('/bank');
export const saveBank = (content) => request('/bank', { method: 'PUT', body: JSON.stringify({ content }) });

// Resume
export const getResume = () => request('/resume');
export const saveResume = (content) => request('/resume', { method: 'PUT', body: JSON.stringify({ content }) });
export const generateResume = () => request('/resume/generate', { method: 'POST' });

// Jobs
export const getJobs = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/jobs${qs ? `?${qs}` : ''}`);
};
export const getJob = (id) => request(`/jobs/${id}`);
export const createJob = ({ jd_text, company, role_title }) =>
  request('/jobs', { method: 'POST', body: JSON.stringify({ jd_text, company, role_title }) });
export const rerunJob = (id) => request(`/jobs/${id}/rerun`, { method: 'POST' });
export const deleteJob = (id) => request(`/jobs/${id}`, { method: 'DELETE' });

// Application status
export const setAppStatus = (id, status) =>
  request(`/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ application_status: status }) });

// Scout

export const getScoutSearches = () => request('/scout/searches');
export const addScoutSearch = (data) => request('/scout/searches', { method: 'POST', body: JSON.stringify(data) });
export const updateScoutSearch = (id, data) => request(`/scout/searches/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteScoutSearch = (id) => request(`/scout/searches/${id}`, { method: 'DELETE' });
export const testScoutSearch = (id) => request(`/scout/searches/${id}/test`, { method: 'POST' });

export const getScoutListings = (params = {}) => {
  const defined = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
  const qs = new URLSearchParams(defined).toString();
  return request(`/scout/listings${qs ? `?${qs}` : ''}`);
};
export const dismissListing = (id) => request(`/scout/listings/${id}/dismiss`, { method: 'PUT' });
export const patchListing = (id, data) => request(`/scout/listings/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const promoteListing = (id) => request(`/scout/listings/${id}/promote`, { method: 'POST' });
export const fetchListingJd = (id) => request(`/scout/listings/${id}/fetch-jd`, { method: 'POST' });

export const getScoutStatus = () => request('/scout/status');
export const runScout = () => request('/scout/run', { method: 'POST' });

export const getScoutConfig = () => request('/scout/config');
export const saveScoutConfig = (data) => request('/scout/config', { method: 'PUT', body: JSON.stringify(data) });

// Export
export const downloadDocx = async (id) => {
  const res = await fetch(`${BASE}/jobs/${id}/docx`);
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resume_${id.slice(0, 8)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
