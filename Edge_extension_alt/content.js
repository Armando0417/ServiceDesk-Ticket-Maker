// L1 Ticket Autofill Alt - automatic queue with focus-based fallback.

var AF_APP_VERSION = (function() {
    try {
        var manifest = chrome.runtime.getManifest();
        var releaseVersion = manifest.version_name || manifest.version || '';
        var shortVersion = String(releaseVersion).match(/^v?(\d+\.\d+)/i);
        return shortVersion ? shortVersion[1] : releaseVersion;
    } catch (e) {
        return '';
    }
})();

// ====================================================================
// STATE (global, accessible from console)
// ====================================================================
var AF_data = null;
var AF_filled = {};
var AF_pending = {};
var AF_active = false;
var AF_loadId = 0;
var AF_autoEnabled = true;
var AF_autoRunning = false;
var AF_autoRerun = false;
var AF_autoTimer = null;
var AF_autoPass = 0;
var AF_autoAttempts = {};
var AF_AUTO_MAX_PASSES = 10;
var AF_AUTO_SELECT_ORDER = [
    //'requester',
    'category',
    'subcategory',
    'item',
    'technician',
    'group',
    'site',
    'mode',
    'request_type',
    'impact',
    'urgency',
    'udf_fields_udf_pick_2404',
    'status',
    'closure_info_closure_code'
];

// ====================================================================
// FIELD MAP
// ====================================================================
var AF_MAP = {
    requester: { val: function(d){ return d._email || d.name || ''; }, type:'s2', label:'Requester' },
    category: { val: function(d){ return d._category || ''; }, type:'s2', label:'Category' },
    subcategory: { val: function(d){ return d._subcategory || ''; }, type:'s2', label:'Subcategory' },
    item: { val: function(d){ return d._item || ''; }, type:'s2', label:'Item' },
    status: { val: function(d){ return d._status || ''; }, type:'s2', label:'Status' },
    technician: { val: function(d){ return d._technician || ''; }, type:'s2', label:'Technician' },
    group: { val: function(d){ return d._group || ''; }, type:'s2', label:'Group' },
    site: { val: function(d){ return d._site || d.location || ''; }, type:'s2', label:'Site' },
    mode: { val: function(d){ return d._mode || ''; }, type:'s2', label:'Mode' },
    request_type: { val: function(d){ return d._requestType || ''; }, type:'s2', label:'Request Type' },
    impact: { val: function(d){ return d._impact || ''; }, type:'s2', label:'Impact' },
    urgency: { val: function(d){ return d._urgency || ''; }, type:'s2', label:'Urgency' },
    udf_fields_udf_pick_2404: { val: function(d){ return d._locationArea || ''; }, type:'s2', label:'Location Area' },
    closure_info_closure_code: { val: function(d){ return d._closureCode || ''; }, type:'s2', label:'Closure Code' },
    subject: { val: function(d){ return d.subject || d.situation || d.topic || ''; }, type:'text', label:'Subject' },
    udf_fields_udf_sline_1801: { val: function(d){ return d._externalTicket || ''; }, type:'text', label:'External Ticket' },
    description: { val: function(d){ return d.full_block || ''; }, type:'rich', label:'Description' },
    resolution_content: { val: function(d){ return d.process || ''; }, type:'rich', label:'Resolution' },
    closure_info_closure_comments: { val: function(d){ return d.process || ''; }, type:'ta', label:'Closure Comments' },
    closure_info_requester_ack_comments: { val: function(d){ return d._ackComments || d.process || ''; }, type:'ta', label:'Ack Comments' }
};

