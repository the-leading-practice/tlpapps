export const hexToRgb = ( hex: string ) => {
  const result: string[] | null = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec( hex );

  return result ? {
      r: parseInt( result[1], 16 ),
      g: parseInt( result[2], 16 ),
      b: parseInt( result[3], 16 )
    } : null;
}

export const rgbToHex = ( r: number, g: number, b: number ) => {
  return `#${(1<<24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

export const getContrastColor = ( rgb: {r:number,g:number,b:number}, darkColor: string, lightColor: string ) => {
  const {r,g,b} = rgb;
  
  const uicolors = [r / 255, g / 255, b / 255];
  const c = uicolors.map((col) => {
    if (col <= 0.03928) {
      return col / 12.92;
    }
    return Math.pow((col + 0.055) / 1.055, 2.4);
  });

  const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2]);
  return (L > 0.179) ? darkColor : lightColor;
}