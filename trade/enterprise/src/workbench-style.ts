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
.wb-introduction { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin: 8px 0 26px; }
.ent .wb-introduction h2 { font-size: clamp(22px, 2.2vw, 30px); font-weight: 600; line-height: 1.4; letter-spacing: -.025em; margin: 10px 0; }
.wb-introduction p, .wb-section-heading p { margin: 0; font-size: 13px; color: var(--workbench-muted); line-height: 1.8; }
.wb-private { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 6px 9px; background: var(--workbench-paper); border: .5px solid var(--workbench-line); border-radius: 6px; color: var(--workbench-muted); font-size: 11px; }
.wb-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.wb-metric { display: flex; flex-direction: column; text-align: left; padding: 20px; border: .5px solid var(--workbench-line); border-radius: 12px; background: var(--workbench-paper); color: var(--workbench-ink); font: inherit; cursor: pointer; }
.wb-metric-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: var(--workbench-muted); font-size: 12px; }
.wb-metric-top svg { color: var(--workbench-accent); }
.wb-metric > strong { font-size: 32px; line-height: 1.3; font-weight: 600; margin: 14px 0 10px; font-variant-numeric: tabular-nums; }
.wb-metric-hint { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--workbench-muted); font-size: 11px; line-height: 1.6; }
.wb-metric-hint svg { flex: none; }
.wb-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 30px 0 16px; }
.ent .wb-section-heading h2 { font-size: 16px; line-height: 1.5; font-weight: 600; margin: 0 0 4px; }
.wb-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.wb-action { display: grid; grid-template-columns: 1fr auto; text-align: left; align-items: center; padding: 22px; gap: 10px; background: var(--workbench-paper); border: .5px solid var(--workbench-line); border-radius: 12px; color: var(--workbench-ink); font: inherit; cursor: pointer; }
.wb-icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; flex: none; border-radius: 11px; background: var(--workbench-accent-soft); color: var(--workbench-accent); }
.wb-action > .wb-icon { grid-column: 1 / -1; margin-bottom: 6px; }
.wb-action strong { font-size: 14px; font-weight: 600; }
.wb-action > span:not(.wb-icon) { grid-column: 1; grid-row: 3; font-size: 12px; line-height: 1.7; color: var(--workbench-muted); }
.wb-action > svg { grid-column: 2; grid-row: 2; color: var(--workbench-muted); }
.wb-metric, .wb-action { transition: border-color 180ms ease, background 180ms ease, transform 180ms var(--workbench-ease), box-shadow 180ms ease; }
.wb-bottom { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(250px, 1fr); gap: 20px; margin-top: 26px; }
.wb-card { border: .5px solid var(--workbench-line); border-radius: 12px; background: var(--workbench-paper); padding: 22px; min-width: 0; }
.ent .wb-card h2 { font-size: 15px; line-height: 1.5; margin: 0; }
.wb-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wb-card button { border-radius: 7px; }
.wb-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 26px 10px 8px; }
.wb-empty h3 { font-size: 14px; margin: 14px 0 6px; }
.wb-empty p { font-size: 12px; line-height: 1.7; margin: 0 0 12px; color: var(--workbench-muted); }
.wb-knowledge { display: flex; align-items: flex-start; flex-direction: column; gap: 14px; }
.wb-knowledge > p { font-size: 13px; line-height: 1.8; margin: 0; color: var(--workbench-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.wb-knowledge-count { font-size: 12px; color: var(--workbench-muted); }
.wb-knowledge > button { margin-top: auto; padding-inline: 0; color: var(--workbench-accent); font-size: 12px; gap: 8px; }
.wb-task-list ul { padding: 0; margin: 12px 0 0; list-style: none; }
.wb-task-list li + li { border-top: .5px solid var(--workbench-line); }
.wb-task-list li button { display: flex; align-items: center; width: 100%; gap: 10px; padding: 15px 0; text-align: left; background: none; border: 0; color: var(--workbench-ink); font: inherit; cursor: pointer; }
.wb-task-list li button:hover { background: var(--workbench-soft); }
.wb-task-list li strong { display: block; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.wb-task-list li small { display: block; font-size: 11px; margin-top: 5px; color: var(--workbench-muted); }
.wb-task-list li button > span:nth-child(2) { min-width: 0; flex: 1; }
.wb-task-list li small { overflow-wrap: anywhere; }
.wb-task-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; corner-shape: round; background: var(--workbench-accent); }
.wb-task-dot[data-status=blocked] { background: var(--dsw-alias-state-warn-primary); }
.wb-task-status { flex: none; margin-left: auto; padding: 4px 7px; border-radius: 5px; background: var(--workbench-soft); color: var(--workbench-muted); font-size: 11px; }
.wb-task-status[data-status=blocked] { color: var(--dsw-alias-state-warn-label); }
.wb-footnote { text-align: right; font-size: 11px; color: var(--workbench-muted); margin: 18px 0 0; }
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
.ent-profile :is(.ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button, .wb-card button) { transition: transform 130ms var(--workbench-ease), background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
.ent-profile :is(.ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button, .wb-card button):not(:disabled):active { transform: translateY(1px) scale(.98); }
.wb-metric:active, .wb-action:active { transform: scale(.985); }
.wb-metric-hint svg, .wb-action > svg, .wb-knowledge > button svg { transition: transform 180ms var(--workbench-ease), color 150ms ease; }
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
@media (hover: hover) {
  .wb-metric:hover, .wb-action:hover { border-color: color-mix(in srgb, var(--workbench-accent) 55%, var(--workbench-line)); background: var(--workbench-accent-soft); transform: translateY(-2px); box-shadow: 0 5px 14px color-mix(in srgb, var(--workbench-ink) 5%, transparent); }
  .wb-metric:hover .wb-metric-hint svg, .wb-action:hover > svg, .wb-knowledge > button:hover svg { transform: translateX(3px); color: var(--workbench-accent); }
  .wb-metric:active, .wb-action:active { transform: translateY(0) scale(.985); box-shadow: none; }
}
@keyframes wb-enter { from { opacity: .3; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes wb-confirm { from { transform: scale(.75); } to { transform: scale(1); } }
@keyframes wb-spin { to { transform: rotate(360deg); } }
@keyframes wb-pulse { 50% { opacity: .4; } }
@media (min-width: 1500px) { [data-trade-workbench] .ent { padding-top: 36px; } }
@media (max-width: 1050px) { .wb-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wb-private { display: none; } }
@media (max-width: 760px) {
  [data-trade-workbench] .ent { padding: 20px 20px 36px; }
  [data-trade-workbench] .ent-header { margin-bottom: 22px; padding-bottom: 18px; }
  [data-trade-workbench] .ent-header h1 { font-size: 21px; }
  [data-trade-workbench] .ent-profile > .ent-inner > .ent-tabs { gap: 22px; }
  .wb-bottom, .wb-actions, .wb-outputs { grid-template-columns: minmax(0, 1fr); }
  .wb-action { grid-template-columns: 42px 1fr auto; gap: 4px 14px; padding: 18px; }
  .wb-action > .wb-icon { grid-column: 1; grid-row: 1 / 3; margin: 0; }
  .wb-action strong { grid-column: 2; grid-row: 1; }
  .wb-action > span:not(.wb-icon) { grid-column: 2; grid-row: 2; }
  .wb-action > svg { grid-column: 3; grid-row: 1 / 3; }
  .wb-metric { padding: 16px; } .wb-metric > strong { font-size: 28px; }
  .wb-metric-hint svg { display: none; }
  .wb-section-heading { margin-top: 24px; }
  .wb-introduction { margin-top: 0; }
}
@media (max-width: 380px) { .wb-metrics { gap: 10px; } .wb-metric { padding: 12px; } .wb-metric-top { gap: 5px; } }
@media (prefers-reduced-motion: reduce) {
  .ent-profile *, .ent-profile *::before, .ent-profile *::after { animation: none !important; transition: none !important; }
  .ent-profile :is(.wb-metric, .wb-action, .ent-actions button, .ent-toolbar button, .sp-setup-conversation > button, .ent-filters button, .wb-card button):active,
  .wb-metric:hover, .wb-action:hover, .wb-metric:hover .wb-metric-hint svg, .wb-action:hover > svg, .wb-knowledge > button:hover svg { transform: none; }
}
`
