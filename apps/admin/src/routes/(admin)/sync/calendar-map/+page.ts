export const ssr = false;

// Client-side load only (onMount in the component) so a transient auth/network
// error renders inline instead of a 500 — matches the other sync pages.
export function load() {
  return {};
}

export interface ProfileRow {
  id: number;
  name: string;
  duration: number | null;
  color: string | null;
}

export interface CalendarRow {
  id: string;
  name: string;
  calendarType: string | null;
  isActive: boolean | null;
}

export interface CalendarMapResponse {
  profiles: ProfileRow[];
  calendars: CalendarRow[];
  profileCalendarMap: Record<string, string>;
}
