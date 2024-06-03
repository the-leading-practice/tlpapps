<script context="module" lang="ts">
  export type EditorLang = "sql" | "json" | "markdown";
</script>

<script lang="ts">
  import CodeMirror from "svelte-codemirror-editor";
  import { sql } from "@codemirror/lang-sql";
  import { json } from "@codemirror/lang-json";
  import { markdown } from "@codemirror/lang-markdown";
  import { espresso } from "thememirror";
  import { dracula } from "thememirror";
  import { createEventDispatcher } from "svelte";

  export let value: string;
  export let name: string;
  export let index: number;
  export let lang: EditorLang = "json";

  const dispatcher = createEventDispatcher()

  let theme = espresso;
  if( typeof localStorage !== 'undefined' && localStorage.getItem('color-theme') === 'dark' ) {
    theme = dracula;
  }

  const handleOnChange = ( event: any ) => {
    dispatcher( "change", {detail: event.detail, name: name, index: index} );
  }

  const getLang = () => {
    switch( lang ) {
      case "sql": return sql();
      case "json": return json();
      case "markdown": return markdown();
    }
  }

</script>

<CodeMirror 
  bind:value
  lang={getLang()} 
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