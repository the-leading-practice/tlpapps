import fs from 'fs';
import mri from 'mri';
import { red, cyan, green } from 'kleur/colors';
import columnify from 'columnify';

const settings = {};

const loadDataSet = ( file ) => {
  const data = fs.readFileSync( file );

  if( data && data.length > 0 ) {
    const json = JSON.parse( data );
    return json;
  }

  return undefined;
}

const serializeDataSet = ( file, data ) => {
  const strData = JSON.stringify( data );

  fs.writeFileSync( file, strData );
}

const getArgs = ( args ) => {
  const procArgs = mri( args, {
    alias: {
      h: 'help',
      l: 'location',
      c: 'calendar',
      i: 'in',
      o: 'out',
      p: 'patients',
      a: 'appointments'
    },
    boolean: [
      'help',
      'patients',
      'appointment'
    ]
  } );

  settings.help = procArgs.h;
  settings.location = procArgs.l;
  settings.calendar = procArgs.c;
  settings.inFile = procArgs.i;
  settings.outFile = procArgs.o;
  settings.appointments = procArgs.a;
  settings.patients = procArgs.p;

  return settings;
}

const printHelp = () => {
  var data = {
    "-h | --help": "Print help information",
    "-l | --location": "GHL location id",
    "-c | --calendar": "GHL calendar id",
    "-i | --in": "Dataset input file",
    "-o | --out": "Dataset output file",
    "-a | --appointments": "Appointment dataset",
    "-p | --patients": "Patient dataset"
  }

  console.log( `${cyan( 'usage: ' )}node tlpapp-convert.mjs {args}\n` );
  console.log( columnify( data, {columns: ['Arg','Purpose'] } ) );
  console.log( `\n\n` );
}


//--[ main script ]------------------------------------------------------------
const appArgs = getArgs( process.argv.slice( 2 ) );

if( appArgs.help ) {
  printHelp();
  process.exit( 0 );
}

if( !appArgs.location ) {
  console.log( `\n\n${red( 'error: ' )}location id is missing\n` );
  printHelp();
  process.exit( 1 );
}

if( !appArgs.inFile || !appArgs.outFile ) {
  console.log( `\n\n${red( 'error: ' )}missing required in file or out file\n` );
  printHelp();
  process.exit( 1 );
}

if( !appArgs.appointments && !appArgs.patients ) {
  console.log( `\n\n${red( 'error: ' )}must specify dataset\n` );
  printHelp();
  process.exit( 1 );
}

if( appArgs.patients && appArgs.appointments ) {
  console.log( `\n\n${red( 'error: ' )}only specify one dataset patients or appointments\n` );
  printHelp();

  process.exit( 1 );
}

const dataSet = loadDataSet( appArgs.inFile );

if( appArgs.patients ) {
  const patients = [];

  dataSet.forEach( ( p ) => {
    patients.push( {
      _id: {
        $oid: p._id.$oid
      },
      locationId: appArgs.location,
      patientId: p.PatientID,
      contactId: p.ContactID
    } );
  } );

  serializeDataSet( appArgs.outFile, patients );
}

if( appArgs.appointments ) {
  if( !appArgs.calendar ) {
    console.log( `\n\n${red( 'error: ' )}calendar id missing - required if using appointment dataset\n` );
    printHelp();

    process.exit( 1 );
  }

  const appointments = [];

  dataSet.forEach( ( a ) => {
    appointments.push( {
      _id: {
        $oid: a._id.$oid
      },
      locationId: appArgs.location,
      calendarId: appArgs.calendar,
      contactId: a.ContactID,
      patientId: a.PatientID,
      apptId: a.ApptID,
      ghlApptId: a.GHLApptID,
      reset: a.Reset,
      startTime: a.ScheduleDateTime,
      status: a.LastAction
    } );
  } );

  serializeDataSet( appArgs.outFile, appointments );
}