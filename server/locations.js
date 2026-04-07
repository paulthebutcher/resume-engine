/**
 * Location filter for Scout.
 * Passes listings in qualifying US metro areas (500K+ pop) or marked remote.
 * Mode is configured via scout_config key 'location_mode'.
 */
import { getConfig } from './scout-db.js';

export const REMOTE_SIGNALS = ['remote', 'anywhere', 'distributed', 'work from home', 'wfh'];

// US metro areas with 500K+ population (lowercase for matching)
export const QUALIFYING_CITIES = [
  'new york', 'los angeles', 'chicago', 'dallas', 'houston', 'washington',
  'miami', 'philadelphia', 'atlanta', 'phoenix', 'boston', 'riverside',
  'seattle', 'san francisco', 'detroit', 'minneapolis', 'san diego',
  'tampa', 'denver', 'st. louis', 'baltimore', 'portland', 'san antonio',
  'sacramento', 'orlando', 'las vegas', 'austin', 'cincinnati', 'kansas city',
  'columbus', 'indianapolis', 'cleveland', 'pittsburgh', 'raleigh', 'charlotte',
  'virginia beach', 'new orleans', 'salt lake city', 'richmond', 'memphis',
  'louisville', 'jacksonville', 'hartford', 'oklahoma city', 'nashville',
  'buffalo', 'birmingham', 'providence', 'milwaukee', 'norfolk',
  'san jose', 'oakland', 'tucson', 'fresno', 'mesa', 'omaha', 'albuquerque',
];

/**
 * Returns true if the listing passes the location filter.
 *
 * Modes:
 *   'any'      — accept all (no filtering)
 *   'us_metro' — accept qualifying US metros or remote (default)
 *   'custom'   — accept custom_cities list (from scout_config) or remote
 */
export function passesLocationFilter(locationStr) {
  const mode = getConfig('location_mode') || 'us_metro';
  if (mode === 'any') return true;

  const loc = (locationStr || '').toLowerCase().trim();

  // No location info — don't filter out (benefit of the doubt)
  if (!loc) return true;

  // Remote always passes in us_metro and custom modes
  if (REMOTE_SIGNALS.some((s) => loc.includes(s))) return true;

  if (mode === 'us_metro') {
    return QUALIFYING_CITIES.some((city) => loc.includes(city));
  }

  if (mode === 'custom') {
    let cities = [];
    try { cities = JSON.parse(getConfig('custom_cities') || '[]'); } catch { /* ignore */ }
    return cities.some((c) => loc.includes((c || '').toLowerCase()));
  }

  return true;
}
