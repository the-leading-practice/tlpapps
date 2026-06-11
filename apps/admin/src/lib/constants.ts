// Supabase is deprecated (2026-05). These constants have been removed from the
// source to prevent credential exposure in the client bundle.
// ACTION REQUIRED (owner): rotate the old anon key in the Supabase dashboard —
// it was previously committed and is therefore compromised.
// New auth path: GHL SSO → POST /api/crm/sso → tlp_token (see /embed route).

export const PALETTE_COLORS = [
  '#122230',
  '#244a63',
  '#6882a8',
  '#b1cbe2',
  '#d9eaf8',
  '#fafdea',
  '#afe4bd',
  '#48c39a',
  '#279098',
  '#333a7f',
  '#995fbf',
  '#cc88e1',
  '#f9b9d8',
  '#ed6697',
  '#bb3c63',
  '#692851',
  '#542730',
  '#9f4444',
  '#d9865d',
  '#f6d995',
  '#efba3f',
  '#c6c85f',
  '#84b25f',
  '#408450'
];

export const KEYWORDS_COLOR_REGEX = /^[a-z]*$/;
export const HEX_COLOR_REGEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/;
export const RGB_COLOR_REGEX = /^rgb\(\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*,\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*,\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*\)$/;
export const RGBA_COLOR_REGEX = /^rgba\(\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*,\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*,\s*(0|[1-9]\d?|1\d\d?|2[0-4]\d|25[0-5])%?\s*,\s*((0.[1-9])|[01])\s*\)$/;
export const HSL_COLOR_REGEX = /^hsl\(\s*(0|[1-9]\d?|[12]\d\d|3[0-5]\d)\s*,\s*((0|[1-9]\d?|100)%)\s*,\s*((0|[1-9]\d?|100)%)\s*\)$/;
