import { writable } from "svelte/store";
import type { DataListItem } from "./types";

export const dataList = writable<DataListItem[]>( [] );

export const updateList = ( filter: string, mask: string[], list: DataListItem[] ) => {
  console.log( `update list called ${filter}` );
  console.log( mask );

  dataList.update( ( dl ) => {
  let tmplist: DataListItem[] = [...list];

  // filter items based on filter string
  tmplist = tmplist.filter( ( item ) => item.label.toLowerCase().search( filter.toLowerCase() ) !== -1);

  // exclude items contained in mask
  if( mask.length > 0 ) {
    mask.forEach( ( m ) => {
      tmplist = tmplist.filter( ( item ) => item.label.search( m ) === -1 );
    } );
  }

  console.log( tmplist );

  return tmplist;
  } );
}