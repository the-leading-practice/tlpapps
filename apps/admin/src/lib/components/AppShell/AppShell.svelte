<script lang="ts">
  import type { CssClasses, SvelteEvent } from '../../index';

  interface $$Events {
    scroll: SvelteEvent<UIEvent, HTMLDivElement>;
  }
//--[ Misc Props ]-------------------------------------------------------------
  export let scrollbarGutter = 'auto';

//--[ region classes ]---------------------------------------------------------
  export let regionPage: CssClasses = '';
  export let slotHeader: CssClasses = 'z-10';
  export let slotSidebarLeft: CssClasses = 'w-auto';
  export let slotSidebarRight: CssClasses = 'w-auto';
  export let slotPageHeader: CssClasses = '';
  export let slotPageContent: CssClasses = '';
  export let slotPageFooter: CssClasses = '';
  export let slotFooter: CssClasses = '';
//-----------------------------------------------------------------------------

//--[ base classes ]-----------------------------------------------------------
  const baseClassAppShell = "w-full h-full flex flex-col overflow-hidden";
  const baseClassContent = "w-full h-full flex overflow-hidden";
  const baseClassPage = "flex-1 overflow-x-hidden flex flex-col";
  const baseClassSidebarLeft = "flex-none overflow-x-hidden overflow-y-auto";
  const baseClassSidebarRight = "flex-none overflow-x-hidden overflow-y-auto";
//-----------------------------------------------------------------------------

//--[ reactive classes ]-------------------------------------------------------
  $: baseClasses = `${baseClassAppShell} ${$$props.class ?? ''}`;
  $: headerClasses = `${slotHeader}`;
  $: sidebarLeftClasses = `${baseClassSidebarLeft} ${slotSidebarLeft}`;
  $: sidebarRightClasses = `${baseClassSidebarRight} ${slotSidebarRight}`;
  $: pageHeaderClasses = `${slotPageHeader}`;
  $: pageContentClasses = `${slotPageContent}`;
  $: pageFooterClasses = `${slotPageFooter}`;
  $: footerClasses = `${slotFooter}`;
//-----------------------------------------------------------------------------

</script>

<div id="appShell" class={baseClasses} data-testid="app-shell">
  <!-- slot header -->
  {#if $$slots.header}
    <header id="appShell-header" class="flex-none {headerClasses}"><slot name="header" /></header>
  {/if}

  <!-- content -->
  <div class="flex-auto {baseClassContent}">

    <!-- sidebar left -->
    {#if $$slots.sidebarLeft}
      <aside id="appShell-sidebar-left" class={sidebarLeftClasses}><slot name="sidebarLeft" /></aside>
    {/if}

    <!-- page -->
    <div id="appshell-page" class="{regionPage} {baseClassPage}" style:scrollbarGutter on:scroll>

      <!-- page header -->
      {#if $$slots.pageHeader}
        <header id="appshell-page-header" class="flex-none {pageHeaderClasses}"><slot name="pageHeader">(slot:header)</slot></header>
      {/if}

      <!-- page content -->
      <main id="appshell-page-content" class="flex-auto {pageContentClasses}"><slot /></main>

      <!-- page footer -->
      {#if $$slots.pageFooter}
        <footer id="appshell-page-footer" class="flex-none {pageFooterClasses}"><slot name="pageFooter">(slot:footer)</slot></footer>
      {/if}
    </div>

    <!-- sidebar right -->
    {#if $$slots.sidebarRight}
      <aside id="appshell-sidebar-right" class={sidebarRightClasses}><slot name="sidebarRight" /></aside>
    {/if}
  </div>

  <!-- footer -->
  {#if $$slots.footer}
    <footer id="appshell-footer" class="flex-none {footerClasses}"><slot name="footer" /></footer>
  {/if}

</div>