// ====================================================================
// IDENTIFY FOCUSED FIELD
// ====================================================================
function AF_identify(el) {
    if (!el) return null;
    var id = (el.id || '').toLowerCase();
    var name = (el.name || '').toLowerCase();

    // Direct: for_<fieldname>
    if (id.indexOf('for_') === 0) {
        var k = id.substring(4).replace(/\./g, '_');
        if (AF_MAP[k]) return k;
    }

    // By name
    if (name) {
        var nk = name.replace(/\./g, '_');
        if (AF_MAP[nk]) return nk;
        nk = nk.replace(/^for_/, '');
        if (AF_MAP[nk]) return nk;
    }

    // Select2 container ancestor (for focusser inputs inside the container)
    var s2 = el.closest('[id^="s2id_for_"]');
    if (s2) {
        var sk = s2.id.toLowerCase().replace('s2id_for_', '').replace(/\./g, '_');
        if (AF_MAP[sk]) return sk;
    }

    // data-atm ancestor
    var atm = el.closest('[data-atm]');
    if (atm) {
        var ak = (atm.getAttribute('data-atm') || '').replace(/\./g, '_');
        if (AF_MAP[ak]) return ak;
    }

    // *** KEY FIX: element is inside the global #select2-drop ***
    // When a dropdown is open, the search input lives in #select2-drop
    // at body level     NOT inside the field container. Trace back by
    // finding which container on the page has select2-dropdown-open.
    var drop = el.closest('#select2-drop');
    if (!drop) {
        // Also check if el IS inside any element with select2-drop class
        drop = el.closest('.select2-drop');
    }
    if (drop) {
        var activeContainer = document.querySelector('.select2-dropdown-open[id^="s2id_for_"]');
        if (!activeContainer) {
            // Try via data-atm on the active container's parent
            var activeAny = document.querySelector('.select2-dropdown-open');
            if (activeAny) {
                var atmParent = activeAny.closest('[data-atm]');
                if (atmParent) {
                    var atmKey = (atmParent.getAttribute('data-atm') || '').replace(/\./g, '_');
                    if (AF_MAP[atmKey]) return atmKey;
                }
            }
        }
        if (activeContainer) {
            var cid = activeContainer.id.toLowerCase().replace('s2id_for_', '').replace(/\./g, '_');
            if (AF_MAP[cid]) return cid;

            // Also try data-atm on the container's parent
            var atmHolder = activeContainer.closest('[data-atm]');
            if (atmHolder) {
                var ahmKey = (atmHolder.getAttribute('data-atm') || '').replace(/\./g, '_');
                if (AF_MAP[ahmKey]) return ahmKey;
            }
        }
    }

    // Richtext iframe
    if (el.tagName === 'IFRAME' && el.classList.contains('ze_area')) {
        var ed = el.closest('.sdp-zeditor-ovwrt');
        if (ed) {
            var eid = (ed.id || '').toLowerCase();
            if (eid.indexOf('description') !== -1) return 'description';
            if (eid.indexOf('resolution') !== -1) return 'resolution_content';
        }
    }

    return null;
}

// ====================================================================
// FILL FUNCTIONS
// ====================================================================
function AF_fillText(el, value, shouldFocus) {
    if (shouldFocus !== false) el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function AF_typeSearch(input, value) {
    if (!input) return false;
    input.focus();
    input.value = '';
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 0 }));
    return true;
}

function AF_isVisible(el) {
    if (!el || !el.getClientRects().length) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function AF_findS2Search(expectedKey) {
    var drop = document.getElementById('select2-drop');
    if (!AF_isVisible(drop)) return null;

    var input = drop.querySelector('.select2-input');
    if (!input || !AF_isVisible(input)) return null;

    // Select2 uses one global dropdown. Confirm it still belongs to the
    // field that initiated this fill before typing into it.
    if (AF_identify(input) !== expectedKey) return null;
    return input;
}

function AF_fillS2(el, value, key, loadId, done) {
    var finished = false;
    function finish(success) {
        if (finished) return;
        finished = true;
        done(success);
    }

    // If this IS a search input already (user clicked into open dropdown)
    if (el.classList.contains('select2-input')) {
        finish(AF_typeSearch(el, value));
        return;
    }

    if (!el.classList.contains('select2-focusser') && !el.closest('[id^="s2id_for_"]')) {
        finish(false);
        return;
    }

    // ManageEngine renders Select2 controls asynchronously. Retry for a
    // short bounded window instead of relying on one exact 400 ms moment.
    var attempts = 0;
    var maxAttempts = 30;
    function trySearch() {
        // Loading another ticket cancels retries belonging to the old one.
        if (loadId !== AF_loadId) {
            finish(false);
            return;
        }

        var input = AF_findS2Search(key);
        if (input) {
            AF_typeSearch(input, value);
            console.log('[AF] Typed "' + value + '" into dropdown search');
            finish(true);
            return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
            console.log('[AF] Select2 search did not become ready for:', key);
            finish(false);
            return;
        }
        setTimeout(trySearch, 75);
    }
    setTimeout(trySearch, 50);
}

// Convert Markdown authored in the Ticket Generator into a conservative,
// HTML-safe subset understood by ServiceDesk's rich-text editor.
function AF_escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function AF_renderMarkdownInline(source) {
    var codeFragments = [];
    var text = AF_escapeHtml(source);

    text = text.replace(/`([^`\n]+)`/g, function(_, code) {
        var token = '@@AF_MD_CODE_' + codeFragments.length + '@@';
        codeFragments.push('<code>' + code + '</code>');
        return token;
    });

    // Only safe explicit schemes become links. Raw HTML and unsafe URLs stay
    // escaped as visible text.
    text = text.replace(
        /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/gi,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    text = text
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
        .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');

    codeFragments.forEach(function(fragment, index) {
        text = text.replace('@@AF_MD_CODE_' + index + '@@', fragment);
    });
    return text;
}

function AF_markdownBlockKind(line) {
    if (/^```/.test(line)) return 'fence';
    if (/^#{1,6}\s+/.test(line)) return 'heading';
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return 'rule';
    if (/^\s*>\s?/.test(line)) return 'quote';
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) return 'list';
    return '';
}

