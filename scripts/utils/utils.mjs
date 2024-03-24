import path from 'path';
import { spawnSync } from 'child_process';
import { cyan, gray, bold } from 'kleur/colors';

export const runCommand = ( cmd, password='', runAsSu=false ) => {
  let command = '';

  if( runAsSu && password.length > 0 ) {
    command = `echo ${password} | sudo -S `;  
  }

  command += cmd;
  console.log( `executing: ${cyan( command )}` );

  const proc = spawnSync( "bash", ["-c", cmd] );
  console.log( proc.stdout.toString() );
  console.log( proc.stderr.toString() );

  // proc.stdout.on( 'data', ( data ) => {
  //   console.log( data.toString() );
  // } );

  // proc.stderr.on( 'data', ( data ) => {
  //   console.log( data.toString() );
  // } );

  // proc.on( 'close', ( code ) => {
  //   console.log( `closing ( ${code} )` );
  // } );
}

export const getFullPath = ( dest ) => {
  let fullPath = dest;
  if( dest.substr( 0, 2 ) === '..' ) {
    fullPath = path.join( process.cwd(), dest );
  }

  return fullPath;
}