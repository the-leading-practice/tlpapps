// little sugar to help with Tailwind intellisense
export type CssClasses = string;

export type SvelteEvent<E extends Event = Event, T extends EventTarget = Element> = E & { currentTarget: EventTarget & T };

export type TLPUser = {
  id?: string;
  modified_at?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
	avatar_url?: string;
  password?: string;
	freshdesk_id?: string;
	asana_id?: string;
  profile_color?: string;
}