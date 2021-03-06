import * as path from "path" ;
import { sync as mkdirSync } from "make-dir" ;
import range from "py-range" ;

import * as i from "." ;
import * as s from "./settings" ;
import * as log from "./log" ;
import downloadManga from "./download-manga" ;

/* Functions for parsing cli commands */

export function list( settings, resetObj, isLatest ) {
  if ( resetObj ) {
    s.reset( "history", settings, resetObj.settingsPath, resetObj.force );
    log.prompt( "History has been reset." );
  } else {s.outputHistory( settings, isLatest );}

  checkForUpdate();
}

export function config( args, settings, defaults, outputPath, settingsPath ) {
  if ( settingsPath ) { // If 'reset' has been passed
    s.reset( "config", settings, settingsPath );
    log.prompt( "Config has been reset." );
  } else {
    let outMsg = "";

    if ( outputPath !== defaults.out ) {
      settings.set( "config.outputPath", outputPath ).save();
      outMsg += `Default output path set to '${outputPath}'. `;
    }

    if ( args.provider !== defaults.provider ) {
      settings.set( "config.provider", args.provider ).save();
      outMsg += `'${args.provider}' set as default provider. `;
    }

    settings.set( "config.dir", args.dir ).save();
    if ( args.dir !== defaults.dir )
      outMsg += args.dir ? "'--dir' option enabled. " : "'--dir' option disabled. ";

    if ( outMsg.length === 0 )
      outMsg = `No options have been passed to 'config'. Specify --help for usage info\n${s.outputConfig( settings )}`;

    log.prompt( outMsg );
    checkForUpdate();
  }
}

export async function manga( args, outputPath, settings ) {
  const url = args._[0];
  const { name } = i.parseFromUrl( url, args.provider );

  if ( args.dir ) {
    const newOut = path.join( outputPath, name );

    mkdirSync( newOut );
    outputPath = newOut;
  }

  const options = {
    outputPath,
    provider : args.provider,
    isForce  : args.force,
    bar      : args.bar,
    subscribe: args.subscribe,
  };

  await downloadManga( url, options, settings );
  process.exit(); // eslint-disable-line unicorn/no-process-exit
}

export async function update( args, settings ) {
  if ( args._[1] === "check" ) {
    await s.checkForNewManga( settings );
  } else {
    if ( !args.silent )
      log.prompt( `Searching for updates...` );

    const defaults = s.parseDefaults( settings );
    const mangaList: any[] = s.generateMangaList( settings );
    const downloaded: any[] = [];

    for ( const manga of mangaList ) {
      const last = await i.getLastChapter( manga.name, manga.provider ? manga.provider : defaults.provider );

      if ( last > manga.chapter ) {
        const options = {
          bar       : args.silent ? null : args.bar,
          subscribe : true,
          provider  : manga.provider ? manga.provider : defaults.provider,
          outputPath: manga.path ? manga.path : path.join( path.normalize( defaults.out ), manga.name ),
        };
        await downloadManga( manga.name, options, settings );

        downloaded.push( { name: manga.name, start: manga.chapter, end: last } );
      }
    }

    const mangaStr = downloaded.reduce( ( arr, manga ) => {
      const { name } = manga;
      const { start } = manga;
      const { end } = manga;

      return `${arr}\n    - ${name} (${start + 3 > end ? range( start + 1, end + 1 ) : `${start}-${end}`})`;
    }, "" );

    if ( downloaded.length ) {
      setTimeout( () => {
        if ( args.silent )
          log.print( mangaStr.slice( 1, mangaStr.length ) );
        else
          log.prompt( `Updated the following manga:${mangaStr}` );
        process.exit();
      }, 81 ); // Wait out the last recursive pb.update call
    } else {
      if ( !args.silent )
        log.prompt( `No new updates are available` );
      process.exit(); // eslint-disable-line unicorn/no-process-exit
    }
  }
}

function checkForUpdate() {
  /* eslint-disable global-require */
  const updateCheck = require( "update-check" );
  const packageJson = require( "../../package" );

  updateCheck( packageJson )
    .then( update => {
      if ( update )
        log.promptConsole( `A new version of mangareader-dl is available: current ${packageJson.version}, latest ${update.latest}` );
    } )
    .catch( err => {
      if ( err.code !== "ENOTFOUND" )
        log.error( err.message, { err } );
    } );
}

