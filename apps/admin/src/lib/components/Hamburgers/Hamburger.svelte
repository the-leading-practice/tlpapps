<script lang="ts">
  /*!
   * Hamburgers
   * @description Tasty CSS-animated hamburgers
   * @author Jonathan Suh @jonsuh
   * @site https://jonsuh.com/hamburgers
   * @link https://github.com/jonsuh/hamburgers
   */
  
    import { createEventDispatcher } from "svelte";
    import { type HamburgerTypes } from "./types";
    import "$lib/components/Hamburgers/hamburgers.css";
  
    export let type: HamburgerTypes = 'boring';
    export let color: string = "#ffffff";
    export let activeColor: string = "#ffffff";
    export let scale: number = 1.0;
   
    export const toggleState = () => {
      handleClick();
    }
  
    const dispatcher = createEventDispatcher();
  
    let btn: HTMLButtonElement;
    let active: boolean = false;
    
    const handleClick = () => {
      if( active === false ) {
        active = true;
        btn.classList.add( "is-active" );
      } else {
        active = false;
        btn.classList.remove( "is-active" );
      }
  
      dispatcher( 'click', {
        state: active
      } );
    }

    const cssVariables = ( node: HTMLElement, variables: string[] ) => {
      setCssVariables( node, variables );

      return {
        update( variables: string[] ) {
          setCssVariables( node, variables );
        }
      }
    }

    const setCssVariables = ( node: HTMLElement, variables: string[] ) => {
      for( const name in variables ) {
        node.style.setProperty( `--${name}`, variables[name] );
      }
    }

  </script>
  
  <button class="hamburger hamburger--{type} {$$props.class}" type="button" use:cssVariables={{scale}} on:click={handleClick} bind:this={btn}>
    <span class="hamburger-box">
      <span class="hamburger-inner" use:cssVariables={{color, activeColor}}></span>
    </span>
  </button>
  
  <style>
    .hamburger {
      transform: scale( var(--scale) );
    }
    .hamburger .hamburger-inner, .hamburger .hamburger-inner::after, .hamburger .hamburger-inner::before  { 
      background-color: var(--color);
    }

    .hamburger.is-active .hamburger-inner, .hamburger.is-active .hamburger-inner::after { 
      background-color: var(--activeColor);
    }
  </style>