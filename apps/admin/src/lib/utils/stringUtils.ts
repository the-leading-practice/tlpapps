
/**
 * Safely format a date-ish value for display. Returns `fallback` for null /
 * undefined / empty / unparseable inputs instead of the literal "Invalid Date"
 * that `new Date(x).toLocaleString()` produces.
 */
export const formatDateTime = ( value: unknown, fallback = '—' ): string => {
	if( value === null || value === undefined || value === '' ) return fallback;
	const d = new Date( value as string | number | Date );
	return isNaN( d.getTime() ) ? fallback : d.toLocaleString();
}

/** Time-only variant of formatDateTime (used by live feeds). */
export const formatTime = ( value: unknown, fallback = '—' ): string => {
	if( value === null || value === undefined || value === '' ) return fallback;
	const d = new Date( value as string | number | Date );
	return isNaN( d.getTime() ) ? fallback : d.toLocaleTimeString();
}

export const validateEmail = ( email: string ) => {
	const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRE.test( email );
}

export const ordinalSuffix = ( num: number ): string => {
	let j = num % 10, k = num % 100;

	if( j === 1 && k !== 11 ) {
		return "st";
	}

	if( j === 2 && k !== 12 ) {
		return "nd";
	}

	if( j === 3 && k !== 13 ) {
		return "rd";
	}

	return "th";
}