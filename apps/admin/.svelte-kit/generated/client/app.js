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
	() => import('./nodes/15')
];

export const server_loads = [];

export const dictionary = {
		"/(admin)": [3,[2]],
		"/(admin)/practice/config": [4,[2]],
		"/(admin)/practice/config/[slug]": [5,[2]],
		"/(admin)/practice/onboard": [6,[2]],
		"/(admin)/practice/settings": [7,[2]],
		"/(admin)/profile": [8,[2]],
		"/(admin)/profile/options": [9,[2]],
		"/(admin)/server": [10,[2]],
		"/(admin)/server/monitor": [11,[2]],
		"/sign-in": [12],
		"/sign-up": [13],
		"/sign-up/confirm": [14],
		"/welcome": [15]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
};

export { default as root } from '../root.svelte';