function AF_markdownToHtml(source) {
    var markdown = String(source || '').replace(/\r\n?/g, '\n');
    if (!markdown.trim()) return '';

    var lines = markdown.split('\n');
    var output = [];
    var listType = '';
    function closeList() {
        if (!listType) return;
        output.push('</' + listType + '>');
        listType = '';
    }

    for (var index = 0; index < lines.length; index++) {
        var line = lines[index];
        var fence = line.match(/^```\s*([a-z0-9_-]*)\s*$/i);
        if (fence) {
            closeList();
            var codeLines = [];
            index++;
            while (index < lines.length && !/^```\s*$/.test(lines[index])) {
                codeLines.push(lines[index]);
                index++;
            }
            output.push('<pre><code>' + AF_escapeHtml(codeLines.join('\n')) + '</code></pre>');
            continue;
        }

        if (!line.trim()) {
            closeList();
            continue;
        }

        var heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            closeList();
            var level = heading[1].length;
            output.push('<h' + level + '>' + AF_renderMarkdownInline(heading[2]) + '</h' + level + '>');
            continue;
        }

        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
            closeList();
            output.push('<hr>');
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            closeList();
            var quoteLines = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                quoteLines.push(AF_renderMarkdownInline(lines[index].replace(/^\s*>\s?/, '')));
                index++;
            }
            index--;
           output.push(
                '<blockquote style="margin:0 0 12px 0;padding:2px 14px;' +
                'border-left:4px solid #2e7cf6;background:#eef4ff;color:#0a0f1c;">' +
                '<p style="margin:6px 0;">' + quoteLines.join('<br>') + '</p></blockquote>'
            );
            continue;
        }

        var listItem = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
        if (listItem) {
            var nextListType = /^\d/.test(listItem[1]) ? 'ol' : 'ul';
            if (listType !== nextListType) {
                closeList();
                listType = nextListType;
                output.push('<' + listType + '>');
            }

            var task = listItem[2].match(/^\[([ xX])\]\s+(.*)$/);
            if (task) {
                var checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
                output.push(
                    '<li><input type="checkbox" disabled' + checked + '> ' +
                    AF_renderMarkdownInline(task[2]) + '</li>'
                );
            } else {
                output.push('<li>' + AF_renderMarkdownInline(listItem[2]) + '</li>');
            }
            continue;
        }

        closeList();
        var paragraph = [line.trim()];
        while (
            index + 1 < lines.length &&
            lines[index + 1].trim() &&
            !AF_markdownBlockKind(lines[index + 1])
        ) {
            paragraph.push(lines[++index].trim());
        }
        output.push(
            '<p>' + paragraph.map(AF_renderMarkdownInline).join('<br>') + '</p>'
        );
    }

    closeList();
    return output.join('');
}

