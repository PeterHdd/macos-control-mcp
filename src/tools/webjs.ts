import { runAppleScript, escapeForAppleScript } from "../utils/applescript.js";

type Browser = "Safari" | "Google Chrome";

function detectBrowser(browser?: string): Browser {
  if (browser?.toLowerCase().includes("chrome")) return "Google Chrome";
  return "Safari";
}

/** Escape a value for safe embedding inside a JS single-quoted string. */
function escapeForJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function buildJsScript(browser: Browser, code: string): string {
  let jsCode = code;
  if (browser === "Google Chrome") {
    // Chrome's AppleScript bridge evals at top-level where `return` is invalid
    // and silently returns "missing value" on errors.
    // Wrap in IIFE + try/catch when code uses return AND isn't already an IIFE.
    const hasReturn = /\breturn\b/.test(code);
    const isIIFE = code.trimStart().startsWith("(function");
    if (hasReturn && !isIIFE) {
      jsCode = `(function(){try{${code}}catch(e){return 'JS Error: '+e.message}})()`;
    }
  }
  const safeCode = escapeForAppleScript(jsCode);
  if (browser === "Google Chrome") {
    return `tell application "Google Chrome" to execute active tab of front window javascript "${safeCode}"`;
  }
  return `tell application "Safari" to do JavaScript "${safeCode}" in front document`;
}

// ── Shared JS helpers (embedded in tool code) ────────────────────

const IS_VISIBLE_JS = `function isVisible(el) {
  var r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}`;

const FIND_LABEL_JS = `function findLabel(el) {
  var label = '';
  if (el.id) {
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].htmlFor === el.id) { label = labels[i].textContent.trim(); break; }
    }
  }
  if (!label) label = el.getAttribute('aria-label') || '';
  if (!label) label = el.placeholder || '';
  if (!label) { var p = el.closest('label'); if (p) label = p.textContent.trim(); }
  if (!label && el.getAttribute('aria-labelledby')) {
    var ref = document.getElementById(el.getAttribute('aria-labelledby'));
    if (ref) label = ref.textContent.trim();
  }
  if (!label) {
    var container = el.closest('.fb-dash-form-element, .form-group, [class*=formElement], [class*=field]');
    if (container) {
      var spans = container.querySelectorAll('label, span, legend');
      for (var j = 0; j < spans.length; j++) {
        var t = spans[j].textContent.trim();
        if (t && t.length < 100 && !spans[j].contains(el)) { label = t; break; }
      }
    }
  }
  return label.replace(/\\s+/g, ' ');
}`;

// ── Low-level tools (kept) ───────────────────────────────────────

export async function executeJavaScript(
  code: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const result = await runAppleScript(buildJsScript(b, code));
  return result || "(no return value)";
}

export async function getPageText(browser?: string): Promise<string> {
  const b = detectBrowser(browser);
  const code = "document.body.innerText";
  const result = await runAppleScript(buildJsScript(b, code));
  if (result.length > 50_000) {
    return result.substring(0, 50_000) + "\n\n[Truncated — showing first 50KB]";
  }
  return result;
}

// ── High-level tools (new) ───────────────────────────────────────

