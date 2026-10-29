export const panelStyle = `
.otk-panel { --otk-accent: #e86a30; --otk-line: color-mix(in srgb, currentColor 15%, transparent); --otk-soft: color-mix(in srgb, currentColor 5%, transparent); container-type: inline-size; font-size: 13px; line-height: 1.5; }
.otk-panel * { box-sizing: border-box; }
.otk-panel .otk-header { display: flex; align-items: center; gap: 11px; padding: 2px 0 15px; }
.otk-panel .otk-mascot { width: 44px; height: 44px; flex: none; border-radius: 14px; object-fit: cover; background: #f8dfcc; border: 1px solid rgba(232,106,48,.2); }
.otk-panel .otk-heading { min-width: 0; }
.otk-panel .otk-heading h2 { font-size: 16px; line-height: 1.25; letter-spacing: -.02em; margin: 0; }
.otk-panel .otk-heading p { margin: 3px 0 0; font-size: 11px; opacity: .58; letter-spacing: .02em; }
.otk-panel button { font: inherit; transition: background .15s, border-color .15s, box-shadow .15s; }
.otk-panel button:focus-visible, .otk-panel input:focus-visible, .otk-panel select:focus-visible, .otk-panel textarea:focus-visible, .otk-panel a:focus-visible { outline: 2px solid var(--otk-accent); outline-offset: 2px; }
.otk-panel button:disabled { cursor: not-allowed !important; opacity: .48; }
.otk-panel button:not(:disabled):hover { background: color-mix(in srgb, currentColor 8%, transparent) !important; }
.otk-panel input:not([type=checkbox]), .otk-panel select, .otk-panel textarea { min-width: 0; max-width: 100%; font: inherit; color: inherit; background: var(--otk-soft) !important; border: 1px solid var(--otk-line) !important; border-radius: 8px !important; padding: 8px; }
.otk-panel textarea { min-height: 68px; resize: vertical; }
.otk-panel input[type=checkbox] { accent-color: var(--otk-accent); }
.otk-panel a { color: inherit; text-decoration-color: var(--otk-accent); text-underline-offset: 3px; overflow-wrap: anywhere; }
.otk-panel .otk-search { display: flex; flex-wrap: wrap; gap: 7px; padding: 10px; border-radius: 13px; background: var(--otk-soft); border: 1px solid var(--otk-line); }
.otk-panel .otk-search input { flex: 1 1 130px !important; background: transparent !important; }
.otk-panel .otk-search select { flex: 0 1 auto; }
.otk-panel .otk-search button { background: var(--otk-accent) !important; color: white !important; border-color: var(--otk-accent) !important; font-weight: 650; }
.otk-panel .otk-search button:hover:not(:disabled) { background: #c85720 !important; }
.otk-panel .otk-nav, .otk-panel .otk-subnav { display: flex; flex-wrap: wrap; gap: 5px; }
.otk-panel .otk-nav { margin: 14px 0 0; padding-bottom: 12px; border-bottom: 1px solid var(--otk-line); }
.otk-panel .otk-nav button, .otk-panel .otk-subnav button { padding: 7px 10px !important; font-size: 12px; border-color: transparent !important; background: transparent !important; white-space: nowrap; }
.otk-panel .otk-nav button[aria-pressed=true], .otk-panel .otk-subnav button[aria-pressed=true] { background: color-mix(in srgb, var(--otk-accent) 16%, transparent) !important; border-color: color-mix(in srgb, var(--otk-accent) 30%, transparent) !important; font-weight: 700; }
.otk-panel .otk-subnav { margin-top: 10px; padding: 4px; border-radius: 10px; background: var(--otk-soft); }
.otk-panel .otk-status { font-size: 12px; opacity: .67; margin: 13px 2px; overflow-wrap: anywhere; }
.otk-panel .otk-card { border: 1px solid var(--otk-line) !important; background: var(--otk-soft) !important; border-radius: 12px !important; }
.otk-panel .otk-result { width: 100%; min-height: 84px; padding: 8px !important; display: grid; grid-template-columns: 54px minmax(0, 1fr); grid-template-rows: auto 1fr; gap: 2px 10px; align-items: start; text-align: left; }
.otk-panel .otk-result img, .otk-panel .otk-result .otk-placeholder { grid-row: 1 / 3; width: 54px; height: 72px; object-fit: cover; border-radius: 7px; margin: 0 !important; float: none !important; }
.otk-panel .otk-placeholder { display: grid; place-items: center; background: color-mix(in srgb, var(--otk-accent) 15%, transparent); color: var(--otk-accent); font-size: 20px; }
.otk-panel .otk-result strong { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.otk-panel .otk-result span:not(.otk-placeholder) { margin: 0 !important; overflow-wrap: anywhere; }
.otk-panel .otk-detail { padding: 14px !important; }
.otk-panel .otk-detail img { border-radius: 10px !important; }
.otk-panel .otk-detail h3 { margin: 12px 0 4px; line-height: 1.35; overflow-wrap: anywhere; }
.otk-panel .otk-empty { padding: 28px 16px; text-align: center; border: 1px dashed var(--otk-line); border-radius: 12px; }
.otk-panel .otk-empty strong { display: block; font-size: 14px; }
.otk-panel .otk-empty p { margin: 6px auto 0; max-width: 220px; opacity: .65; font-size: 12px; }
.otk-panel form.otk-card { border-color: var(--otk-line) !important; padding: 14px !important; }
.otk-panel form.otk-card label { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
.otk-panel form.otk-card label input:not([type=checkbox]), .otk-panel form.otk-card label select, .otk-panel form.otk-card label textarea { flex: 1 1 120px; }
@container (max-width: 250px) { .otk-panel .otk-search input { flex-basis: 100% !important; } .otk-panel .otk-search select { flex: 1 1 auto; } }
`;