function AF_setRichContent(iframe, wrapper, value) {
    if (!iframe || !iframe.contentDocument || !iframe.contentDocument.body) return false;

    var html = AF_markdownToHtml(value);
    var body = iframe.contentDocument.body;
    body.innerHTML = html;
    body.dispatchEvent(new Event('input', { bubbles: true }));
    body.dispatchEvent(new Event('change', { bubbles: true }));

    var ta = wrapper ? wrapper.querySelector('textarea') : null;
    if (ta) {
        ta.value = html;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
}

function AF_fillRich(el, value) {
    var wrapper = el.closest('.sdp-zeditor-ovwrt') || el.closest('.control-holder') || el.parentElement;
    var iframe = wrapper ? wrapper.querySelector('iframe.ze_area') : null;
    return AF_setRichContent(iframe, wrapper, value);
}

function AF_fillTA(el, value, shouldFocus) {
    var ta = el.tagName === 'TEXTAREA' ? el : null;
    if (!ta) {
        var h = el.closest('.control-holder');
        if (h) ta = h.querySelector('textarea');
    }
    if (ta) {
        if (shouldFocus !== false) ta.focus();
        ta.value = value;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
}

// ====================================================================
// AUTOMATIC FIELD DISCOVERY + SEQUENTIAL AUTOFILL (ALT)
// ====================================================================
function AF_dottedKey(key) {
    if (key.indexOf('udf_fields_') === 0) {
        return 'udf_fields.' + key.substring('udf_fields_'.length);
    }
    if (key.indexOf('closure_info_') === 0) {
        return 'closure_info.' + key.substring('closure_info_'.length);
    }
    return key;
}

function AF_findSelect2Container(key) {
    var dotted = AF_dottedKey(key);
    var ids = ['s2id_for_' + dotted, 's2id_for_' + key];
    for (var i = 0; i < ids.length; i++) {
        var byId = document.getElementById(ids[i]);
        if (byId) return byId;
    }

    var holders = document.querySelectorAll('[data-atm]');
    for (var h = 0; h < holders.length; h++) {
        var atm = (holders[h].getAttribute('data-atm') || '').replace(/\./g, '_');
        if (atm !== key) continue;
        return holders[h].querySelector('[id^="s2id_for_"], .select2-container');
    }
    return null;
}

function AF_findAutomaticElement(key, type) {
    if (type === 's2') return AF_findSelect2Container(key);

    if (type === 'rich') {
        var editors = document.querySelectorAll('.sdp-zeditor-ovwrt');
        var needle = key === 'description' ? 'description' : 'resolution';
        for (var r = 0; r < editors.length; r++) {
            if ((editors[r].id || '').toLowerCase().indexOf(needle) === -1) continue;
            var iframe = editors[r].querySelector('iframe.ze_area');
            if (iframe && iframe.contentDocument && iframe.contentDocument.body) return iframe;
        }
        return null;
    }

    var dotted = AF_dottedKey(key);
    var ids = ['for_' + dotted, 'for_' + key, dotted, key];
    for (var i = 0; i < ids.length; i++) {
        var direct = document.getElementById(ids[i]);
        if (direct) return direct;
    }

    var named = document.getElementsByName(dotted);
    if (named.length) return named[0];
    named = document.getElementsByName(key);
    if (named.length) return named[0];

    var holders = document.querySelectorAll('[data-atm]');
    for (var h = 0; h < holders.length; h++) {
        var atm = (holders[h].getAttribute('data-atm') || '').replace(/\./g, '_');
        if (atm !== key) continue;
        return holders[h].querySelector(type === 'ta' ? 'textarea' : 'input, textarea');
    }
    return null;
}

function AF_markFilled(key, source) {
    AF_filled[key] = true;
    delete AF_pending[key];
    AF_updateHUD();
    AF_log((source || 'Auto') + ': ' + AF_MAP[key].label);
}

function AF_autoFillSimple(key, loadId) {
    if (loadId !== AF_loadId || AF_filled[key] || AF_pending[key]) return false;
    var mapping = AF_MAP[key];
    if (!mapping || mapping.type === 's2') return false;
    var value = mapping.val(AF_data);
    if (!value) return false;

    var element = AF_findAutomaticElement(key, mapping.type);
    if (!element) return false;

    var success = false;
    // Programmatic focus dispatches focusin synchronously. Mark the field as
    // pending first so the legacy focus fallback does not fill it a second time.
    AF_pending[key] = true;
    if (mapping.type === 'text') success = AF_fillText(element, value, false);
    else if (mapping.type === 'rich') success = AF_fillRich(element, value);
    else if (mapping.type === 'ta') success = AF_fillTA(element, value, false);

    delete AF_pending[key];
    if (success) AF_markFilled(key, 'Auto-filled');
    return success;
}

function AF_autoFillAvailableSimple(loadId) {
    Object.keys(AF_MAP).forEach(function(key) {
        AF_autoFillSimple(key, loadId);
    });
}

function AF_waitFor(check, timeoutMs, loadId) {
    return new Promise(function(resolve) {
        var started = Date.now();
        function poll() {
            if (!AF_autoEnabled || loadId !== AF_loadId) { resolve(null); return; }
            var result = null;
            try { result = check(); } catch (_) {}
            if (result) { resolve(result); return; }
            if (Date.now() - started >= timeoutMs) { resolve(null); return; }
            setTimeout(poll, 80);
        }
        poll();
    });
}

function AF_normalizeOption(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function AF_visibleSelect2Results() {
    var nodes = document.querySelectorAll(
        '#select2-drop .select2-result-selectable, ' +
        '.select2-drop-active .select2-result-selectable'
    );
    return Array.prototype.filter.call(nodes, function(node) {
        return AF_isVisible(node) &&
            !node.classList.contains('select2-disabled') &&
            !node.classList.contains('select2-no-results');
    });
}

function AF_matchingSelect2Result(value) {
    var expected = AF_normalizeOption(value);
    var results = AF_visibleSelect2Results();
    if (!results.length) return null;

    var matches = results.filter(function(result) {
        var actual = AF_normalizeOption(result.textContent);
        return actual === expected ||
            actual.indexOf(expected) !== -1 ||
            expected.indexOf(actual) !== -1;
    });
    if (matches.length) {
        matches.sort(function(a, b) {
            return AF_normalizeOption(a.textContent).length -
                AF_normalizeOption(b.textContent).length;
        });
        return matches[0];
    }

    // The search already constrained the remote result list. One unmatched
    // result is safe; multiple unmatched results are left for the technician.
    return results.length === 1 ? results[0] : null;
}

function AF_openSelect2(container) {
    if (!container) return false;
    var opener = container.querySelector(
        '.select2-choice, .select2-focusser, .select2-container'
    ) || container;
    opener.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
    }));
    opener.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
    }));
    if (typeof opener.click === 'function') opener.click();
    return true;
}

