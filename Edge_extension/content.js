// L1 Ticket Autofill - Focus Map (Global version for console paste)
// Paste this entire block into the browser console on the ManageEngine page.

// ====================================================================
// STATE (global, accessible from console)
// ====================================================================
var AF_data = null;
var AF_filled = {};
var AF_active = false;
var AF_lastField = null;
var AF_lastTime = 0;

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
}

function AF_typeSearch(input, value) {
    input.focus();
    input.value = '';
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 0 }));
}

function AF_fillS2(el, value) {
    // If this IS a search input already (user clicked into open dropdown)
    if (el.classList.contains('select2-input')) {
        AF_typeSearch(el, value);
        return;
    }

    // If it's a focusser, the dropdown should open on focus
    // Wait a beat then find the search input in the global drop
    if (el.classList.contains('select2-focusser') || el.closest('[id^="s2id_for_"]')) {
        setTimeout(function() {
            var drop = document.getElementById('select2-drop');
            if (drop && drop.style.display === 'block') {
                var si = drop.querySelector('.select2-input');
                if (si) {
                    AF_typeSearch(si, value);
                    console.log('[AF] Typed "' + value + '" into dropdown search');
                } else {
                    console.log('[AF] Dropdown open but no search input found');
                }
            } else {
                console.log('[AF] Dropdown not open yet for s2 field');
            }
        }, 400);
    }
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
    }
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
    }
}

// ====================================================================
// FOCUS HANDLER
// ====================================================================
function AF_onFocus(e) {
    if (!AF_active || !AF_data) return;

    var el = e.target;
    var key = AF_identify(el);

    if (!key) return;

    var m = AF_MAP[key];
    var value = m.val(AF_data);
    if (!value) return;

    // Debounce
    var now = Date.now();
    if (key === AF_lastField && (now - AF_lastTime) < 2000) return;
    AF_lastField = key;
    AF_lastTime = now;

    console.log('[AF] Focus on:', key, '-> filling with', m.type);

    switch (m.type) {
        case 'text': AF_fillText(el, value); break;
        case 's2': AF_fillS2(el, value); break;
        case 'rich': AF_fillRich(el, value); break;
        case 'ta': AF_fillTA(el, value); break;
    }

    AF_filled[key] = true;
    AF_updateHUD();
}

document.addEventListener('focusin', AF_onFocus, true);

// Hook richtext iframes
function AF_hookIframes() {
    document.querySelectorAll('iframe.ze_area').forEach(function(iframe) {
        if (iframe._af_hooked) return;
        iframe._af_hooked = true;
        try {
            var iDoc = iframe.contentDocument;
            if (!iDoc) return;
            iDoc.addEventListener('focus', function() {
                if (!AF_active || !AF_data) return;
                var ed = iframe.closest('.sdp-zeditor-ovwrt');
                if (!ed) return;
                var eid = (ed.id || '').toLowerCase();
                var key = null;
                if (eid.indexOf('description') !== -1) key = 'description';
                else if (eid.indexOf('resolution') !== -1) key = 'resolution_content';
                if (!key) return;

                var m = AF_MAP[key];
                var value = m.val(AF_data);
                if (!value) return;

                var now = Date.now();
                if (key === AF_lastField && (now - AF_lastTime) < 2000) return;
                AF_lastField = key;
                AF_lastTime = now;

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
function AF_createHUD() {
    var old = document.getElementById('af-hud');
    if (old) old.remove();

    var hud = document.createElement('div');
    hud.id = 'af-hud';
    hud.style.cssText = 'position:fixed;top:10px;right:10px;width:260px;background:#18181cee;border:1px solid #333;border-radius:8px;font-family:Consolas,monospace;font-size:11px;color:#e0ddd6;z-index:999999;box-shadow:0 8px 24px rgba(0,0,0,0.4)';

    hud.innerHTML = [
        '<div id="af-header" style="padding:8px 12px;background:#1a1a1f;border-bottom:1px solid #333;color:#d4a843;font-weight:bold;font-size:12px;cursor:move;display:flex;justify-content:space-between">',
        ' <span>L1 Autofill</span>',
        ' <span id="af-min" style="cursor:pointer;color:#888">_</span>',
        '</div>',
        '<div id="af-body" style="padding:8px 12px">',
        ' <div id="af-status" style="color:#8a877f;margin-bottom:6px">No data loaded</div>',
        ' <button id="af-load" style="display:block;width:100%;padding:6px;background:#d4a843;color:#18181c;border:none;border-radius:4px;font-family:inherit;font-size:11px;font-weight:bold;cursor:pointer;margin-bottom:6px">Load from Clipboard</button>',
        ' <div style="color:#555;font-size:10px;margin-bottom:2px">Or paste JSON:</div>',
        ' <textarea id="af-paste" style="width:100%;height:40px;background:#111;color:#aaa;border:1px solid #333;border-radius:4px;padding:4px;font-family:Consolas,monospace;font-size:10px;resize:vertical;margin-bottom:6px"></textarea>',
        ' <div id="af-fields" style="max-height:180px;overflow-y:auto;margin-bottom:6px"></div>',
        ' <div id="af-log" style="max-height:80px;overflow-y:auto;border-top:1px solid #333;padding-top:4px;font-size:10px;color:#666"></div>',
        '</div>'
    ].join('\n');

    document.body.appendChild(hud);

    // Events
    document.getElementById('af-min').addEventListener('click', function() {
        var b = document.getElementById('af-body');
        b.style.display = b.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('af-load').addEventListener('click', AF_loadClipboard);

    document.getElementById('af-paste').addEventListener('input', function() {
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
        var c = done ? '#5cb85c' : '#8a877f';
        var icon = done ? '>' : ' ';
        var prev = v.length > 25 ? v.substring(0, 25) + '..' : v;
        html += '<div style="padding:1px 0;color:' + c + '">' + icon + ' <span style="color:#bbb">' + m.label + ':</span> ' + prev.replace(/</g, '&lt;') + '</div>';
    }
    fl.innerHTML = html;
}

function AF_log(msg) {
    var lg = document.getElementById('af-log');
    if (!lg) return;
    var t = new Date();
    var ts = [t.getHours(), t.getMinutes(), t.getSeconds()].map(function(n){ return n < 10 ? '0'+n : ''+n; }).join(':');
    lg.innerHTML += '<div style="color:#5cb85c">' + ts + ' ' + msg + '</div>';
    lg.scrollTop = lg.scrollHeight;
}

// ====================================================================
// LOAD DATA
// ====================================================================
function AF_loadData(data) {
    AF_data = data;
    AF_filled = {};
    AF_active = true;
    var st = document.getElementById('af-status');
    if (st) { st.style.color = '#5cb85c'; st.textContent = 'Loaded: ' + (data.name || data.user || 'ticket'); }
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
        if (st) { st.style.color = '#c94040'; st.textContent = 'Clipboard failed - paste JSON below'; }
        console.log('[AF] Clipboard error:', e.message);
    }
}

// ====================================================================
// INIT
// ====================================================================
AF_createHUD();
console.log('[AF] Focus-map autofill ready. Load JSON and tab through the form.');
