
export const safeStringCompare = ( left: string, right: string ) : boolean => {
  if( typeof left === 'undefined' || typeof right === 'undefined' ) return false;

  if( left === right ) return true;
  
  if( left === null ) return false;
  if( right === null ) return false;

  if( left.toLowerCase().trim() === right.toLowerCase().trim() ) {
    return true;
  }

  return false;
}

export const getLocation = ( header: string ) => {
  if( header.length === 0 ) return {location:"", token:""};

  const [location, token] = header.split( ' ' );

  return {location: location, token: token};
}