function AF_closeSelect2(input) {
    if (!input) return;
    input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Escape',
        keyCode: 27,
        which: 27
    }));
}

async function AF_autoFillSelect2(key, loadId) {
    if (loadId !== AF_loadId || AF_filled[key] || AF_pending[key]) return false;
    var mapping = AF_MAP[key];
    var value = mapping ? mapping.val(AF_data) : '';
    if (!mapping || !value) return false;

    var container = AF_findSelect2Container(key);
    if (!container || !AF_isVisible(container)) return false;

    var chosen = container.querySelector('.select2-chosen');
    var expected = AF_normalizeOption(value);
    var selected = AF_normalizeOption(chosen ? chosen.textContent : '');
    if (selected && (
        selected === expected ||
        selected.indexOf(expected) !== -1 ||
        expected.indexOf(selected) !== -1
    )) {
        AF_markFilled(key, 'Already selected');
        return true;
    }

    AF_pending[key] = true;
    AF_updateHUD();
    AF_openSelect2(container);

    var input = await AF_waitFor(function() {
        return AF_findS2Search(key);
    }, 2500, loadId);
    if (!input) {
        delete AF_pending[key];
        return false;
    }

    AF_typeSearch(input, value);
    var result = await AF_waitFor(function() {
        return AF_matchingSelect2Result(value);
    }, 3500, loadId);
    if (!result) {
        AF_closeSelect2(input);
        delete AF_pending[key];
        return false;
    }

    result.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
    }));
    if (typeof result.click === 'function') result.click();
    await new Promise(function(resolve) { setTimeout(resolve, 300); });

    if (loadId !== AF_loadId) {
        delete AF_pending[key];
        return false;
    }
    AF_markFilled(key, 'Auto-selected');
    return true;
}

function AF_remainingAutoFields() {
    if (!AF_data) return [];
    return Object.keys(AF_MAP).filter(function(key) {
        return AF_MAP[key].val(AF_data) && !AF_filled[key];
    });
}

function AF_setAutoStatus(message, color) {
    var status = document.getElementById('af-status');
    if (!status) return;
    status.style.color = color || AF_HUD_COLORS.textMuted;
    status.textContent = message;
}

async function AF_runAutomaticFill(loadId) {
    if (!AF_autoEnabled || !AF_active || !AF_data || loadId !== AF_loadId) return;
    if (AF_autoRunning) {
        AF_autoRerun = true;
        return;
    }
    if (AF_autoPass >= AF_AUTO_MAX_PASSES) return;

    AF_autoRunning = true;
    AF_autoPass++;
    AF_setAutoStatus('Auto-filling form… pass ' + AF_autoPass, AF_HUD_COLORS.primary);

    try {
        AF_autoFillAvailableSimple(loadId);

        for (var index = 0; index < AF_AUTO_SELECT_ORDER.length; index++) {
            if (!AF_autoEnabled || loadId !== AF_loadId) return;
            var key = AF_AUTO_SELECT_ORDER[index];
            if (AF_filled[key] || !AF_MAP[key].val(AF_data)) continue;
            if ((AF_autoAttempts[key] || 0) >= 2) continue;
            if (!AF_findSelect2Container(key)) continue;

            AF_autoAttempts[key] = (AF_autoAttempts[key] || 0) + 1;
            await AF_autoFillSelect2(key, loadId);
            AF_autoFillAvailableSimple(loadId);
        }

        AF_autoFillAvailableSimple(loadId);
        var remaining = AF_remainingAutoFields();
        if (!remaining.length) {
            AF_setAutoStatus('Auto-fill complete.', AF_HUD_COLORS.success);
            AF_log('Automatic fill complete');
        } else if (AF_autoPass < AF_AUTO_MAX_PASSES) {
            AF_setAutoStatus(
                'Auto-filled available fields; waiting for ' + remaining.length + ' field(s)…',
                AF_HUD_COLORS.textMuted
            );
            AF_scheduleAutomaticFill(900);
        } else {
            AF_setAutoStatus(
                'Auto-fill paused. Click a remaining field or press Retry.',
                AF_HUD_COLORS.textMuted
            );
        }
    } finally {
        AF_autoRunning = false;
        if (AF_autoRerun) {
            AF_autoRerun = false;
            AF_scheduleAutomaticFill(100);
        }
    }
}

