import { browser } from '$app/environment';

export const getColorTheme = (): string => {
  if( typeof localStorage === 'undefined' ) return '';

  if( localStorage.getItem( 'color-theme' ) ) {
    return localStorage.getItem( 'color-theme' ) || 'light';
  }

  // localStorage has not been used yet - infer from system settings
  if( browser ) {
    if( window.matchMedia( '(prefers-color-scheme: dark)' ).matches ) {
      return 'dark';
    }

    else {
      return 'light';
    }
  }

  return '';
};

export const setColorTheme = ( theme: 'light' | 'dark' ) => {
  localStorage.setItem( 'color-theme', theme );

  if( theme === 'dark' ) {
    document.documentElement.classList.add( 'dark' );
  }

  if( theme === 'light' ) {
    if( document.documentElement.classList.contains( 'dark' ) ) {
      document.documentElement.classList.remove( 'dark' );
    }
  }
}

export const toggleColorTheme = () => {
  if( localStorage.getItem( 'color-theme' ) ) {
    if( localStorage.getItem( 'color-theme' ) === 'light' ) {
      setColorTheme( 'dark' );
    }
    else {
      setColorTheme( 'light' );
    }
  }
}