export async function getPageElements(browser?: string): Promise<string> {
  const b = detectBrowser(browser);
  const code = `(function() {
    try {
      ${IS_VISIBLE_JS}
      ${FIND_LABEL_JS}

      var result = '';

      // Buttons
      var btns = [];
      document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]').forEach(function(el) {
        if (!isVisible(el) || btns.length >= 30) return;
        var text = (el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').substring(0, 80);
        var ariaLabel = el.getAttribute('aria-label') || '';
        if (!text && !ariaLabel) return;
        var desc = text || ariaLabel;
        if (el.disabled) desc += ' [disabled]';
        btns.push(desc);
      });
      if (btns.length > 0) {
        result += 'BUTTONS (' + btns.length + '):\\n';
        btns.forEach(function(b) { result += '  - ' + b + '\\n'; });
        result += '\\n';
      }

      // Text inputs and textareas
      var fields = [];
      document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=radio]):not([type=checkbox]), textarea').forEach(function(el) {
        if (!isVisible(el) || fields.length >= 30) return;
        var label = findLabel(el);
        var desc = '[' + (el.type || 'text') + '] ';
        if (label) desc += 'label="' + label.substring(0, 60) + '"';
        if (el.value) desc += ' value="' + el.value.substring(0, 40) + '"';
        if (el.placeholder && !label) desc += ' placeholder="' + el.placeholder.substring(0, 40) + '"';
        if (el.required || el.getAttribute('aria-required') === 'true') desc += ' [required]';
        fields.push(desc);
      });
      if (fields.length > 0) {
        result += 'INPUTS (' + fields.length + '):\\n';
        fields.forEach(function(f) { result += '  - ' + f + '\\n'; });
        result += '\\n';
      }

      // Selects
      var sels = [];
      document.querySelectorAll('select').forEach(function(el) {
        if (!isVisible(el) || sels.length >= 20) return;
        var label = findLabel(el);
        var selected = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text.trim() : '';
        var opts = Array.from(el.options).map(function(o) { return o.text.trim(); }).filter(Boolean).slice(0, 15);
        var desc = 'label="' + (label || 'unknown').substring(0, 60) + '"';
        if (selected) desc += ' selected="' + selected + '"';
        desc += ' options=[' + opts.join(', ') + ']';
        sels.push(desc);
      });
      if (sels.length > 0) {
        result += 'SELECTS (' + sels.length + '):\\n';
        sels.forEach(function(s) { result += '  - ' + s + '\\n'; });
        result += '\\n';
      }

      // Radio buttons grouped by name
      var radioGroups = {};
      document.querySelectorAll('input[type=radio]').forEach(function(el) {
        if (!isVisible(el)) return;
        var name = el.name || 'unnamed';
        if (!radioGroups[name]) radioGroups[name] = {label: '', options: []};
        var lbl = findLabel(el);
        radioGroups[name].options.push({text: lbl, checked: el.checked});
        if (!radioGroups[name].label) {
          var fieldset = el.closest('fieldset');
          if (fieldset) { var legend = fieldset.querySelector('legend'); if (legend) radioGroups[name].label = legend.textContent.trim(); }
          if (!radioGroups[name].label) {
            var container = el.closest('[class*=form], [class*=field], [class*=group]');
            if (container) { var heading = container.querySelector('span, label, legend, h3, h4'); if (heading && !heading.contains(el)) radioGroups[name].label = heading.textContent.trim(); }
          }
        }
      });
      var radioNames = Object.keys(radioGroups);
      if (radioNames.length > 0) {
        result += 'RADIO GROUPS (' + radioNames.length + '):\\n';
        radioNames.slice(0, 20).forEach(function(name) {
          var g = radioGroups[name];
          result += '  - "' + (g.label || name).substring(0, 60) + '":\\n';
          g.options.forEach(function(o) { result += '    ' + (o.checked ? '(x) ' : '( ) ') + '"' + o.text.substring(0, 40) + '"\\n'; });
        });
        result += '\\n';
      }

      // Checkboxes
      var checks = [];
      document.querySelectorAll('input[type=checkbox]').forEach(function(el) {
        if (!isVisible(el) || checks.length >= 20) return;
        var label = findLabel(el);
        if (!label) return;
        checks.push((el.checked ? '[x] ' : '[ ] ') + '"' + label.substring(0, 60) + '"');
      });
      if (checks.length > 0) {
        result += 'CHECKBOXES (' + checks.length + '):\\n';
        checks.forEach(function(c) { result += '  - ' + c + '\\n'; });
        result += '\\n';
      }

      // Links (limited)
      var links = [];
      document.querySelectorAll('a[href]').forEach(function(el) {
        if (!isVisible(el) || links.length >= 20) return;
        var text = el.textContent.trim().replace(/\\s+/g, ' ').substring(0, 80);
        if (!text || text.length < 2) return;
        links.push(text);
      });
      if (links.length > 0) {
        result += 'LINKS (' + links.length + '):\\n';
        links.forEach(function(l) { result += '  - ' + l + '\\n'; });
      }

      return result || 'No interactive elements found on page.';
    } catch(e) { return 'JS Error: ' + e.message; }
  })()`;

  return runAppleScript(buildJsScript(b, code));
}

