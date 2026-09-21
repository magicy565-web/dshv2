/** Deployment-wide business workspace presentation, derived from the Harness theme. */
export const workbenchStyle = `
body[data-trade-workbench] {
  --workbench-ink: var(--dsw-alias-label-primary);
  --workbench-muted: var(--dsw-alias-label-secondary);
  --workbench-line: var(--dsw-alias-border-l2);
  --workbench-paper: var(--dsw-alias-bg-layer-1);
  --workbench-soft: var(--dsw-specific-sidebar-fill);
  --workbench-canvas: color-mix(in srgb, var(--dsw-alias-bg-base) 95%, var(--dsw-alias-label-tertiary));
  --workbench-accent: var(--dsw-alias-state-business-primary);
  --workbench-action: var(--dsw-static-deepseek-600);
  --workbench-action-ink: var(--dsw-static-neutral-00);
  --workbench-accent-soft: color-mix(in srgb, var(--workbench-paper) 93%, var(--workbench-accent));
  --workbench-ease: cubic-bezier(.22, 1, .36, 1);
  --dsw-specific-sidebar-nav-item-active: var(--workbench-accent-soft);
  --dsw-specific-sidebar-nav-item-hover: var(--dsw-alias-interactive-bg-hover);
}
body[data-trade-workbench]:not([data-ds-dark-theme]) { --workbench-accent: var(--dsw-static-deepseek-600); }
.wb-brand-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--workbench-action); color: var(--workbench-action-ink); }
.wb-brand-name { display: flex; align-items: baseline; gap: 8px; letter-spacing: -.02em; white-space: nowrap; }
.wb-brand-name strong { font-size: 19px; font-weight: 650; }
.wb-brand-name small { font-size: 10px; font-weight: 400; color: var(--workbench-muted); letter-spacing: 0; }
[data-trade-workbench] button[aria-current=page] { color: var(--workbench-accent); font-weight: 600; }
[data-trade-workbench] .ent, [data-trade-workbench] .ent-dialog {
  --dsw-alias-button-primary-fill: var(--workbench-action);
  --dsw-alias-button-primary-hover: color-mix(in srgb, var(--workbench-action) 90%, var(--dsw-static-neutral-1000));
  --dsw-alias-label-primary-foreground: var(--workbench-action-ink);
  font-family: var(--dsw-font-family); color: var(--workbench-ink); -webkit-font-smoothing: antialiased;
}
[data-trade-workbench] .ent { background: var(--workbench-canvas); padding: 28px clamp(20px, 3vw, 48px) 48px; }
[data-trade-workbench] .ent-inner { width: 100%; max-width: 1180px; min-width: 0; }
[data-trade-workbench] .ent-header { min-height: 52px; gap: 16px; margin-bottom: 26px; padding-bottom: 22px; border-bottom: .5px solid var(--workbench-line); }
[data-trade-workbench] .ent-header h1 { font: 600 23px/1.4 var(--dsw-font-family); letter-spacing: -.025em; }
[data-trade-workbench] .ent-header p { color: var(--workbench-muted); font-size: 13px; line-height: 1.7; margin: 5px 0 0; }
[data-trade-workbench] .ent-header button, [data-trade-workbench] .ent-form button { border-radius: 8px; font-size: 13px; }
[data-trade-workbench] .ent-computers .cm-primary { background: var(--workbench-action); border-color: var(--workbench-action); color: var(--workbench-action-ink); }
[data-trade-workbench] .ent .ent-logo { width: 44px; height: 44px; border: .5px solid var(--workbench-line); border-radius: 11px; background: var(--workbench-paper); color: var(--workbench-accent); font: 600 22px/1 var(--dsw-font-family); }
[data-trade-workbench] .ent-profile, [data-trade-workbench] .supplier-panel, [data-trade-workbench] .sp-detail, [data-trade-workbench] .sp-editor-dialog, [data-trade-workbench] .sp-media-picker, [data-trade-workbench] .sp-onboarding {
  --folio-bg: var(--workbench-canvas); --folio-ink: var(--workbench-ink); --folio-muted: var(--workbench-muted); --folio-line: var(--workbench-line);
  --sp-ink: var(--workbench-ink); --sp-muted: var(--workbench-muted); --sp-line: var(--workbench-line); --sp-paper: var(--workbench-paper); --sp-soft: var(--workbench-soft); --sp-accent: var(--workbench-accent);
}
[data-trade-workbench] .ent-profile > .ent-inner > .ent-tabs { gap: 24px; margin-bottom: 28px; border-bottom: .5px solid var(--workbench-line); min-width: 0; max-width: 100%; overflow-x: auto; }
[data-trade-workbench] .ent-profile > .ent-inner > .ent-tabs > .ent-tab { padding: 10px 0 14px; font-size: 13px; gap: 7px; }
[data-trade-workbench] .ent-profile > .ent-inner > .ent-tabs > .ent-tab[aria-selected=true] { color: var(--workbench-accent); }
[data-trade-workbench] .ent :is(button, a, input, textarea, select, summary):focus-visible { outline: 2px solid var(--workbench-accent); outline-offset: 3px; }
[data-trade-workbench] .ent :is(input, textarea, select) { font-family: inherit; }
[data-trade-workbench] .ent :is(.ent-file, .ent-ai-card, .ent-opportunity-card) { background: var(--workbench-paper); border: .5px solid var(--workbench-line); border-radius: 12px; }
[data-trade-workbench] .ent :is(.ent-section, .ent-task-row) { border-bottom-width: .5px; }
[data-trade-workbench] .ent .sp-hero h2 { font-family: var(--dsw-font-family); font-size: clamp(26px, 2.6vw, 36px); font-weight: 600; letter-spacing: -.03em; }
[data-trade-workbench] .sp-kicker, .wb-eyebrow { font: 600 11px/1.5 var(--dsw-font-family); letter-spacing: .08em; color: var(--workbench-accent); }
.wb-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 30px 0 16px; }
.ent .wb-section-heading h2 { font-size: 16px; line-height: 1.5; font-weight: 600; margin: 0 0 4px; }
.wb-icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; flex: none; border-radius: 11px; background: var(--workbench-accent-soft); color: var(--workbench-accent); }
.wb-outputs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding: 20px 0; border-top: .5px solid var(--workbench-line); }
.wb-outputs > div { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.wb-outputs .wb-icon { background: var(--workbench-paper); border: .5px solid var(--workbench-line); color: var(--workbench-muted); width: 36px; height: 36px; border-radius: 9px; }
.wb-outputs h3 { font-size: 13px; line-height: 1.5; font-weight: 600; margin: 0 0 5px; }
.wb-outputs p { font-size: 12px; line-height: 1.7; color: var(--workbench-muted); margin: 0; }
.wb-commerce[hidden] { display: none; }
.wb-commerce > .ent-section { margin-top: 24px; padding: 22px; border: .5px solid var(--workbench-line); border-radius: 12px; background: var(--workbench-paper); }
.wb-commerce .ent-muted { margin: 8px 0 16px; }
.ent-commerce-active .ent-inner > .wb-commerce { display: block; }
.wb-page { min-width: 0; animation: wb-enter 200ms var(--workbench-ease); }
.ent-profile .sp-setup { animation: wb-enter 240ms var(--workbench-ease); }
.ent-profile .wb-page .sp-setup { animation: none; }
[data-trade-workbench] .ent-profile .ent-tab { position: relative; border-bottom-color: transparent; transition: color 150ms ease; }
[data-trade-workbench] .ent-profile .ent-tab::after { content: ''; position: absolute; bottom: 0; inset-inline: 0; height: 2px; background: var(--workbench-accent); border-radius: 2px; transform: scaleX(0); transform-origin: center; transition: transform 180ms var(--workbench-ease); }
[data-trade-workbench] .ent-profile .ent-tab[aria-selected=true]::after { transform: scaleX(1); }
[data-trade-workbench] .ent-profile .ent-tab:focus-visible { outline-offset: -3px; border-radius: 5px; }
.ent-profile :is(.ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button) { transition: transform 130ms var(--workbench-ease), background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
.ent-profile :is(.ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button):not(:disabled):active { transform: translateY(1px) scale(.98); }
.ent-profile .ent-field :is(input, textarea, select) { transition: border-color 150ms ease, box-shadow 150ms ease; }
.ent-profile .ent-field:focus-within > span { color: var(--workbench-accent); }
.ent-profile .ent-field > span { transition: color 150ms ease; }
.wb-progress-track > span, .sp-setup-number { transition: background-color 220ms ease, border-color 220ms ease, color 220ms ease; }
.wb-sync { display: inline-block; flex: none; width: 16px; height: 16px; border: 1.5px solid var(--workbench-line); border-top-color: var(--workbench-accent); border-radius: 50%; corner-shape: round; animation: wb-spin 800ms linear infinite; }
.ent-profile button[aria-busy=true]::before { content: ''; display: inline-block; width: 13px; height: 13px; margin-right: 7px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; corner-shape: round; animation: wb-spin 800ms linear infinite; }
.wb-loading { min-height: 220px; gap: 20px; }
.wb-skeleton { display: grid; gap: 10px; width: min(360px, 75%); }
.wb-skeleton i { height: 12px; border-radius: 5px; background: var(--workbench-line); animation: wb-pulse 1.5s ease-in-out infinite; }
.wb-skeleton i:nth-child(2) { width: 82%; animation-delay: 100ms; }
.wb-skeleton i:nth-child(3) { width: 58%; animation-delay: 200ms; }
.wb-feedback { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border: .5px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 25%, var(--workbench-line)); border-radius: 8px; font-size: 13px; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, var(--workbench-paper)); animation: wb-enter 200ms var(--workbench-ease); }
.wb-feedback > span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; corner-shape: round; background: color-mix(in srgb, currentColor 10%, transparent); animation: wb-confirm 240ms var(--workbench-ease); }

/* Home: one ink mission panel per screen; everything below stays an open ledger. */
.wb-goal { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; margin-bottom: 28px; padding: clamp(22px, 2.8vw, 36px) clamp(20px, 2.6vw, 34px); border-radius: 18px; background: color-mix(in srgb, var(--workbench-ink) 97%, transparent); color: var(--workbench-canvas); }
.wb-goal-main { min-width: 0; flex: 1; }
.wb-goal-eyebrow { display: flex; align-items: center; gap: 10px; }
.wb-goal .wb-eyebrow, .wb-start .wb-eyebrow { color: color-mix(in srgb, var(--workbench-accent) 42%, var(--workbench-canvas)); }
.wb-chip { flex: none; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--workbench-canvas) 12%, transparent); color: var(--workbench-canvas); font-size: 11px; font-weight: 600; }
.wb-chip[data-status=paused] { background: color-mix(in srgb, var(--workbench-canvas) 8%, transparent); color: color-mix(in srgb, var(--workbench-canvas) 62%, transparent); }
.wb-chip[data-status=achieved] { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent); color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, var(--workbench-canvas)); }
.wb-text-link { display: inline-flex; align-items: center; gap: 6px; padding: 0; background: none; border: 0; color: var(--workbench-accent); font: inherit; font-size: 12.5px; cursor: pointer; }
.wb-goal .wb-text-link, .wb-start .wb-text-link { color: var(--workbench-canvas); }
.wb-text-link svg { transition: transform 180ms var(--workbench-ease); }
.wb-goal-link { margin-left: auto; }
.ent .wb-goal-title { color: var(--workbench-canvas); font-size: clamp(26px, 3vw, 38px); font-weight: 650; letter-spacing: -.032em; line-height: 1.3; margin: 14px 0 10px; max-width: 720px; overflow-wrap: anywhere; }
.wb-goal-criteria { margin: 0; max-width: 620px; color: color-mix(in srgb, var(--workbench-canvas) 62%, transparent); font-size: 13.5px; line-height: 1.85; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.wb-goal-facts { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 18px; font-size: 12px; color: color-mix(in srgb, var(--workbench-canvas) 58%, transparent); font-variant-numeric: tabular-nums; }
.wb-goal-time { margin-top: 18px; max-width: 460px; }
.wb-goal-track { height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--workbench-canvas) 16%, transparent); overflow: hidden; }
.wb-goal-track > span { display: block; height: 100%; border-radius: 2px; background: var(--workbench-canvas); transition: width 600ms var(--workbench-ease); }
.wb-goal[data-status=paused] .wb-goal-track > span { background: color-mix(in srgb, var(--workbench-canvas) 40%, transparent); }
.wb-goal-time-label { display: flex; justify-content: space-between; margin-top: 7px; font-size: 11px; color: color-mix(in srgb, var(--workbench-canvas) 50%, transparent); font-variant-numeric: tabular-nums; }
.wb-goal-count { flex: none; text-align: right; padding-top: 6px; }
.wb-goal-count strong { display: block; font-size: clamp(46px, 5vw, 68px); font-weight: 300; line-height: 1; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.wb-goal-count span { display: block; margin-top: 8px; font-size: 11.5px; color: color-mix(in srgb, var(--workbench-canvas) 58%, transparent); }
.wb-goal-empty { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: 100%; }
.ent .wb-goal-empty h2 { color: var(--workbench-canvas); font-size: clamp(19px, 2vw, 24px); font-weight: 600; letter-spacing: -.025em; margin: 10px 0 0; }
.wb-start { min-height: 380px; display: flex; flex-direction: column; justify-content: center; padding: clamp(28px, 4vw, 48px) clamp(22px, 3vw, 40px); border-radius: 18px; background: color-mix(in srgb, var(--workbench-ink) 97%, transparent); color: var(--workbench-canvas); }
.ent .wb-start h2 { color: var(--workbench-canvas); font-size: clamp(26px, 3vw, 36px); font-weight: 650; letter-spacing: -.03em; line-height: 1.35; margin: 14px 0 10px; max-width: 560px; }
.wb-start p { margin: 0; color: color-mix(in srgb, var(--workbench-canvas) 62%, transparent); font-size: 13.5px; line-height: 1.9; max-width: 480px; }
.wb-start-actions { display: flex; align-items: center; gap: 18px; margin-top: 28px; }
.wb-main { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 44px; padding-top: 2px; }
.wb-head { display: flex; align-items: baseline; gap: 10px; }
.ent .wb-head h2 { font-size: 15px; font-weight: 600; letter-spacing: -.01em; margin: 0; }
.wb-head-note { font-size: 11.5px; color: var(--workbench-muted); }
.wb-count { font-size: 11.5px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-count[data-tone=warn] { padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, var(--workbench-paper)); color: var(--dsw-alias-state-warn-label); font-weight: 600; }
.wb-list { list-style: none; margin: 6px 0 0; padding: 0; }
.wb-list > li + li { border-top: .5px solid var(--workbench-line); }
.wb-row { display: block; width: calc(100% + 16px); margin-inline: -8px; padding: 13px 8px; background: none; border: 0; border-radius: 9px; font: inherit; color: var(--workbench-ink); text-align: left; cursor: pointer; transition: background 150ms ease; }
.wb-row-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
.wb-row-top strong { min-width: 0; font-size: 13px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-actor { position: relative; display: grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 8px; background: var(--workbench-accent-soft); color: var(--workbench-accent); font-size: 10.5px; font-weight: 650; letter-spacing: .02em; }
.wb-actor[data-pulse]::after { content: ''; position: absolute; inset: -3px; border: 1.5px solid color-mix(in srgb, var(--workbench-accent) 45%, transparent); border-radius: 11px; animation: wb-ring 1.8s var(--workbench-ease) infinite; }
.wb-dot { width: 7px; height: 7px; flex: none; margin-inline: 10.5px; border-radius: 50%; corner-shape: round; background: var(--workbench-accent); }
.wb-dot[data-tone=warn] { background: var(--dsw-alias-state-warn-primary); }
.wb-dot[data-tone=done] { background: var(--dsw-alias-state-success-primary); }
.wb-dot[data-tone=muted] { background: var(--workbench-muted); }
.wb-pill { flex: none; padding: 2.5px 7px; border-radius: 999px; background: var(--workbench-soft); color: var(--workbench-muted); font-size: 10.5px; }
.wb-time { flex: none; margin-left: auto; font-size: 11px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-row-arrow { display: inline-flex; flex: none; color: var(--workbench-muted); opacity: 0; transform: translateX(-3px); transition: opacity 150ms ease, transform 180ms var(--workbench-ease), color 150ms ease; }
.wb-row-meta { display: block; margin-top: 5px; padding-left: 38px; font-size: 11.5px; line-height: 1.7; color: var(--workbench-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-side .wb-row-meta { padding-left: 38px; }
.wb-stream-empty { padding: 24px 0 8px; }
.wb-stream-empty p { margin: 0; font-size: 13px; font-weight: 500; }
.wb-stream-empty .wb-hint { margin-top: 5px; font-weight: 400; font-size: 12px; line-height: 1.8; color: var(--workbench-muted); }
.wb-links { display: flex; gap: 18px; margin-top: 14px; }
.wb-quiet { margin: 12px 0 0; font-size: 12px; color: var(--workbench-muted); }
.wb-results { margin-top: 30px; border-top: .5px solid var(--workbench-line); padding-top: 22px; }
.wb-timeline { position: relative; list-style: none; margin: 8px 0 0; padding: 0 0 0 18px; }
.wb-timeline::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 12px; width: 1px; background: var(--workbench-line); }
.wb-event { position: relative; }
.wb-event::before { content: ''; position: absolute; left: -17.5px; top: 18px; width: 5px; height: 5px; border-radius: 50%; corner-shape: round; background: var(--workbench-canvas); border: 1.5px solid var(--dsw-alias-state-success-primary); }
.wb-event > button { display: flex; align-items: baseline; gap: 14px; width: calc(100% + 12px); margin-inline: -6px; padding: 9px 6px; background: none; border: 0; border-radius: 8px; font: inherit; color: var(--workbench-ink); text-align: left; cursor: pointer; transition: background 150ms ease; }
.wb-event-time { flex: none; width: 62px; padding-top: 1px; font-size: 11px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-event-body { min-width: 0; display: flex; align-items: baseline; gap: 9px; }
.wb-event-kind { flex: none; padding: 1px 5px; border: .5px solid var(--workbench-line); border-radius: 4px; font-size: 10.5px; color: var(--workbench-muted); }
.wb-event-body strong { font-size: 12.5px; font-weight: 550; overflow-wrap: anywhere; }
.wb-event-detail { min-width: 0; font-size: 11.5px; color: var(--workbench-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (hover: hover) {
  .wb-row:hover, .wb-event > button:hover { background: var(--workbench-soft); }
  .wb-row:hover .wb-row-arrow { opacity: 1; transform: translateX(0); color: var(--workbench-accent); }
  .wb-text-link:hover svg { transform: translateX(3px); }
}
@keyframes wb-enter { from { opacity: .3; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes wb-confirm { from { transform: scale(.75); } to { transform: scale(1); } }
@keyframes wb-spin { to { transform: rotate(360deg); } }
@keyframes wb-pulse { 50% { opacity: .4; } }
@keyframes wb-ring { 0% { opacity: .9; transform: scale(.9); } 70% { opacity: 0; transform: scale(1.14); } 100% { opacity: 0; transform: scale(1.14); } }
body[data-trade-workbench] {
  --workbench-ring: color-mix(in srgb, var(--workbench-accent) 55%, transparent);
  --workbench-tint-blue: color-mix(in srgb, var(--workbench-accent) 12%, transparent);
  --workbench-tint-amber: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);
  --workbench-tint-green: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);
  --workbench-tint-red: color-mix(in srgb, var(--dsw-alias-state-error-primary, rgb(239, 68, 68)) 12%, transparent);
  --workbench-danger: var(--dsw-alias-state-error-primary, rgb(226, 75, 80));
}
[data-trade-workbench] .ent :is(button, input, [role=switch]):focus-visible { outline: none; box-shadow: 0 0 0 2px var(--workbench-canvas), 0 0 0 4px var(--workbench-ring); }
.wb-row { transition: background .14s, transform .1s; }
.wb-row:active { transform: scale(.995); }
.wb-countdown { display: inline-flex; align-items: baseline; gap: 12px; font-variant-numeric: tabular-nums; }
.wb-countdown-seg { display: inline-flex; align-items: baseline; gap: 4px; }
.wb-countdown-seg strong { font-size: 20px; font-weight: 600; letter-spacing: -.02em; }
.wb-countdown-seg span { font-size: 11px; color: var(--workbench-muted); }
.wb-elapsed { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 550; font-variant-numeric: tabular-nums; }
.wb-elapsed-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); animation: wb-pulse 1.6s ease-in-out infinite; }
.wb-progress { display: grid; gap: 7px; }
.wb-progress-head { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-progress-track { height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 8%, transparent); overflow: hidden; }
.wb-progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--workbench-accent); transition: width .5s var(--workbench-ease); }
.wb-progress[data-tone=success] .wb-progress-track span { background: var(--dsw-alias-state-success-primary); }
.wb-progress[data-tone=warn] .wb-progress-track span { background: var(--dsw-alias-state-warn-primary); }
.wb-ring { position: relative; display: inline-grid; place-items: center; flex-shrink: 0; }
.wb-ring svg { transform: rotate(-90deg); }
.wb-ring-track { fill: none; stroke: color-mix(in srgb, var(--workbench-ink) 10%, transparent); }
.wb-ring-fill { fill: none; stroke: var(--workbench-accent); stroke-linecap: round; transition: stroke-dashoffset .5s var(--workbench-ease); }
.wb-ring-value { position: absolute; font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums; }
.wb-steps { display: inline-flex; align-items: center; gap: 4px; }
.wb-steps-seg { width: 18px; height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 10%, transparent); }
.wb-steps-seg[data-done] { background: var(--workbench-accent); }
.wb-steps-label { margin-left: 6px; font-size: 11px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-status { flex-shrink: 0; }
.wb-status-line { fill: none; stroke: var(--workbench-muted); stroke-width: 1.4; }
.wb-status-accent { stroke: var(--workbench-accent); }
.wb-status-pie { fill: var(--workbench-accent); }
.wb-status-solid { fill: var(--dsw-alias-state-success-primary); }
.wb-status-muted { fill: var(--workbench-muted); opacity: .55; }
.wb-status-mark { fill: none; stroke: var(--workbench-action-ink); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.wb-status-warn { stroke: var(--dsw-alias-state-warn-primary); }
.wb-status-warn-stroke { stroke: var(--dsw-alias-state-warn-primary); }
.wb-priority { display: inline-flex; align-items: flex-end; gap: 2px; min-height: 12px; }
.wb-priority-bar { width: 3px; border-radius: 1px; background: color-mix(in srgb, var(--workbench-ink) 18%, transparent); }
.wb-priority-bar:nth-child(1) { height: 4px; }
.wb-priority-bar:nth-child(2) { height: 7px; }
.wb-priority-bar:nth-child(3) { height: 10px; }
.wb-priority-bar[data-on] { background: var(--workbench-ink); }
.wb-priority-urgent { display: grid; place-items: center; width: 13px; height: 13px; border-radius: 4px; background: var(--dsw-alias-state-warn-primary); color: rgb(255, 255, 255); font-size: 9px; font-weight: 800; }
.wb-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2.5px 8px; border-radius: 99px; font-size: 11px; font-weight: 550; background: color-mix(in srgb, var(--workbench-ink) 7%, transparent); color: var(--workbench-muted); }
.wb-badge[data-tone=blue] { background: var(--workbench-tint-blue); color: var(--workbench-accent); }
.wb-badge[data-tone=amber] { background: var(--workbench-tint-amber); color: var(--dsw-alias-state-warn-label); }
.wb-badge[data-tone=green] { background: var(--workbench-tint-green); color: var(--dsw-alias-state-success-primary); }
.wb-badge[data-tone=red] { background: var(--workbench-tint-red); color: var(--workbench-danger); }
.wb-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.wb-avatar { display: inline-grid; place-items: center; border-radius: 50%; color: rgb(255, 255, 255); font-weight: 600; letter-spacing: -.01em; user-select: none; flex-shrink: 0; }
.wb-avatar-stack { display: inline-flex; }
.wb-avatar-stack .wb-avatar + .wb-avatar { margin-left: -7px; box-shadow: 0 0 0 2px var(--workbench-canvas); }
.wb-kbd { display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 5px; border: .5px solid var(--workbench-line); border-bottom-width: 1.5px; background: var(--workbench-paper); font: 550 10.5px/1 var(--dsw-font-family); color: var(--workbench-muted); }
.wb-tip { position: relative; display: inline-flex; }
.wb-tip::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 7px); transform: translate(-50%, 3px); padding: 5px 9px; border-radius: 7px; background: var(--workbench-ink); color: var(--workbench-canvas); font-size: 11px; font-weight: 500; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .16s var(--workbench-ease) .25s, transform .16s var(--workbench-ease) .25s; box-shadow: 0 4px 14px rgba(0, 0, 0, .18); z-index: 30; }
.wb-tip:hover::after { opacity: 1; transform: translate(-50%, 0); }
.wb-switch { position: relative; width: 34px; height: 20px; padding: 0; border: 0; border-radius: 99px; cursor: pointer; background: color-mix(in srgb, var(--workbench-ink) 16%, transparent); transition: background .18s var(--workbench-ease); }
.wb-switch[aria-checked=true] { background: var(--workbench-accent); }
.wb-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: rgb(255, 255, 255); box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .18s var(--workbench-ease), width .12s var(--workbench-ease); }
.wb-switch[aria-checked=true] .wb-switch-knob { transform: translateX(14px); }
.wb-switch:active .wb-switch-knob { width: 19px; }
.wb-switch[aria-checked=true]:active .wb-switch-knob { transform: translateX(11px); }
.wb-segmented { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: color-mix(in srgb, var(--workbench-ink) 6%, transparent); }
.wb-segmented button { border: 0; border-radius: 7px; padding: 5px 12px; background: transparent; color: var(--workbench-muted); font: 550 12px/1.4 var(--dsw-font-family); cursor: pointer; transition: color .15s, background .15s, box-shadow .15s; }
.wb-segmented button:hover { color: var(--workbench-ink); }
.wb-segmented button[data-active] { background: var(--workbench-paper); color: var(--workbench-ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .1), 0 0 0 .5px var(--workbench-line); }
.wb-icon-button { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; border: .5px solid transparent; background: transparent; color: var(--workbench-muted); cursor: pointer; transition: background .14s, color .14s, border-color .14s, transform .1s; }
.wb-icon-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); border-color: var(--workbench-line); }
.wb-icon-button:active { transform: scale(.92); }
.wb-menu { display: inline-grid; gap: 1px; min-width: 218px; padding: 5px; border-radius: 11px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); box-shadow: 0 10px 32px rgba(0, 0, 0, .14), 0 2px 8px rgba(0, 0, 0, .08); }
.wb-menu-item { display: flex; align-items: center; gap: 9px; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--workbench-ink); font: 500 12.5px/1.3 var(--dsw-font-family); cursor: pointer; text-align: left; transition: background .12s; }
.wb-menu-item svg { color: var(--workbench-muted); }
.wb-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-menu-item[data-danger], .wb-menu-item[data-danger] svg { color: var(--workbench-danger); }
.wb-menu-hint { margin-left: auto; font-size: 11px; color: var(--workbench-muted); }
.wb-menu-divider { height: .5px; margin: 4px 6px; background: var(--workbench-line); }
.wb-skeleton { display: grid; gap: 10px; }
.wb-skeleton span { height: 12px; border-radius: 6px; background: linear-gradient(90deg, color-mix(in srgb, var(--workbench-ink) 7%, transparent) 25%, color-mix(in srgb, var(--workbench-ink) 13%, transparent) 50%, color-mix(in srgb, var(--workbench-ink) 7%, transparent) 75%); background-size: 200% 100%; animation: wb-shimmer 1.4s linear infinite; }
@keyframes wb-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.wb-field { display: grid; gap: 6px; }
.wb-field-label { font-size: 12px; font-weight: 550; }
.wb-input { height: 32px; padding: 0 10px; border-radius: 8px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); color: var(--workbench-ink); font: 400 13px/1 var(--dsw-font-family); transition: border-color .15s, box-shadow .15s; }
.wb-input::placeholder { color: var(--workbench-muted); opacity: .7; }
.wb-input:focus { outline: none; border-color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-field-hint { font-size: 11px; color: var(--workbench-muted); }
.wb-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: .5px solid transparent; border-radius: 8px; font: 600 13px/1 var(--dsw-font-family); cursor: pointer; transition: background .15s, border-color .15s, color .15s, transform .1s, box-shadow .15s; }
.wb-button[data-size=md] { height: 32px; padding: 0 14px; }
.wb-button[data-size=sm] { height: 26px; padding: 0 10px; font-size: 12px; }
.wb-button[data-tone=primary] { background: var(--workbench-action); color: var(--workbench-action-ink); }
.wb-button[data-tone=primary]:hover { background: color-mix(in srgb, var(--workbench-action) 88%, var(--workbench-ink)); }
.wb-button[data-tone=secondary] { background: var(--workbench-paper); color: var(--workbench-ink); border-color: var(--workbench-line); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
.wb-button[data-tone=secondary]:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-button[data-tone=ghost] { background: transparent; color: var(--workbench-muted); }
.wb-button[data-tone=ghost]:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-button[data-tone=danger] { background: var(--workbench-danger); color: rgb(255, 255, 255); }
.wb-button:active { transform: scale(.97); }
.wb-button:disabled { opacity: .55; cursor: default; transform: none; }
.wb-button-spin { width: 12px; height: 12px; border-radius: 50%; border: 1.6px solid currentColor; border-top-color: transparent; animation: wb-spin .7s linear infinite; }
.wb-button-group { display: inline-flex; }
.wb-button-group .wb-button { border-radius: 0; margin-left: -.5px; }
.wb-button-group .wb-button:first-child { border-radius: 8px 0 0 8px; margin-left: 0; }
.wb-button-group .wb-button:last-child { border-radius: 0 8px 8px 0; }
.wb-split { display: inline-flex; }
.wb-split-main { border: 0; border-radius: 8px 0 0 8px; background: var(--workbench-action); color: var(--workbench-action-ink); font: 600 13px/1 var(--dsw-font-family); padding: 0 13px; height: 32px; cursor: pointer; }
.wb-split-caret { border: 0; border-left: .5px solid rgba(255, 255, 255, .25); border-radius: 0 8px 8px 0; background: var(--workbench-action); color: var(--workbench-action-ink); width: 26px; cursor: pointer; }
.wb-split-main:hover, .wb-split-caret:hover { background: color-mix(in srgb, var(--workbench-action) 88%, var(--workbench-ink)); }
.wb-copy { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--workbench-muted); font: 550 11.5px/1 var(--dsw-font-family); cursor: pointer; padding: 4px 6px; border-radius: 6px; transition: color .14s, background .14s; }
.wb-copy:hover { color: var(--workbench-ink); background: var(--dsw-alias-interactive-bg-hover); }
.wb-copy[data-done] { color: var(--dsw-alias-state-success-primary); }
.wb-action-bar { display: inline-flex; align-items: center; gap: 10px; padding: 6px 8px 6px 14px; border-radius: 12px; background: var(--workbench-ink); color: var(--workbench-canvas); box-shadow: 0 10px 30px rgba(0, 0, 0, .22); }
.wb-action-count { font-size: 12.5px; font-weight: 550; font-variant-numeric: tabular-nums; }
.wb-action-bar .wb-button[data-tone=ghost] { color: color-mix(in srgb, var(--workbench-canvas) 80%, transparent); }
.wb-action-bar .wb-button[data-tone=ghost]:hover { color: var(--workbench-canvas); background: rgba(255, 255, 255, .1); }
.wb-action-clear { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: color-mix(in srgb, var(--workbench-canvas) 70%, transparent); cursor: pointer; }
.wb-action-clear:hover { background: rgba(255, 255, 255, .12); color: var(--workbench-canvas); }
.wb-textarea { height: auto; padding: 8px 10px; line-height: 1.55; resize: vertical; }
.wb-search { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; min-width: 240px; border-radius: 8px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); color: var(--workbench-muted); transition: border-color .15s, box-shadow .15s; }
.wb-search:focus-within { border-color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-search input { flex: 1; border: 0; background: transparent; color: var(--workbench-ink); font: 400 13px/1 var(--dsw-font-family); outline: none; }
.wb-search input::placeholder { color: var(--workbench-muted); opacity: .7; }
.wb-search-clear { display: grid; place-items: center; width: 18px; height: 18px; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--workbench-ink) 12%, transparent); color: var(--workbench-muted); cursor: pointer; }
.wb-number { position: relative; display: inline-flex; }
.wb-number .wb-input { padding-right: 30px; }
.wb-number-steps { position: absolute; right: 4px; top: 4px; bottom: 4px; display: grid; }
.wb-number-steps button { display: grid; place-items: center; width: 22px; border: 0; background: transparent; color: var(--workbench-muted); cursor: pointer; border-radius: 4px; }
.wb-number-steps button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-number-steps button:first-child svg { transform: rotate(180deg); }
.wb-select { position: relative; display: inline-flex; }
.wb-select select { appearance: none; height: 32px; padding: 0 28px 0 10px; border-radius: 8px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); color: var(--workbench-ink); font: 400 13px/1 var(--dsw-font-family); cursor: pointer; }
.wb-select svg { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--workbench-muted); }
.wb-checkbox { display: flex; align-items: flex-start; gap: 9px; border: 0; background: transparent; padding: 0; cursor: pointer; text-align: left; color: var(--workbench-ink); font: 400 13px/1.45 var(--dsw-font-family); }
.wb-checkbox-box { display: grid; place-items: center; width: 16px; height: 16px; margin-top: 1px; border-radius: 5px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); color: var(--workbench-action-ink); transition: background .14s, border-color .14s; flex-shrink: 0; }
.wb-checkbox[aria-checked=true] .wb-checkbox-box { background: var(--workbench-accent); border-color: var(--workbench-accent); }
.wb-checkbox-text { display: grid; gap: 2px; }
.wb-radio-group { display: grid; gap: 8px; }
.wb-radio { display: flex; align-items: center; gap: 9px; border: 0; background: transparent; padding: 0; cursor: pointer; color: var(--workbench-ink); font: 400 13px/1.4 var(--dsw-font-family); }
.wb-radio-dot { width: 15px; height: 15px; border-radius: 50%; border: 1.4px solid color-mix(in srgb, var(--workbench-ink) 30%, transparent); transition: border-color .14s, box-shadow .14s; }
.wb-radio[aria-checked=true] .wb-radio-dot { border-color: var(--workbench-accent); box-shadow: inset 0 0 0 3.2px var(--workbench-paper), inset 0 0 0 8px var(--workbench-accent); }
.wb-slider-head { display: flex; justify-content: space-between; }
.wb-slider-value { font-variant-numeric: tabular-nums; color: var(--workbench-muted); }
.wb-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 10%, transparent); outline: none; }
.wb-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; background: var(--workbench-paper); border: 1.6px solid var(--workbench-accent); box-shadow: 0 1px 3px rgba(0, 0, 0, .18); cursor: pointer; transition: transform .12s; }
.wb-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.wb-tag-input { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); }
.wb-tag-input:focus-within { border-color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-tag-input input { flex: 1; min-width: 90px; border: 0; background: transparent; outline: none; color: var(--workbench-ink); font: 400 13px/1.6 var(--dsw-font-family); }
.wb-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px 3px 9px; border-radius: 6px; background: var(--workbench-tint-blue); color: var(--workbench-accent); font-size: 12px; font-weight: 550; }
.wb-tag button { display: grid; place-items: center; width: 15px; height: 15px; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; opacity: .7; }
.wb-tag button:hover { opacity: 1; background: rgba(0, 0, 0, .08); }
.wb-field-row { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 16px; align-items: start; padding: 10px 0; border-bottom: .5px solid var(--workbench-line); }
.wb-field-row-label { font-size: 12.5px; font-weight: 550; padding-top: 7px; }
.wb-field-row-control { display: grid; gap: 6px; }
.wb-addon { display: inline-flex; align-items: stretch; }
.wb-addon .wb-input { border-radius: 0; }
.wb-addon .wb-input:first-child { border-radius: 8px 0 0 8px; }
.wb-addon-part { display: grid; place-items: center; padding: 0 10px; border: .5px solid var(--workbench-line); background: var(--workbench-soft); color: var(--workbench-muted); font-size: 12px; }
.wb-addon-part:first-child { border-radius: 8px 0 0 8px; border-right: 0; }
.wb-addon-part:last-child { border-radius: 0 8px 8px 0; border-left: 0; }
.wb-fieldset { border: .5px solid var(--workbench-line); border-radius: 10px; padding: 14px 16px 16px; display: grid; gap: 12px; margin: 0; }
.wb-fieldset legend { font-size: 11.5px; font-weight: 600; color: var(--workbench-muted); padding: 0 6px; }
.wb-tabs { display: flex; gap: 2px; border-bottom: .5px solid var(--workbench-line); }
.wb-tabs button { position: relative; border: 0; background: transparent; padding: 8px 12px 9px; color: var(--workbench-muted); font: 550 13px/1.2 var(--dsw-font-family); cursor: pointer; transition: color .14s; }
.wb-tabs button:hover { color: var(--workbench-ink); }
.wb-tabs button[aria-selected=true] { color: var(--workbench-ink); }
.wb-tabs button[aria-selected=true]::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--workbench-accent); }
.wb-tabs-count { margin-left: 6px; padding: 1px 6px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 8%, transparent); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.wb-breadcrumb { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--workbench-muted); }
.wb-breadcrumb-item { display: inline-flex; align-items: center; gap: 4px; }
.wb-breadcrumb-item button { border: 0; background: transparent; color: var(--workbench-muted); font: inherit; cursor: pointer; padding: 2px 3px; border-radius: 5px; }
.wb-breadcrumb-item button:hover { color: var(--workbench-ink); background: var(--dsw-alias-interactive-bg-hover); }
.wb-breadcrumb-item [aria-current=page] { color: var(--workbench-ink); font-weight: 550; }
.wb-pagination { display: inline-flex; gap: 2px; }
.wb-pagination button { min-width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--workbench-muted); font: 550 12.5px/1 var(--dsw-font-family); cursor: pointer; display: inline-grid; place-items: center; transition: background .13s, color .13s; }
.wb-pagination button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-pagination button[aria-current=page] { background: var(--workbench-tint-blue); color: var(--workbench-accent); }
.wb-pagination button:disabled { opacity: .4; cursor: default; }
.wb-stepper { display: flex; align-items: center; gap: 0; list-style: none; margin: 0; padding: 0; }
.wb-stepper li { display: flex; align-items: center; gap: 8px; }
.wb-stepper li + li::before { content: ''; width: 34px; height: 1.5px; margin: 0 10px; background: var(--workbench-line); }
.wb-stepper li[data-state=done] + li::before, .wb-stepper li[data-state=done]::before { background: var(--dsw-alias-state-success-primary); }
.wb-stepper-node { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1.4px solid var(--workbench-line); color: var(--workbench-muted); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.wb-stepper li[data-state=done] .wb-stepper-node { background: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-primary); color: rgb(255, 255, 255); }
.wb-stepper li[data-state=current] .wb-stepper-node { border-color: var(--workbench-accent); color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-stepper-label { font-size: 12.5px; color: var(--workbench-muted); }
.wb-stepper li[data-state=current] .wb-stepper-label { color: var(--workbench-ink); font-weight: 550; }
.wb-nav-section { display: grid; gap: 2px; }
.wb-nav-label { font-size: 10.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--workbench-muted); padding: 8px 10px 4px; }
.wb-nav-item { display: flex; align-items: center; gap: 9px; padding: 6px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--workbench-muted); font: 500 13px/1.3 var(--dsw-font-family); cursor: pointer; transition: background .13s, color .13s; }
.wb-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-nav-item[data-active] { background: var(--workbench-tint-blue); color: var(--workbench-accent); font-weight: 600; }
.wb-nav-count { margin-left: auto; font-size: 10.5px; font-variant-numeric: tabular-nums; padding: 1px 6px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 8%, transparent); }
.wb-alert { display: flex; align-items: flex-start; gap: 10px; padding: 11px 13px; border-radius: 10px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); font-size: 12.5px; line-height: 1.55; }
.wb-alert svg { flex-shrink: 0; margin-top: 1px; }
.wb-alert-body { display: grid; gap: 2px; flex: 1; }
.wb-alert-body strong { font-size: 12.5px; }
.wb-alert-body span { color: var(--workbench-muted); }
.wb-alert[data-tone=info] { background: var(--workbench-tint-blue); border-color: transparent; }
.wb-alert[data-tone=info] svg { color: var(--workbench-accent); }
.wb-alert[data-tone=success] { background: var(--workbench-tint-green); border-color: transparent; }
.wb-alert[data-tone=success] svg { color: var(--dsw-alias-state-success-primary); }
.wb-alert[data-tone=warn] { background: var(--workbench-tint-amber); border-color: transparent; }
.wb-alert[data-tone=warn] svg { color: var(--dsw-alias-state-warn-label); }
.wb-alert[data-tone=error] { background: var(--workbench-tint-red); border-color: transparent; }
.wb-alert[data-tone=error] svg { color: var(--workbench-danger); }
.wb-toast { display: flex; align-items: flex-start; gap: 10px; min-width: 280px; max-width: 360px; padding: 12px 13px; border-radius: 12px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); box-shadow: 0 12px 36px rgba(0, 0, 0, .16); }
.wb-toast[data-tone=success] svg { color: var(--dsw-alias-state-success-primary); }
.wb-toast[data-tone=warn] svg { color: var(--dsw-alias-state-warn-label); }
.wb-toast[data-tone=error] svg { color: var(--workbench-danger); }
.wb-toast[data-tone=info] svg { color: var(--workbench-accent); }
.wb-toast-body { display: grid; gap: 2px; flex: 1; font-size: 12.5px; }
.wb-toast-body span { color: var(--workbench-muted); line-height: 1.5; }
.wb-toast-close { display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 5px; background: transparent; color: var(--workbench-muted); cursor: pointer; }
.wb-toast-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-spinner { display: inline-block; border-radius: 50%; border: 1.8px solid color-mix(in srgb, var(--workbench-ink) 14%, transparent); border-top-color: var(--workbench-accent); animation: wb-spin .7s linear infinite; }
.wb-thinking { display: inline-flex; gap: 4px; align-items: center; padding: 4px 2px; }
.wb-thinking span { width: 5px; height: 5px; border-radius: 50%; background: var(--workbench-muted); animation: wb-bounce 1.2s ease-in-out infinite; }
.wb-thinking span:nth-child(2) { animation-delay: .15s; }
.wb-thinking span:nth-child(3) { animation-delay: .3s; }
@keyframes wb-bounce { 30% { transform: translateY(-4px); opacity: 1; } 60% { transform: translateY(0); opacity: .5; } }
.wb-result { display: grid; justify-items: center; gap: 7px; padding: 34px 20px; text-align: center; }
.wb-result-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--workbench-tint-blue); color: var(--workbench-accent); margin-bottom: 4px; }
.wb-result strong { font-size: 14px; font-weight: 600; }
.wb-result p { margin: 0; font-size: 12.5px; color: var(--workbench-muted); max-width: 320px; line-height: 1.6; }
.wb-result-actions { display: flex; gap: 10px; margin-top: 10px; }
.wb-notification { display: flex; align-items: flex-start; gap: 11px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; text-align: left; transition: background .13s; }
.wb-notification:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-notification-body { flex: 1; display: grid; gap: 2px; font-size: 12.5px; line-height: 1.5; color: var(--workbench-muted); }
.wb-notification-body strong { color: var(--workbench-ink); }
.wb-notification-time { font-size: 11px; color: var(--workbench-muted); }
.wb-notification-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--workbench-accent); margin-top: 6px; flex-shrink: 0; }
.wb-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.wb-table th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--workbench-muted); padding: 8px 12px; border-bottom: .5px solid var(--workbench-line); }
.wb-table td { padding: 9px 12px; border-bottom: .5px solid var(--workbench-line); color: var(--workbench-ink); }
.wb-table td[data-numeric] { font-variant-numeric: tabular-nums; }
.wb-table tbody tr { transition: background .12s; }
.wb-table tbody tr:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-table tbody tr:last-child td { border-bottom: 0; }
.wb-desc { display: grid; margin: 0; }
.wb-desc div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 14px; padding: 7px 0; border-bottom: .5px solid var(--workbench-line); }
.wb-desc div:last-child { border-bottom: 0; }
.wb-desc dt { font-size: 12px; color: var(--workbench-muted); }
.wb-desc dd { margin: 0; font-size: 12.5px; }
.wb-stat { display: grid; gap: 3px; }
.wb-stat-label { font-size: 11px; color: var(--workbench-muted); }
.wb-stat-value { font-size: 22px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.wb-stat-row { display: flex; gap: 26px; }
.wb-stat-row .wb-stat + .wb-stat { padding-left: 26px; border-left: .5px solid var(--workbench-line); }
.wb-delta { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.wb-delta[data-up=true] { color: var(--dsw-alias-state-success-primary); }
.wb-delta[data-up=false] { color: var(--workbench-danger); }
.wb-delta[data-up=false] svg { transform: rotate(90deg); }
.wb-sparkline { stroke: var(--workbench-accent); }
.wb-sparkline[data-tone=success] { stroke: var(--dsw-alias-state-success-primary); }
.wb-sparkline[data-tone=warn] { stroke: var(--dsw-alias-state-warn-primary); }
.wb-bars { display: inline-flex; align-items: flex-end; gap: 3px; }
.wb-bars span { width: 5px; border-radius: 2px; background: var(--workbench-accent); }
.wb-bars[data-tone=success] span { background: var(--dsw-alias-state-success-primary); }
.wb-bars[data-tone=warn] span { background: var(--dsw-alias-state-warn-primary); }
.wb-donut { position: relative; display: inline-grid; place-items: center; }
.wb-donut svg { transform: rotate(-90deg); }
.wb-donut-label { position: absolute; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.wb-code { padding: 2px 5px; border-radius: 5px; background: color-mix(in srgb, var(--workbench-ink) 7%, transparent); font: 500 12px/1.4 ui-monospace, 'SF Mono', 'Cascadia Code', monospace; }
.wb-codeblock { border-radius: 10px; border: .5px solid var(--workbench-line); background: var(--workbench-ink); color: var(--workbench-canvas); overflow: hidden; }
.wb-codeblock-head { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border-bottom: .5px solid color-mix(in srgb, var(--workbench-canvas) 14%, transparent); font-size: 11px; color: color-mix(in srgb, var(--workbench-canvas) 65%, transparent); }
.wb-codeblock-head .wb-copy { color: color-mix(in srgb, var(--workbench-canvas) 65%, transparent); }
.wb-codeblock-head .wb-copy:hover { color: var(--workbench-canvas); background: rgba(255, 255, 255, .1); }
.wb-codeblock pre { margin: 0; padding: 12px 14px; font: 400 12px/1.65 ui-monospace, 'SF Mono', 'Cascadia Code', monospace; overflow-x: auto; }
.wb-filerow { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--workbench-ink); font: 450 12.5px/1.3 var(--dsw-font-family); cursor: pointer; text-align: left; transition: background .13s; }
.wb-filerow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wb-filerow svg { color: var(--workbench-muted); flex-shrink: 0; }
.wb-filerow-name { flex: 1; font-weight: 550; }
.wb-filerow-size { font-size: 11px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; }
.wb-money { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: -.01em; }
.wb-money[data-tone=muted] { color: var(--workbench-muted); font-weight: 500; }
.wb-money[data-tone=success] { color: var(--dsw-alias-state-success-primary); }
.wb-divider { display: flex; align-items: center; gap: 12px; color: var(--workbench-muted); font-size: 11px; }
.wb-divider::before, .wb-divider::after { content: ''; flex: 1; height: .5px; background: var(--workbench-line); }
.wb-surface { border: .5px solid var(--workbench-line); border-radius: 12px; background: var(--workbench-paper); box-shadow: 0 1px 2px rgba(0, 0, 0, .04); }
.wb-surface[data-padding] { padding: 16px; }
.wb-disclosure { border-bottom: .5px solid var(--workbench-line); }
.wb-disclosure summary { display: flex; align-items: center; gap: 8px; padding: 10px 2px; cursor: pointer; font-size: 13px; font-weight: 550; list-style: none; user-select: none; }
.wb-disclosure summary::-webkit-details-marker { display: none; }
.wb-disclosure summary svg { transition: transform .16s var(--workbench-ease); color: var(--workbench-muted); }
.wb-disclosure[open] summary svg { transform: rotate(90deg); }
.wb-disclosure-body { padding: 2px 2px 14px 21px; font-size: 12.5px; color: var(--workbench-muted); line-height: 1.65; }
.wb-overlay { position: relative; display: grid; place-items: center; min-height: 240px; border-radius: 14px; background: color-mix(in srgb, var(--workbench-ink) 32%, transparent); padding: 26px; }
.wb-dialog { width: min(440px, 100%); border-radius: 14px; background: var(--workbench-paper); box-shadow: 0 24px 70px rgba(0, 0, 0, .28); }
.wb-dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; font-size: 14px; }
.wb-dialog-body { padding: 2px 16px 14px; font-size: 12.5px; color: var(--workbench-muted); line-height: 1.6; }
.wb-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: .5px solid var(--workbench-line); }
.wb-popover { display: inline-grid; gap: 4px; min-width: 200px; padding: 10px 12px; border-radius: 11px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); box-shadow: 0 10px 32px rgba(0, 0, 0, .14); font-size: 12.5px; }
.wb-command { width: min(480px, 100%); border-radius: 14px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); box-shadow: 0 24px 70px rgba(0, 0, 0, .22); overflow: hidden; }
.wb-command-head { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: .5px solid var(--workbench-line); color: var(--workbench-muted); }
.wb-command-head input { flex: 1; border: 0; background: transparent; outline: none; color: var(--workbench-ink); font: 400 13.5px/1 var(--dsw-font-family); }
.wb-command-list { display: grid; gap: 1px; padding: 6px; }
.wb-command-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--workbench-ink); font: 500 12.5px/1.3 var(--dsw-font-family); cursor: pointer; text-align: left; }
.wb-command-item svg { color: var(--workbench-muted); }
.wb-command-item:hover, .wb-command-item[aria-selected=true] { background: var(--workbench-tint-blue); }
.wb-command-foot { display: flex; gap: 14px; padding: 8px 14px; border-top: .5px solid var(--workbench-line); color: var(--workbench-muted); font-size: 11px; align-items: center; }
.wb-hovercard { display: inline-grid; gap: 6px; max-width: 260px; padding: 12px 14px; border-radius: 11px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); box-shadow: 0 10px 32px rgba(0, 0, 0, .14); font-size: 12.5px; }
.wb-hovercard div { color: var(--workbench-muted); line-height: 1.55; font-size: 12px; }
.wb-prompt { border-radius: 12px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); transition: border-color .15s, box-shadow .15s; }
.wb-prompt:focus-within { border-color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-prompt textarea { width: 100%; border: 0; background: transparent; outline: none; resize: none; padding: 11px 13px 4px; color: var(--workbench-ink); font: 400 13px/1.55 var(--dsw-font-family); box-sizing: border-box; }
.wb-prompt-foot { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 8px 13px; }
.wb-prompt-send { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 8px; background: var(--workbench-action); color: var(--workbench-action-ink); cursor: pointer; transition: transform .1s, background .14s; }
.wb-prompt-send:hover { background: color-mix(in srgb, var(--workbench-action) 88%, var(--workbench-ink)); }
.wb-prompt-send:active { transform: scale(.9); }
.wb-streaming { font-size: 13px; line-height: 1.65; }
.wb-caret { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; background: var(--workbench-accent); animation: wb-pulse 1s steps(2) infinite; }
.wb-citation { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 4px; border: .5px solid var(--workbench-line); border-radius: 99px; background: var(--workbench-paper); color: var(--workbench-muted); font: 500 11.5px/1.4 var(--dsw-font-family); cursor: pointer; transition: border-color .13s, color .13s; }
.wb-citation:hover { border-color: var(--workbench-accent); color: var(--workbench-accent); }
.wb-citation span { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--workbench-tint-blue); color: var(--workbench-accent); font-size: 9.5px; font-weight: 700; }
.wb-agentrun { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 12px; border: .5px solid var(--workbench-line); border-radius: 11px; background: var(--workbench-paper); cursor: pointer; text-align: left; transition: border-color .14s, box-shadow .14s; }
.wb-agentrun:hover { border-color: color-mix(in srgb, var(--workbench-accent) 40%, transparent); box-shadow: 0 2px 10px rgba(0, 0, 0, .06); }
.wb-agentrun-body { flex: 1; display: grid; gap: 1px; }
.wb-agentrun-body strong { font-size: 12.5px; font-weight: 600; }
.wb-agentrun-body span { font-size: 11px; color: var(--workbench-muted); }
.wb-pagehead { display: grid; gap: 10px; }
.wb-pagehead-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.wb-pagehead h1 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -.025em; }
.wb-pagehead p { margin: 5px 0 0; font-size: 12.5px; color: var(--workbench-muted); }
.wb-pagehead-actions { display: flex; gap: 8px; }
.wb-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wb-filterchip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 9px; border-radius: 8px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); font-size: 12px; font-weight: 550; }
.wb-filterchip-label { color: var(--workbench-muted); font-weight: 450; }
.wb-filterchip button { display: grid; place-items: center; width: 16px; height: 16px; border: 0; border-radius: 5px; background: transparent; color: var(--workbench-muted); cursor: pointer; }
.wb-filterchip button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-splitview { display: flex; gap: 0; align-items: stretch; }
.wb-splitview > div { min-width: 0; }
.wb-splitview-second { flex: 1; padding-left: 20px; margin-left: 20px; border-left: .5px solid var(--workbench-line); }
.wb-emptyslot { display: grid; justify-items: center; gap: 6px; padding: 26px 18px; border: 1px dashed color-mix(in srgb, var(--workbench-ink) 20%, transparent); border-radius: 12px; color: var(--workbench-muted); text-align: center; }
.wb-emptyslot strong { font-size: 12.5px; color: var(--workbench-ink); font-weight: 550; }
.wb-emptyslot span { font-size: 11.5px; }
.wb-kbd-combo { display: inline-flex; align-items: center; gap: 3px; }
.wb-kbd-combo > span { display: inline-flex; align-items: center; gap: 3px; }
.wb-kbd-plus { font-size: 10px; color: var(--workbench-muted); }
.wb-pipeline { display: flex; list-style: none; margin: 0; padding: 0; gap: 3px; }
.wb-pipeline li { position: relative; flex: 1; padding: 6px 10px 6px 16px; font-size: 11.5px; font-weight: 550; color: var(--workbench-muted); background: color-mix(in srgb, var(--workbench-ink) 6%, transparent); clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%); }
.wb-pipeline li:first-child { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%); padding-left: 10px; }
.wb-pipeline li[data-state=done] { background: var(--workbench-tint-green); color: var(--dsw-alias-state-success-primary); }
.wb-pipeline li[data-state=current] { background: var(--workbench-accent); color: var(--workbench-action-ink); }
.wb-board { display: grid; gap: 14px; }
.wb-board-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.wb-board-head h1 { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -.025em; }
.wb-board-head p { margin: 5px 0 0; font-size: 12.5px; color: var(--workbench-muted); }
.wb-board-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wb-board-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: start; }
.wb-board-col { display: grid; gap: 8px; border-radius: 12px; padding: 4px; transition: background .16s; }
.wb-board-col[data-drop] { background: var(--workbench-tint-blue); }
.wb-board-colhead { display: flex; align-items: center; gap: 8px; padding: 4px 8px 8px; border-bottom: .5px solid var(--workbench-line); }
.wb-board-colhead strong { font-size: 12.5px; font-weight: 600; }
.wb-board-colhead .wb-board-count { margin-left: auto; font-size: 11px; color: var(--workbench-muted); font-variant-numeric: tabular-nums; padding: 1px 7px; border-radius: 99px; background: color-mix(in srgb, var(--workbench-ink) 7%, transparent); }
.wb-board-add { display: flex; align-items: center; gap: 7px; width: 100%; padding: 7px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--workbench-muted); font: 500 12px/1.3 var(--dsw-font-family); cursor: pointer; transition: background .13s, color .13s; }
.wb-board-add:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-card { position: relative; display: grid; gap: 7px; padding: 11px 12px; border-radius: 11px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); cursor: pointer; text-align: left; width: 100%; font: inherit; color: inherit; transition: border-color .14s, box-shadow .14s, transform .1s; }
.wb-card:hover { border-color: color-mix(in srgb, var(--workbench-ink) 22%, transparent); box-shadow: 0 3px 12px rgba(0, 0, 0, .07); }
.wb-card:active { transform: scale(.99); }
.wb-card[data-selected] { border-color: var(--workbench-accent); box-shadow: 0 0 0 3px var(--workbench-tint-blue); }
.wb-card[data-dragging] { opacity: .45; }
.wb-card-top { display: flex; align-items: center; gap: 8px; }
.wb-card-check { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 5px; border: .5px solid var(--workbench-line); background: var(--workbench-paper); color: var(--workbench-action-ink); flex-shrink: 0; opacity: 0; transition: opacity .13s, background .13s, border-color .13s; }
.wb-card:hover .wb-card-check, .wb-card[data-selected] .wb-card-check, .wb-card-check[data-on] { opacity: 1; }
.wb-card-check[data-on] { background: var(--workbench-accent); border-color: var(--workbench-accent); }
.wb-card-title { font-size: 13px; font-weight: 550; line-height: 1.4; }
.wb-card-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 11px; color: var(--workbench-muted); }
.wb-card-due { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
.wb-card-due[data-tone=soon] { color: var(--dsw-alias-state-warn-label); }
.wb-card-due[data-tone=over] { color: var(--workbench-danger); font-weight: 600; }
.wb-card-goal { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px; }
.wb-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wb-card-actions { display: inline-flex; align-items: center; gap: 4px; }
.wb-card-status { appearance: none; border: 0; background: transparent; color: var(--workbench-muted); font: 500 11px/1.6 var(--dsw-font-family); cursor: pointer; border-radius: 6px; padding: 1px 4px; }
.wb-card-status:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-card-edit { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: var(--workbench-muted); cursor: pointer; }
.wb-card-edit:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--workbench-ink); }
.wb-card-outcome { margin: 0; font-size: 11.5px; color: var(--workbench-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.wb-board-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.wb-toast-stack { position: fixed; right: 22px; bottom: 22px; display: grid; gap: 10px; z-index: 60; }
.wb-action-bar[data-floating] { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); z-index: 55; }
@media (max-width: 1100px) { .wb-board-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .wb-board-cols { grid-template-columns: 1fr; } }
@media (min-width: 1500px) { [data-trade-workbench] .ent { padding-top: 36px; } }
@media (max-width: 1050px) { .wb-main { grid-template-columns: minmax(0, 1fr); gap: 30px; } }
@media (max-width: 760px) {
  [data-trade-workbench] .ent { padding: 20px 20px 36px; }
  [data-trade-workbench] .ent-header { margin-bottom: 22px; padding-bottom: 18px; }
  [data-trade-workbench] .ent-header h1 { font-size: 21px; }
  [data-trade-workbench] .ent-profile > .ent-inner > .ent-tabs { gap: 22px; }
  .wb-outputs { grid-template-columns: minmax(0, 1fr); }
  .wb-goal { flex-direction: column; gap: 20px; }
  .wb-goal-count { display: flex; align-items: baseline; gap: 10px; text-align: left; padding-top: 0; }
  .wb-goal-count strong { font-size: 40px; }
  .wb-goal-count span { margin-top: 0; }
  .wb-goal-empty { align-items: flex-start; flex-direction: column; gap: 14px; }
  .wb-event-body { flex-wrap: wrap; row-gap: 4px; }
  .wb-event-detail { flex-basis: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .ent-profile *, .ent-profile *::before, .ent-profile *::after { animation: none !important; transition: none !important; }
  .ent-profile :is(.ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button):active { transform: none; }
}
`
