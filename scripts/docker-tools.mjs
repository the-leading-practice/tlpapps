import { runCommand } from './utils/utils.mjs';
import mri from 'mri';
import { cyan, gray, bold } from 'kleur/colors';

const args = process.argv.slice( 2 );

const options = mri( args, {
	boolean: [
		'clean',
		'list',
		'all'
	],
	alias: {
		c: 'clean',
		l: 'list',
		a: 'all'
	}
} );
console.log( options );

// wrapper for common docker commands
if( options['list'] ) {
	console.log( `get container list` );
	let cmd = 'docker ps';

	if( options['all'] )
		cmd += ' -a';

	runCommand( cmd );
}


