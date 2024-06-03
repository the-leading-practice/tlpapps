<script lang="ts">
	import type { CssClasses } from "$lib";
	import Icon from "@iconify/svelte";

  export let title = "";
  export let icon = "";
  export let subtitle = "";
  export let total = "";
  export let buttonLabel = "More";
  export let buttonLink = "";

  export let cardClass: CssClasses = "";
  export let cardWidth: CssClasses = "w-full";
  export let shadowClass: CssClasses = "shadow-xl";
  export let titleClass: CssClasses = "text-lg";
  export let iconClass: CssClasses = "";
  export let subtitleClass: CssClasses = "";
  export let totalClass: CssClasses = "";
  export let buttonColor: CssClasses = "";

  const cardBase = "card card-compact";
  const titleBase = "card-title";
  const buttonBase = "btn";

  $: cardClasses = `${cardBase} ${cardClass} ${cardWidth} ${shadowClass}`;
  $: titleClasses = `${titleBase} ${titleClass}`;
  $: iconClasses = `${iconClass}`;
  $: subtitleClasses = `${subtitleClass}`;
  $: totalClasses = `${totalClass}`;
  $: buttonClasses = `${buttonBase} ${buttonColor}`;

</script>


<div class="stat-card {cardClasses}">
  <div class="card-body">
    <h3 class="{titleClasses}">
      {#if icon.length > 0 }
        <Icon icon={icon} class="title-icon {iconClasses}" />
      {/if}
       {title}
    </h3>
    <span class="subtitle {subtitleClasses}">{subtitle}</span>
    <span class="total {totalClasses}">{total}</span>
    <div class="card-actions justify-end">
      <button class="more-button {buttonClasses}">{buttonLabel}</button>
    </div>
  </div>
</div>