function AF_scheduleAutomaticFill(delayMs) {
    if (!AF_autoEnabled || !AF_active) return;
    clearTimeout(AF_autoTimer);
    var loadId = AF_loadId;
    AF_autoTimer = setTimeout(function() {
        AF_runAutomaticFill(loadId);
    }, delayMs == null ? 150 : delayMs);
}

function AF_retryAutomaticFill() {
    if (!AF_data) return;
    AF_autoPass = 0;
    AF_autoAttempts = {};
    AF_scheduleAutomaticFill(0);
}

// ====================================================================
// FOCUS HANDLER
// ====================================================================
function AF_onFocus(e) {
    if (!AF_active || !AF_data) return;

    var el = e.target;
    var key = AF_identify(el);

    if (!key) return;

    // One successful fill per mapped field for each loaded ticket. This lets
    // the user edit a populated field without the extension overwriting it.
    if (AF_filled[key] || AF_pending[key]) return;

    var m = AF_MAP[key];
    var value = m.val(AF_data);
    if (!value) return;

    console.log('[AF] Focus on:', key, '-> filling with', m.type);

    var success = false;
    switch (m.type) {
        case 'text':
            success = AF_fillText(el, value);
            break;
        case 's2':
            AF_pending[key] = true;
            var loadId = AF_loadId;
            AF_fillS2(el, value, key, loadId, function(filled) {
                if (loadId !== AF_loadId) return;
                delete AF_pending[key];
                if (!filled) return;
                AF_filled[key] = true;
                AF_updateHUD();
            });
            return;
        case 'rich':
            success = AF_fillRich(el, value);
            break;
        case 'ta':
            success = AF_fillTA(el, value);
            break;
    }

    if (!success) return;
    AF_filled[key] = true;
    AF_updateHUD();
}

document.addEventListener('focusin', AF_onFocus, true);
// A click provides another attempt when a control was already focused and a
// previous asynchronous Select2 attempt did not find its search input.
document.addEventListener('click', AF_onFocus, true);

// Hook richtext iframes
function AF_hookIframes() {
    document.querySelectorAll('iframe.ze_area').forEach(function(iframe) {
        try {
            var iDoc = iframe.contentDocument;
            if (!iDoc) return;
            // ManageEngine can reload a document inside the same iframe
            // element. Hook each new document once.
            if (iframe._af_hookedDocument === iDoc) return;
            iframe._af_hookedDocument = iDoc;
            iDoc.addEventListener('focus', function() {
                if (!AF_active || !AF_data) return;
                var ed = iframe.closest('.sdp-zeditor-ovwrt');
                if (!ed) return;
                var eid = (ed.id || '').toLowerCase();
                var key = null;
                if (eid.indexOf('description') !== -1) key = 'description';
                else if (eid.indexOf('resolution') !== -1) key = 'resolution_content';
                if (!key) return;
                if (AF_filled[key]) return;

                var m = AF_MAP[key];
                var value = m.val(AF_data);
                if (!value) return;

                if (!AF_setRichContent(iframe, ed, value)) return;
                AF_filled[key] = true;
                AF_updateHUD();
                console.log('[AF] Filled richtext:', key);
            }, true);
        } catch(ex) {}
    });
}
setInterval(AF_hookIframes, 3000);
setTimeout(AF_hookIframes, 500);

// ====================================================================
// HUD
// ====================================================================
var AF_HUD_COLORS = {
    text: '#172033',
    textMuted: '#526076',
    textFaint: '#7c8aa0',
    border: '#d8e0eb',
    borderStrong: '#c5d0df',
    surface: '#f7f9fc',
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    success: '#16803d',
    danger: '#c62828'
};

