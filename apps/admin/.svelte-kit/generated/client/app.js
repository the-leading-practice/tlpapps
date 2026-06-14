export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24'),
	() => import('./nodes/25')
];

export const server_loads = [];

export const dictionary = {
		"/(admin)": [4,[2]],
		"/embed": [21],
		"/(admin)/practice": [5,[2]],
		"/(admin)/practice/config": [6,[2]],
		"/(admin)/practice/config/[slug]": [7,[2]],
		"/(admin)/practice/new": [8,[2]],
		"/(admin)/practice/onboard": [9,[2]],
		"/(admin)/practice/settings": [10,[2]],
		"/(admin)/practice/[location]": [11,[2]],
		"/(admin)/profile": [12,[2]],
		"/(admin)/profile/options": [13,[2]],
		"/(admin)/server": [14,[2]],
		"/(admin)/server/monitor": [15,[2]],
		"/sign-in": [22],
		"/sign-up": [23],
		"/sign-up/confirm": [24],
		"/(admin)/sync": [16,[2,3]],
		"/(admin)/sync/conflicts": [17,[2,3]],
		"/(admin)/sync/controls": [18,[2,3]],
		"/(admin)/sync/dead-letter": [19,[2,3]],
		"/(admin)/sync/events": [20,[2,3]],
		"/welcome": [25]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
};

export { default as root } from '../root.svelte';