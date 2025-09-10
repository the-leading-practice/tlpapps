export const ltCorner = '\u250c';
export const rtCorner = '\u2510';
export const lbCorner = '\u2514';
export const rbCorner = '\u2518';
export const horiz = '\u2500';
export const horizT = '\u252c';
export const horizBT = '\u2534';
export const vert = '\u2502';
export const vertLT = '\u251c';
export const vertRT = '\u2524';
export const cross = '\u253c';

export const horizLine = (length: number) => {
	let line = '';
	for (let x = 0; x < length; ++x) {
		line += horiz;
	}

	return line;
};

export const yellow = (data: string) => {
	return `\x1b[33m${data}\x1b[0m`;
};

export const green = (data: string) => {
	return `\x1b[32m${data}\x1b[0m`;
};
