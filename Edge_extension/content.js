// L1 Ticket Autofill - Focus Map (Global version for console paste)
// Paste this entire block into the browser console on the ManageEngine page.

// ====================================================================
// STATE (global, accessible from console)
// ====================================================================
var AF_data = null;
var AF_filled = {};
var AF_pending = {};
var AF_active = false;
var AF_loadId = 0;

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
function AF_fillText(el, value) {
    el.focus();
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

function AF_fillRich(el, value) {
    var wrapper = el.closest('.sdp-zeditor-ovwrt') || el.closest('.control-holder') || el.parentElement;
    var iframe = wrapper ? wrapper.querySelector('iframe.ze_area') : null;
    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        var html = value.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
        iframe.contentDocument.body.innerHTML = html;
        var ta = wrapper.querySelector('textarea');
        if (ta) {
            ta.value = html;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
    }
    return false;
}

function AF_fillTA(el, value) {
    var ta = el.tagName === 'TEXTAREA' ? el : null;
    if (!ta) {
        var h = el.closest('.control-holder');
        if (h) ta = h.querySelector('textarea');
    }
    if (ta) {
        ta.focus();
        ta.value = value;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    return false;
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

                var html = value.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
                iDoc.body.innerHTML = html;
                var ta = ed.querySelector('textarea');
                if (ta) { ta.value = html; ta.dispatchEvent(new Event('input', { bubbles: true })); }
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
        ' <span style="display:flex;align-items:center;gap:8px"><span style="display:block;width:9px;height:9px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,0.12)"></span>Ticket Autofill</span>',
        ' <button id="af-min" type="button" aria-label="Minimize" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;background:#ffffff;color:#526076;border:1px solid #cbd7e6;border-radius:7px;font-family:inherit;font-size:15px;line-height:1;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,0.05)">&#8722;</button>',
        '</div>',
        '<div id="af-body" style="box-sizing:border-box;padding:12px;background:#ffffff">',
        ' <div id="af-status" style="box-sizing:border-box;padding:7px 9px;margin-bottom:9px;background:#f7f9fc;color:#526076;border:1px solid #e3e8f0;border-radius:8px;font-size:11px;font-weight:600">No data loaded</div>',
        ' <button id="af-load" type="button" style="display:block;width:100%;box-sizing:border-box;padding:8px 10px;margin:0 0 10px;background:#2563eb;color:#ffffff;border:1px solid #1d4ed8;border-radius:8px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;box-shadow:0 1px 2px rgba(37,99,235,0.22),0 4px 10px rgba(37,99,235,0.16)">Load from Clipboard</button>',
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
    var st = document.getElementById('af-status');
    if (st) { st.style.color = AF_HUD_COLORS.success; st.textContent = 'Loaded: ' + (data.name || data.user || 'ticket'); }
    AF_updateHUD();
    AF_log('Data loaded - click/tab fields to fill');
    console.log('[AF] Data loaded:', data.name || data.user);
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
console.log('[AF] Focus-map autofill ready. Load JSON and tab through the form.');
