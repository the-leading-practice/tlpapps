import date from 'date-and-time';

export const getDateString = ( dateObj: Date ) => {
  return date.format( dateObj, 'YYYY-MM-DD' );
}

export const getDateTimeString = ( dateObj: Date ) => {
  return date.format( dateObj, 'YYYY-MM-DDTHH:mm:ss' );
}

export const dayAdd = ( dateObj: Date, num: number ) => {
  return date.addDays( dateObj, num );
}