function AF_createHUD() {
    var old = document.getElementById('af-hud');
    if (old) old.remove();

    var hud = document.createElement('div');
    hud.id = 'af-hud';
    hud.style.cssText = 'position:fixed;top:40px;right:12px;width:286px;box-sizing:border-box;color-scheme:light;background:#ffffff;border:1px solid #d8e0eb;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;font-size:12px;line-height:1.45;color:#172033;z-index:999999;box-shadow:0 2px 4px rgba(15,23,42,0.06),0 12px 28px rgba(15,23,42,0.14);overflow:hidden';

    hud.innerHTML = [
        '<div id="af-header" style="box-sizing:border-box;padding:10px 12px;background:linear-gradient(180deg,#f8fbff 0%,#eef5ff 100%);border-bottom:1px solid #dbe7f7;color:#172033;font-weight:700;font-size:12.5px;letter-spacing:-0.12px;cursor:move;display:flex;align-items:center;justify-content:space-between">',
        ' <span style="display:flex;align-items:center;gap:8px"><span style="display:block;width:9px;height:9px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,0.12)"></span>Ticket Autofill Alt' + (AF_APP_VERSION ? ' <small style="color:#64748b;font-weight:600">v' + AF_APP_VERSION + '</small>' : '') + '</span>',
        ' <button id="af-min" type="button" aria-label="Minimize" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;background:#ffffff;color:#526076;border:1px solid #cbd7e6;border-radius:7px;font-family:inherit;font-size:15px;line-height:1;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,0.05)">&#8722;</button>',
        '</div>',
        '<div id="af-body" style="box-sizing:border-box;padding:12px;background:#ffffff">',
        ' <div id="af-status" style="box-sizing:border-box;padding:7px 9px;margin-bottom:9px;background:#f7f9fc;color:#526076;border:1px solid #e3e8f0;border-radius:8px;font-size:11px;font-weight:600">No data loaded</div>',
        ' <button id="af-load" type="button" style="display:block;width:100%;box-sizing:border-box;padding:8px 10px;margin:0 0 8px;background:#2563eb;color:#ffffff;border:1px solid #1d4ed8;border-radius:8px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(37,99,235,0.22),0 4px 10px rgba(37,99,235,0.16)">Load + Auto-fill</button>',
        ' <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px">',
        '  <label style="display:flex;align-items:center;gap:6px;color:#526076;font-size:10.5px;font-weight:600;cursor:pointer"><input id="af-auto" type="checkbox" checked style="width:14px;height:14px;margin:0;accent-color:#2563eb"> Automatic mode</label>',
        '  <button id="af-retry" type="button" style="padding:4px 8px;background:#ffffff;color:#2563eb;border:1px solid #c5d0df;border-radius:6px;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer">Retry</button>',
        ' </div>',
        ' <div style="color:#526076;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.45px;margin-bottom:5px">Or paste JSON</div>',
        ' <textarea id="af-paste" aria-label="Paste ticket JSON" placeholder="{ &quot;name&quot;: &quot;...&quot; }" style="display:block;width:100%;height:54px;box-sizing:border-box;background:#f7f9fc;color:#172033;caret-color:#2563eb;border:1px solid #c5d0df;border-radius:8px;padding:7px 8px;outline:none;font-family:Consolas,monospace;font-size:10px;line-height:1.4;resize:vertical;margin:0 0 9px"></textarea>',
        ' <div id="af-fields" style="box-sizing:border-box;max-height:190px;overflow-y:auto;margin-bottom:9px;background:#f7f9fc;border:1px solid #e3e8f0;border-radius:8px;padding:3px 6px"></div>',
        ' <div id="af-log" style="box-sizing:border-box;max-height:86px;overflow-y:auto;background:#fbfcfe;border:1px solid #e3e8f0;border-radius:8px;padding:6px 8px;font-size:10px;line-height:1.5;color:#7c8aa0"></div>',
        '</div>'
    ].join('\n');

    document.body.appendChild(hud);

    // Events
    document.getElementById('af-min').addEventListener('click', function() {
        var b = document.getElementById('af-body');
        b.style.display = b.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('af-load').addEventListener('click', AF_loadClipboard);
    document.getElementById('af-retry').addEventListener('click', AF_retryAutomaticFill);
    document.getElementById('af-auto').addEventListener('change', function() {
        AF_autoEnabled = this.checked;
        if (AF_autoEnabled) AF_retryAutomaticFill();
        else AF_setAutoStatus('Automatic mode off — click/tab fields to fill.');
    });

    var loadButton = document.getElementById('af-load');
    loadButton.addEventListener('mouseenter', function() {
        this.style.background = AF_HUD_COLORS.primaryHover;
    });
    loadButton.addEventListener('mouseleave', function() {
        this.style.background = AF_HUD_COLORS.primary;
    });

    var pasteBox = document.getElementById('af-paste');
    pasteBox.addEventListener('focus', function() {
        this.style.borderColor = AF_HUD_COLORS.primary;
        this.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
        this.style.background = '#ffffff';
    });
    pasteBox.addEventListener('blur', function() {
        this.style.borderColor = AF_HUD_COLORS.borderStrong;
        this.style.boxShadow = 'none';
        this.style.background = AF_HUD_COLORS.surface;
    });
    pasteBox.addEventListener('input', function() {
        try {
            var d = JSON.parse(this.value);
            AF_loadData(d);
        } catch(e) {}
    });

    // Draggable
    var dragging = false, ox = 0, oy = 0;
    document.getElementById('af-header').addEventListener('mousedown', function(e) {
        dragging = true;
        ox = e.clientX - hud.getBoundingClientRect().left;
        oy = e.clientY - hud.getBoundingClientRect().top;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        hud.style.left = (e.clientX - ox) + 'px';
        hud.style.top = (e.clientY - oy) + 'px';
        hud.style.right = 'auto';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
}

function AF_updateHUD() {
    var fl = document.getElementById('af-fields');
    if (!fl || !AF_data) return;
    var html = '';
    var keys = Object.keys(AF_MAP);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i], m = AF_MAP[k];
        var v = m.val(AF_data);
        if (!v) continue;
        var done = AF_filled[k];
        var c = done ? AF_HUD_COLORS.success : AF_HUD_COLORS.textMuted;
        var icon = done ? '&#10003;' : '&#8226;';
        var prev = v.length > 25 ? v.substring(0, 25) + '..' : v;
        html += '<div style="padding:4px 2px;color:' + c + ';border-bottom:1px solid #edf1f6">' + icon + ' <span style="color:#344258;font-weight:600">' + m.label + ':</span> ' + prev.replace(/</g, '&lt;') + '</div>';
    }
    fl.innerHTML = html;
}

function AF_log(msg) {
    var lg = document.getElementById('af-log');
    if (!lg) return;
    var t = new Date();
    var ts = [t.getHours(), t.getMinutes(), t.getSeconds()].map(function(n){ return n < 10 ? '0'+n : ''+n; }).join(':');
    lg.innerHTML += '<div style="color:' + AF_HUD_COLORS.success + '">' + ts + ' ' + msg + '</div>';
    lg.scrollTop = lg.scrollHeight;
}

// ====================================================================
// LOAD DATA
// ====================================================================
function AF_loadData(data) {
    AF_data = data;
    AF_filled = {};
    AF_pending = {};
    AF_loadId++;
    AF_active = true;
    AF_autoPass = 0;
    AF_autoAttempts = {};
    AF_autoRerun = false;
    var st = document.getElementById('af-status');
    if (st) { st.style.color = AF_HUD_COLORS.success; st.textContent = 'Loaded: ' + (data.name || data.user || 'ticket'); }
    AF_updateHUD();
    AF_log(AF_autoEnabled
        ? 'Data loaded - automatic fill starting'
        : 'Data loaded - click/tab fields to fill');
    console.log('[AF] Data loaded:', data.name || data.user);
    AF_scheduleAutomaticFill(100);
}

async function AF_loadClipboard() {
    try {
        var text = await navigator.clipboard.readText();
        var data = JSON.parse(text);
        AF_loadData(data);
        var pb = document.getElementById('af-paste');
        if (pb) pb.value = text;
    } catch(e) {
        var st = document.getElementById('af-status');
        if (st) { st.style.color = AF_HUD_COLORS.danger; st.textContent = 'Clipboard failed - paste JSON below'; }
        console.log('[AF] Clipboard error:', e.message);
    }
}

// ====================================================================
// INIT
// ====================================================================
AF_createHUD();
var AF_autoObserver = new MutationObserver(function(records) {
    if (!AF_autoEnabled || !AF_active || AF_autoPass >= AF_AUTO_MAX_PASSES) return;
    var relevant = records.some(function(record) {
        var target = record.target && record.target.nodeType === 1 ? record.target : null;
        return !target || !target.closest('#af-hud');
    });
    if (relevant) AF_scheduleAutomaticFill(250);
});
AF_autoObserver.observe(document.body, { childList: true, subtree: true });
console.log('[AF ALT] Automatic autofill ready. Load JSON to begin.');
