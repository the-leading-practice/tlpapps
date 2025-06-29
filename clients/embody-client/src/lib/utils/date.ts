import date from 'date-and-time';

export const getDateString = ( dateObj: Date ) => {
  const fmt = date.format( dateObj, 'YYYY-MM-DDTHH:mm:ss' );

  return fmt;
}

export const monthAdd = ( dateObj: Date, num: number ) => {
  const nextMonth = date.addMonths( dateObj, num );
  console.log( nextMonth.toString())
  
  return nextMonth;
}