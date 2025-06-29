export const noop = () => {};

export function run(fn: ()=>void) {
	return fn();
}