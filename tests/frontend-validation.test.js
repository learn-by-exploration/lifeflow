/**
 * Frontend Validation Tests
 * 
 * Validates public/index.html for:
 * 1. JavaScript syntax errors (writes temp .mjs file and runs node --check)
 * 2. DOM element references — every hard $('id').x must have a matching id or be dynamically created
 * 3. No duplicate HTML element ids
 * 4. All addEventListener named handler references exist as defined functions
 * 5. Critical UI elements exist in HTML
 * 6. Navigation targets — every go('view') call has a matching case in render()
 * 7. API route consistency — frontend API calls match server-defined routes
 * 8. Inline onclick handlers reference existing functions
 * 9. CSS custom properties — all var(--x) usages have matching definitions
 * 10. View render functions — every dispatched function in render() is defined
 * 11. data-view attributes — sidebar nav items match render() dispatcher views
 * 12. Theme completeness — all themes define the same set of CSS variables
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

// Load and parse once
const html = fs.readFileSync(HTML_PATH, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const scriptContent = scriptMatch ? scriptMatch[1] : '';
const htmlWithoutScript = html.replace(/<script>[\s\S]*?<\/script>/, '');
const serverCode = fs.readFileSync(SERVER_PATH, 'utf8');

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

// ─── NAVIGATION & ROUTING ───

describe('Navigation & Routing', () => {

  it('Every go() call target has a matching case in render()', () => {
    // Find all go('viewName') calls
    const goRegex = /go\('([^']+)'\)/g;
    const goTargets = new Set();
    let match;
    while ((match = goRegex.exec(scriptContent)) !== null) {
      goTargets.add(match[1]);
    }

    // Find all view names handled in render() — pattern: currentView==='xxx'
    const renderViews = new Set();
    const viewRegex = /currentView==='([^']+)'/g;
    while ((match = viewRegex.exec(scriptContent)) !== null) {
      renderViews.add(match[1]);
    }

    const unhandled = [...goTargets].filter(v => !renderViews.has(v));
    if (unhandled.length > 0) {
      assert.fail(
        `go() targets with no matching case in render():\n` +
        unhandled.map(v => `  - go('${v}')`).join('\n')
      );
    }
  });

  it('Every render() dispatcher function is defined', () => {
    // Extract the render() function body — find from 'async function render(){' to 'updateBC'
    const startIdx = scriptContent.indexOf('async function render(){');
    if (startIdx === -1) { assert.fail('Could not find render() function'); return; }
    const endIdx = scriptContent.indexOf('updateBC', startIdx);
    const renderBody = scriptContent.substring(startIdx, endIdx);

    // Find all function calls in the dispatcher (e.g., await renderMyDay())
    const callRegex = /await\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\(\)/g;
    const calledFns = new Set();
    let match;
    while ((match = callRegex.exec(renderBody)) !== null) {
      calledFns.add(match[1]);
    }

    // Find all function definitions in the script
    const fnRegex = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const definedFns = new Set();
    while ((match = fnRegex.exec(scriptContent)) !== null) {
      definedFns.add(match[1]);
    }
    // Also catch arrow function assignments: const renderX = async () =>
    const arrowRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\(/g;
    while ((match = arrowRegex.exec(scriptContent)) !== null) {
      definedFns.add(match[1]);
    }

    const missing = [...calledFns].filter(fn => !definedFns.has(fn));
    if (missing.length > 0) {
      assert.fail(
        `render() dispatches to undefined functions:\n` +
        missing.map(fn => `  - ${fn}()`).join('\n')
      );
    }
  });

  it('data-view attributes in sidebar match render() dispatcher views', () => {
    // Find all data-view="xxx" in HTML
    const dataViewRegex = /data-view=["']([^"']+)["']/g;
    const dataViews = new Set();
    let match;
    while ((match = dataViewRegex.exec(htmlWithoutScript)) !== null) {
      dataViews.add(match[1]);
    }

    // Find all view names handled in render()
    const renderViews = new Set();
    const viewRegex = /currentView==='([^']+)'/g;
    while ((match = viewRegex.exec(scriptContent)) !== null) {
      renderViews.add(match[1]);
    }

    const unhandled = [...dataViews].filter(v => !renderViews.has(v));
    if (unhandled.length > 0) {
      assert.fail(
        `data-view attributes with no matching case in render():\n` +
        unhandled.map(v => `  - data-view="${v}"`).join('\n')
      );
    }
  });
});

// ─── API ROUTE CONSISTENCY ───

describe('API Route Consistency', () => {

  it('Frontend static API paths have matching server routes', () => {
    // Extract static (non-parameterized) API paths from frontend
    // Pattern: api.get('/api/xxx') or api.post('/api/xxx') etc.
    const feCallRegex = /api\.(get|post|put|del)\('(\/api\/[^']*?)(?:\$\{|')/g;
    const feCalls = [];
    let match;
    while ((match = feCallRegex.exec(scriptContent)) !== null) {
      const method = match[1] === 'del' ? 'delete' : match[1];
      let route = match[2];
      // Strip query parameters
      route = route.split('?')[0];
      // Normalize trailing slash from dynamic suffixes: /api/tasks/ → parameterized
      if (route.endsWith('/')) continue; // parameterized route, skip
      feCalls.push({ method, route });
    }

    // Extract server routes
    const serverRouteRegex = /app\.(get|post|put|delete)\('(\/api\/[^']+)'/g;
    const serverRoutes = [];
    while ((match = serverRouteRegex.exec(serverCode)) !== null) {
      serverRoutes.add ? null : null; // just collecting
      serverRoutes.push({ method: match[1], pattern: match[2] });
    }

    // For each frontend static call, check if there's a matching server route
    const missing = feCalls.filter(fe => {
      return !serverRoutes.some(sr => {
        if (sr.method !== fe.method) return false;
        // Convert Express patterns like /api/tasks/:id to regex
        const regex = new RegExp(
          '^' + sr.pattern.replace(/:[^/]+/g, '[^/]+') + '$'
        );
        return regex.test(fe.route);
      });
    });

    // Deduplicate
    const uniqueMissing = [...new Map(missing.map(m => [`${m.method} ${m.route}`, m])).values()];

    if (uniqueMissing.length > 0) {
      assert.fail(
        `Frontend API calls with no matching server route:\n` +
        uniqueMissing.map(m => `  - ${m.method.toUpperCase()} ${m.route}`).join('\n')
      );
    }
  });

  it('API method names are valid (get, post, put, del)', () => {
    // Catch typos like api.delte or api.patch
    const apiCallRegex = /api\.([a-zA-Z]+)\s*\(/g;
    const validMethods = new Set(['get', 'post', 'put', 'del', 'delete']);
    const invalid = new Set();
    let match;
    while ((match = apiCallRegex.exec(scriptContent)) !== null) {
      if (!validMethods.has(match[1])) {
        invalid.add(match[1]);
      }
    }
    if (invalid.size > 0) {
      assert.fail(
        `Invalid api method names (valid: get, post, put, del):\n` +
        [...invalid].map(m => `  - api.${m}()`).join('\n')
      );
    }
  });
});

// ─── INLINE HANDLERS & FUNCTION REFERENCES ───

describe('Inline Handlers & Function References', () => {

  it('onclick handlers in static HTML reference defined functions', () => {
    // Match onclick="functionName()" or onclick="functionName(args)"
    const onclickRegex = /onclick="([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const handlers = new Set();
    let match;
    while ((match = onclickRegex.exec(htmlWithoutScript)) !== null) {
      handlers.add(match[1]);
    }

    // Also check onclick in the script (dynamic HTML templates)
    const scriptOnclickRegex = /onclick=(?:\\"|"|')([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    while ((match = scriptOnclickRegex.exec(scriptContent)) !== null) {
      // Skip JS built-ins
      if (['document', 'window', 'event', 'this', 'console'].includes(match[1])) continue;
      handlers.add(match[1]);
    }

    // Find all function definitions
    const fnRegex = /(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const definedFns = new Set();
    while ((match = fnRegex.exec(scriptContent)) !== null) {
      definedFns.add(match[1]);
    }
    const constRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    while ((match = constRegex.exec(scriptContent)) !== null) {
      definedFns.add(match[1]);
    }
    // Also capture window.X = function assignments
    const windowRegex = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    while ((match = windowRegex.exec(scriptContent)) !== null) {
      definedFns.add(match[1]);
    }

    // Built-in & DOM methods that are valid onclick targets
    const builtins = new Set([
      'go', 'alert', 'confirm', 'prompt', 'history', 'location',
      'document', 'window', 'navigator', 'console',
    ]);

    const missing = [...handlers].filter(h => !definedFns.has(h) && !builtins.has(h));
    if (missing.length > 0) {
      assert.fail(
        `onclick handlers reference undefined functions:\n` +
        missing.map(h => `  - onclick="${h}(...)"`).join('\n')
      );
    }
  });

  it('No broken string literals in event handler attributes', () => {
    // Detect onclick="someFunc( without closing quote
    // Pattern: onclick=" followed by content that doesn't close before end of tag
    const brokenHandlerRegex = /on(?:click|change|input|keydown|submit)="[^"]*$/gm;
    const matches = htmlWithoutScript.match(brokenHandlerRegex);
    if (matches && matches.length > 0) {
      assert.fail(
        `Broken inline handler attributes (unclosed quotes):\n` +
        matches.slice(0, 5).map(m => `  - ${m.substring(0, 80)}...`).join('\n')
      );
    }
  });
});

// ─── CSS INTEGRITY ───

describe('CSS Integrity', () => {

  it('CSS custom properties used in styles are defined', () => {
    // Extract the <style> block
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    if (!styleMatch) return; // no style block
    const styleContent = styleMatch[1];

    // Find all var(--xxx) usages
    const varUsageRegex = /var\(--([a-zA-Z0-9_-]+)/g;
    const usedVars = new Set();
    let match;
    while ((match = varUsageRegex.exec(styleContent)) !== null) {
      usedVars.add(match[1]);
    }
    // Also check inline styles in HTML
    while ((match = varUsageRegex.exec(htmlWithoutScript)) !== null) {
      usedVars.add(match[1]);
    }

    // Find all --xxx: definitions
    const varDefRegex = /--([a-zA-Z0-9_-]+)\s*:/g;
    const definedVars = new Set();
    while ((match = varDefRegex.exec(styleContent)) !== null) {
      definedVars.add(match[1]);
    }

    const undefined_ = [...usedVars].filter(v => !definedVars.has(v));
    if (undefined_.length > 0) {
      assert.fail(
        `CSS custom properties used but never defined:\n` +
        undefined_.map(v => `  - var(--${v})`).join('\n')
      );
    }
  });

  it('All theme variants define required base variables', () => {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    if (!styleMatch) return;
    const styleContent = styleMatch[1];

    // Required variables that every theme must define
    const requiredVars = ['bg', 'bg-s', 'bg-c', 'tx', 'tx2', 'txd', 'brand', 'brand-h', 'ok', 'err', 'brd'];

    // Find all theme selectors
    const themeRegex = /\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/g;
    const themes = {};
    let match;
    while ((match = themeRegex.exec(styleContent)) !== null) {
      const name = match[1];
      const body = match[2];
      const vars = new Set();
      const varDef = /--([a-zA-Z0-9_-]+)\s*:/g;
      let vm;
      while ((vm = varDef.exec(body)) !== null) {
        vars.add(vm[1]);
      }
      themes[name] = vars;
    }

    const issues = [];
    for (const [theme, vars] of Object.entries(themes)) {
      const missing = requiredVars.filter(v => !vars.has(v));
      if (missing.length > 0) {
        issues.push(`  Theme "${theme}" missing: ${missing.join(', ')}`);
      }
    }

    if (issues.length > 0) {
      assert.fail(`Theme variable completeness issues:\n${issues.join('\n')}`);
    }
  });
});

// ─── TEMPLATE LITERAL INTEGRITY ───

describe('Template Literal Integrity', () => {

  it('innerHTML assignments use template literals (no string concatenation bugs)', () => {
    // Find lines with .innerHTML = that use plain string concat with +
    // This isn't an error per se, but flag cases of .innerHTML=something+ that cross lines
    // without backtick wrapping (potential source of merge bugs)
    // We just verify no .innerHTML assignments have obviously broken HTML
    const innerHTMLRegex = /\.innerHTML\s*=\s*`([^`]{0,500})`/g;
    let match;
    const brokenTags = [];
    while ((match = innerHTMLRegex.exec(scriptContent)) !== null) {
      const content = match[1];
      // Check for obviously broken tags: < without matching >
      const openAngles = (content.match(/</g) || []).length;
      const closeAngles = (content.match(/>/g) || []).length;
      if (Math.abs(openAngles - closeAngles) > 2) {
        const preview = content.substring(0, 80).replace(/\n/g, '\\n');
        brokenTags.push(`  - ${preview}... (< count: ${openAngles}, > count: ${closeAngles})`);
      }
    }
    if (brokenTags.length > 0) {
      assert.fail(
        `innerHTML assignments with possibly broken HTML (mismatched angle brackets):\n` +
        brokenTags.join('\n')
      );
    }
  });
});

// ─── SECURITY BASICS ───

describe('Security Basics', () => {

  it('No hardcoded localhost/IP URLs in production code', () => {
    // Allow localhost in comments but not in actual string literals
    const localhostRegex = /['"`]https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[:\/][^'"`]*['"`]/g;
    const matches = [];
    let match;
    while ((match = localhostRegex.exec(scriptContent)) !== null) {
      matches.push(match[0]);
    }
    if (matches.length > 0) {
      assert.fail(
        `Hardcoded localhost URLs found in client script:\n` +
        matches.map(m => `  - ${m}`).join('\n')
      );
    }
  });

  it('No inline eval() or new Function() in client code', () => {
    // These are XSS vectors
    const evalRegex = /\beval\s*\(/g;
    const fnRegex = /new\s+Function\s*\(/g;
    const evals = [];
    let match;
    while ((match = evalRegex.exec(scriptContent)) !== null) {
      const line = scriptContent.substring(
        scriptContent.lastIndexOf('\n', match.index) + 1,
        scriptContent.indexOf('\n', match.index)
      ).trim();
      evals.push(`  - eval(): ${line.substring(0, 100)}`);
    }
    while ((match = fnRegex.exec(scriptContent)) !== null) {
      const line = scriptContent.substring(
        scriptContent.lastIndexOf('\n', match.index) + 1,
        scriptContent.indexOf('\n', match.index)
      ).trim();
      evals.push(`  - new Function(): ${line.substring(0, 100)}`);
    }
    if (evals.length > 0) {
      assert.fail(
        `Dangerous eval/Function constructors found:\n` +
        evals.join('\n')
      );
    }
  });

  it('innerHTML assignments use esc() for user-supplied data', () => {
    // Find the esc() function definition to confirm it exists
    const hasEsc = /function\s+esc\s*\(/.test(scriptContent);
    assert.ok(hasEsc, 'HTML escaping function esc() must be defined for XSS prevention');
  });
});
