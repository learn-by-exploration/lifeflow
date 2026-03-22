/**
 * Frontend Validation Tests
 * 
 * Validates public/index.html for:
 * 1. JavaScript syntax errors (writes temp .mjs file and runs node --check)
 * 2. DOM element references — every hard $('id').x must have a matching id or be dynamically created
 * 3. No duplicate HTML element ids
 * 4. All addEventListener named handler references exist as defined functions
 * 5. Critical UI elements exist in HTML
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

// Load and parse once
const html = fs.readFileSync(HTML_PATH, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const scriptContent = scriptMatch ? scriptMatch[1] : '';
const htmlWithoutScript = html.replace(/<script>[\s\S]*?<\/script>/, '');

describe('Frontend Validation', () => {

  it('JavaScript has no syntax errors', () => {
    // Write script to temp .mjs file wrapped in async function and check with node --check.
    // Using .mjs enables top-level await and module syntax checking.
    const tmpFile = path.join(__dirname, '..', '.tmp-syntax-check.mjs');
    try {
      const wrapped = `
// Stub browser globals for syntax-only check
const document = {}, window = {}, navigator = {}, localStorage = {};
const HTMLElement = class {}, Event = class {}, DragEvent = class {};
async function __main() {
${scriptContent}
}
`;
      fs.writeFileSync(tmpFile, wrapped);
      execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
    } catch (e) {
      const stderr = e.stderr ? e.stderr.toString() : e.message;
      assert.fail(`JavaScript syntax error in index.html:\n${stderr}`);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  });

  it('Static HTML element ids referenced by hard $() calls exist', () => {
    // Find all $('id').something (NOT $('id')?.something) patterns — hard references
    const hardRefRegex = /\$\('([^']+)'\)\./g;
    const hardRefs = new Set();
    let match;
    while ((match = hardRefRegex.exec(scriptContent)) !== null) {
      const fullContext = scriptContent.substring(match.index, match.index + match[0].length + 5);
      if (!fullContext.includes('?.')) {
        hardRefs.add(match[1]);
      }
    }

    // Extract all id="" from static HTML (outside <script>)
    const htmlIds = new Set();
    const idRegex = /\bid=["']([^"']+)["']/g;
    while ((match = idRegex.exec(htmlWithoutScript)) !== null) {
      htmlIds.add(match[1]);
    }

    // IDs that are dynamically created by render functions (not in static HTML but safe)
    const dynamicIds = new Set([
      // Calendar view
      'cal-today',
      // Task detail panel (created by openDP)
      'cp', 'cn', 'st-add', 'st-input', 'cmt-add', 'cmt-input',
      // Command palette (created by openSearch)
      'cp-quick-create',
      // Tags view (created by renderTags)
      'tag-color-picker',
      // Templates view (created by renderTemplates)
      'tmpl-new', 'tmpl-f-cancel', 'tmpl-f-save', 'tmpl-f-name',
      'tmpl-f-tasks', 'tmpl-f-desc', 'tmpl-f-icon',
      'tmpl-a-cancel', 'tmpl-a-apply', 'tmpl-a-goal',
      // Notes view (created by renderNotes/openNote)
      'note-back', 'note-del', 'note-title', 'note-content', 'note-goal',
      // Weekly review (created by renderReview)
      'rv-save', 'rv-acc', 'rv-refl', 'rv-next',
      // Automation rules (created by renderRules)
      'rule-action', 'rule-cancel', 'rule-save', 'rule-name', 'rule-trigger',
      // Briefing (created by showBriefing)
      'briefing-go',
    ]);

    // Dynamic prefixes (ids created in loops with numeric/key suffixes)
    const dynamicIdPrefixes = ['gb-', 'pl-', 'set-', 'hab-', 'fb-', 'gm-', 'dp-'];

    const missing = [...hardRefs].filter(id => {
      if (htmlIds.has(id)) return false;
      if (dynamicIds.has(id)) return false;
      if (dynamicIdPrefixes.some(p => id.startsWith(p))) return false;
      return true;
    });

    if (missing.length > 0) {
      assert.fail(
        `${missing.length} hard $() reference(s) have no matching id in HTML or dynamic allowlist:\n` +
        missing.map(id => `  - $('${id}')`).join('\n') +
        '\n\nFix: add id to HTML, use $()?.method, or add to dynamicIds allowlist in this test.'
      );
    }
  });

  it('No duplicate element ids in static HTML', () => {
    const idRegex = /\bid=["']([^"']+)["']/g;
    const ids = {};
    let match;
    while ((match = idRegex.exec(htmlWithoutScript)) !== null) {
      ids[match[1]] = (ids[match[1]] || 0) + 1;
    }
    const dupes = Object.entries(ids).filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      assert.fail(
        `Duplicate HTML ids found:\n` +
        dupes.map(([id, count]) => `  - id="${id}" appears ${count} times`).join('\n')
      );
    }
  });

  it('All addEventListener named handler references exist as defined functions', () => {
    // Find .addEventListener('event', namedFunction) — bare identifier, not arrow/anonymous
    const listenerRegex = /\.addEventListener\(\s*'[^']+'\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[,)]/g;
    const handlers = new Set();
    let match;
    while ((match = listenerRegex.exec(scriptContent)) !== null) {
      handlers.add(match[1]);
    }

    // Find all function/variable declarations
    const declRegex = /(?:function\s+|async\s+function\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const definedNames = new Set();
    while ((match = declRegex.exec(scriptContent)) !== null) {
      definedNames.add(match[1]);
    }

    const builtins = new Set([
      'e', 'el', 'ev', 'event', 'console', 'window', 'document',
      'navigator', 'location', 'history', 'fetch', 'alert', 'confirm',
      'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'requestAnimationFrame',
    ]);
    const missing = [...handlers].filter(h => !definedNames.has(h) && !builtins.has(h));

    if (missing.length > 0) {
      assert.fail(
        `addEventListener references undefined functions:\n` +
        missing.map(h => `  - ${h}`).join('\n')
      );
    }
  });

  it('Critical UI elements exist in HTML', () => {
    // These elements MUST exist in static HTML for the app to boot
    const criticalIds = [
      'ct',           // main content area
      'pt',           // page title
      'bc',           // breadcrumb
      'toast-wrap',   // toast notifications
      'am',           // area modal
      'am-name',      // area modal name input
      'am-save',      // area modal save button
      'gm',           // goal modal
      'gm-title',     // goal modal title
      'gm-save',      // goal modal save button
      'import-file',  // hidden file input for import
      'sb',           // sidebar
    ];

    const htmlIds = new Set();
    const idRegex = /\bid=["']([^"']+)["']/g;
    let match;
    while ((match = idRegex.exec(htmlWithoutScript)) !== null) {
      htmlIds.add(match[1]);
    }

    const missing = criticalIds.filter(id => !htmlIds.has(id));
    if (missing.length > 0) {
      assert.fail(
        `Critical UI elements missing from HTML:\n` +
        missing.map(id => `  - id="${id}"`).join('\n')
      );
    }
  });
});