export async function clickByText(
  text: string,
  elementType?: string,
  index?: number,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const safeText = escapeForJs(text);
  const type = elementType || "any";
  const idx = index ?? 0;

  const code = `(function() {
    try {
      ${IS_VISIBLE_JS}

      var target = '${safeText}'.toLowerCase();
      var type = '${type}';
      var candidates = [];

      function matchText(el) {
        var t = (el.textContent || el.value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
        var a = (el.getAttribute('aria-label') || '').toLowerCase();
        return t.includes(target) || a.includes(target);
      }

      function getLabel(el) {
        var lbl = '';
        if (el.id) { var labelEl = document.querySelector('label[for="' + el.id + '"]'); if (labelEl) lbl = labelEl.textContent.trim(); }
        if (!lbl) { var p = el.closest('label'); if (p) lbl = p.textContent.trim(); }
        if (!lbl) lbl = el.getAttribute('aria-label') || '';
        return lbl;
      }

      if (type === 'button' || type === 'any') {
        document.querySelectorAll('button, [role=button], input[type=submit], input[type=button]').forEach(function(el) {
          if (matchText(el) && isVisible(el)) candidates.push({el: el, kind: 'button', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').substring(0, 60)});
        });
      }
      if (type === 'link' || type === 'any') {
        document.querySelectorAll('a[href], [role=link]').forEach(function(el) {
          if (matchText(el) && isVisible(el)) candidates.push({el: el, kind: 'link', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').substring(0, 60)});
        });
      }
      if (type === 'tab' || type === 'any') {
        document.querySelectorAll('[role=tab]').forEach(function(el) {
          if (matchText(el) && isVisible(el)) candidates.push({el: el, kind: 'tab', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').substring(0, 60)});
        });
      }
      if (type === 'radio' || type === 'any') {
        document.querySelectorAll('input[type=radio]').forEach(function(el) {
          if (!isVisible(el)) return;
          var lbl = getLabel(el);
          if (lbl.toLowerCase().includes(target)) candidates.push({el: el, kind: 'radio', text: lbl.substring(0, 60)});
        });
      }
      if (type === 'checkbox' || type === 'any') {
        document.querySelectorAll('input[type=checkbox]').forEach(function(el) {
          if (!isVisible(el)) return;
          var lbl = getLabel(el);
          if (lbl.toLowerCase().includes(target)) candidates.push({el: el, kind: 'checkbox', text: lbl.substring(0, 60)});
        });
      }

      if (candidates.length === 0) return 'Not found: "' + '${safeText}' + '"' + (type !== 'any' ? ' (type: ' + type + ')' : '');

      var i = Math.min(${idx}, candidates.length - 1);
      var chosen = candidates[i];
      chosen.el.scrollIntoView({block: 'center'});
      chosen.el.click();
      return 'Clicked ' + chosen.kind + ': "' + chosen.text + '"' +
        (candidates.length > 1 ? ' (' + candidates.length + ' matches, used #' + (i + 1) + ')' : '');
    } catch(e) { return 'JS Error: ' + e.message; }
  })()`;

  return runAppleScript(buildJsScript(b, code));
}

export async function fillByLabel(
  label: string,
  value: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const safeLabel = escapeForJs(label);
  const safeValue = escapeForJs(value);

  const code = `(function() {
    try {
      ${IS_VISIBLE_JS}
      ${FIND_LABEL_JS}

      var targetLabel = '${safeLabel}'.toLowerCase();

      var inputs = document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=radio]):not([type=checkbox]), textarea');
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (!isVisible(el)) continue;
        var label = findLabel(el);
        if (!label.toLowerCase().includes(targetLabel)) continue;

        el.focus();
        el.scrollIntoView({block: 'center'});

        // Use native value setter for React/Vue/Angular compatibility
        var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (nativeSetter && nativeSetter.set) {
          nativeSetter.set.call(el, '${safeValue}');
        } else {
          el.value = '${safeValue}';
        }
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        el.dispatchEvent(new Event('blur', {bubbles: true}));
        return 'Filled "' + label.substring(0, 40) + '" with "' + '${safeValue}'.substring(0, 40) + '"';
      }

      // List available fields for debugging
      var available = [];
      inputs.forEach(function(el) {
        if (!isVisible(el)) return;
        var l = findLabel(el);
        if (l) available.push(l.substring(0, 50));
      });
      return 'Field not found: "' + '${safeLabel}' + '". Available: ' + available.join(', ');
    } catch(e) { return 'JS Error: ' + e.message; }
  })()`;

  return runAppleScript(buildJsScript(b, code));
}

export async function selectOption(
  label: string,
  option: string,
  browser?: string,
): Promise<string> {
  const b = detectBrowser(browser);
  const safeLabel = escapeForJs(label);
  const safeOption = escapeForJs(option);

  const code = `(function() {
    try {
      ${IS_VISIBLE_JS}
      ${FIND_LABEL_JS}

      var targetLabel = '${safeLabel}'.toLowerCase();
      var targetOption = '${safeOption}'.toLowerCase();

      var selects = document.querySelectorAll('select');
      for (var i = 0; i < selects.length; i++) {
        var el = selects[i];
        if (!isVisible(el)) continue;
        var label = findLabel(el);
        if (!label.toLowerCase().includes(targetLabel)) continue;

        el.scrollIntoView({block: 'center'});

        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].text.trim().toLowerCase().includes(targetOption)) {
            el.value = el.options[j].value;
            el.dispatchEvent(new Event('change', {bubbles: true}));
            return 'Selected "' + el.options[j].text.trim() + '" for "' + label.substring(0, 40) + '"';
          }
        }

        var opts = Array.from(el.options).map(function(o) { return o.text.trim(); }).filter(Boolean);
        return 'Option "' + '${safeOption}' + '" not found in "' + label + '". Available: ' + opts.join(', ');
      }

      return 'Select not found: "' + '${safeLabel}' + '"';
    } catch(e) { return 'JS Error: ' + e.message; }
  })()`;

  return runAppleScript(buildJsScript(b, code));
}
