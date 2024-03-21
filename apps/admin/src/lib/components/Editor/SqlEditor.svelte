<script lang="ts">
import CodeMirror from "svelte-codemirror-editor";
import { sql } from "@codemirror/lang-sql";
import { espresso } from "thememirror";
import { dracula } from "thememirror";
import { createEventDispatcher } from "svelte";

export let value: string;
export let name: string;
export let index: number;

const dispatcher = createEventDispatcher()

let theme = espresso;
if( typeof localStorage !== 'undefined' && localStorage.getItem('color-theme') === 'dark' ) {
  theme = dracula;
}

const handleOnChange = ( event: any ) => {
  dispatcher( "change", {detail: event.detail, name: name, index: index} );
}

</script>

<CodeMirror 
  bind:value
  lang={sql()} 
  lineWrapping={true}
  useTab={true}
  theme={theme}
  styles={{
    "&": {
      width: "100%",
      height: "400px"
    }
  }}
  on:change={handleOnChange}
/>