<script>
  import GoogleAuthButton from '$lib/components/GoogleAuthButton.svelte';

  let {
    mode = 'login',
    eyebrow,
    heading,
    lede,
    buttonLabel,
    error = '',
    notice = '',
    loading = false,
    onGoogleAuth,
    panelTitle,
    panelText,
    stats = [],
    trustItems = [],
    footerPrompt,
    footerHref,
    footerLabel,
    fineprint,
    backdropImage = '',
    backdropCredit = '',
    backdropCreditHref = '',
    formSnippet,
    formDividerLabel = 'or continue'
  } = $props();

  const showcaseStyle = $derived(backdropImage
    ? `--backdrop-image: url("${backdropImage}");`
    : '');
</script>

<div class="auth-page auth-page--{mode}">
  <section class="auth-experience" aria-label={eyebrow}>
    <aside
      class="auth-showcase"
      data-backdrop={backdropImage ? '' : undefined}
      style={showcaseStyle}
      aria-hidden="true"
    >
      <div class="auth-showcase__topline">
        <span class="auth-brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 20V4h6.5a4.5 4.5 0 0 1 0 9H7" />
          </svg>
        </span>
        <span>Photogram</span>
      </div>

      <div class="auth-showcase__copy">
        <span class="eyebrow">Photogram for creators</span>
        <h2>{panelTitle}</h2>
        <p>{panelText}</p>

        {#if stats?.length}
          <div class="auth-stats">
            {#each stats as stat}
              <div>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if backdropImage && backdropCredit}
        <span class="auth-credit">
          {#if backdropCreditHref}
            Photo by <a href={backdropCreditHref} target="_blank" rel="noreferrer noopener">{backdropCredit}</a>
          {:else}
            Photo by {backdropCredit}
          {/if}
        </span>
      {/if}
    </aside>

    <article class="auth-card auth-card--{mode}">
      <div class="auth-card-inner">
        <header class="auth-head">
          <span class="eyebrow">{eyebrow}</span>
          <h1>{heading}</h1>
          <p class="lede">{lede}</p>
        </header>

        {#if error}<p class="auth-error" role="alert">{error}</p>{/if}
        {#if notice}<p class="auth-notice" role="status">{notice}</p>{/if}

        <div class="auth-actions">
          <GoogleAuthButton
            label={buttonLabel}
            {loading}
            onclick={onGoogleAuth}
          />
        </div>

        {#if formSnippet}
          <div class="auth-or" aria-hidden="true"><span>{formDividerLabel}</span></div>
          {@render formSnippet()}
        {/if}

        <div class="auth-trust-list" aria-label="Account benefits">
          {#each trustItems as item}
            <div class="auth-trust-row">
              <span class="auth-trust-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  {#each (Array.isArray(item.paths) ? item.paths : [item.icon]) as d}
                    <path d={d} />
                  {/each}
                </svg>
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </div>
            </div>
          {/each}
        </div>

        <footer class="auth-foot">
          <p>
            {footerPrompt} <a href={footerHref}>{footerLabel}</a>
          </p>
          <p class="fineprint">{fineprint}</p>
        </footer>
      </div>
    </article>
  </section>
</div>
