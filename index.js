/**
 * Lore Manager — SillyTavern Extension
 *
 * Features:
 *   1. Floating, draggable lorebook panels opened via a TopInfoBar button +
 *      searchable lorebook selector dropdown.
 *   2. LLM-assisted entry creation: topic + recent chat messages → generated
 *      content → new lorebook entry.
 *   3. Evolving entries: entries tagged ♻ are automatically reviewed after
 *      each completion that activates them, with configurable update modes.
 */

import {
    world_names,
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    METADATA_KEY,
} from '../../../../scripts/world-info.js';

import { getRequestHeaders } from '../../../../script.js';

/** Settings panel HTML — inlined to avoid template-loader 404s. */
const SETTINGS_HTML = `
<div class="lore-manager-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Lore Manager</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">LLM Profiles</div>
                <label class="loreMgr-settings-label" for="loreMgr-create-profile">Entry Creation Profile</label>
                <select id="loreMgr-create-profile" class="loreMgr-profile-select"></select>
                <label class="loreMgr-settings-label" for="loreMgr-evolve-profile">Entry Evolution Profile</label>
                <select id="loreMgr-evolve-profile" class="loreMgr-profile-select"></select>
            </div>

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">Generation Defaults</div>
                <label class="loreMgr-settings-label" for="loreMgr-default-msg-count">Recent messages to include</label>
                <input type="number" id="loreMgr-default-msg-count" class="text_pole" min="1" max="200" value="10">
                <label class="loreMgr-settings-label" for="loreMgr-default-max-tokens">Max tokens for LLM response</label>
                <input type="number" id="loreMgr-default-max-tokens" class="text_pole" min="50" max="4000" value="500">
            </div>

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">New Entry Defaults</div>
                <label class="loreMgr-settings-label" for="loreMgr-default-position">Position (0=before char, 1=after char, 4=at depth)</label>
                <input type="number" id="loreMgr-default-position" class="text_pole" min="0" max="4" value="0">
                <label class="loreMgr-settings-label" for="loreMgr-default-depth">Depth (for at-depth position)</label>
                <input type="number" id="loreMgr-default-depth" class="text_pole" min="0" max="99" value="4">
                <label class="loreMgr-settings-label" for="loreMgr-default-order">Order (higher = inserted first)</label>
                <input type="number" id="loreMgr-default-order" class="text_pole" min="0" max="999" value="100">
                <label class="loreMgr-settings-label checkbox_label">
                    <input type="checkbox" id="loreMgr-default-constant">
                    Always active (constant)
                </label>
            </div>

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">Evolution Mode</div>
                <div class="loreMgr-radio-group">
                    <label class="loreMgr-radio-label">
                        <input type="radio" name="loreMgr-evolution-mode" value="auto">
                        Auto-save silently
                    </label>
                    <label class="loreMgr-radio-label">
                        <input type="radio" name="loreMgr-evolution-mode" value="confirm" checked>
                        Show diff &amp; confirm
                    </label>
                    <label class="loreMgr-radio-label">
                        <input type="radio" name="loreMgr-evolution-mode" value="timeout">
                        Notify with countdown auto-save
                    </label>
                </div>
                <div id="loreMgr-timeout-row" style="display:none;">
                    <label class="loreMgr-settings-label" for="loreMgr-evolution-timeout">Auto-save after (seconds)</label>
                    <input type="number" id="loreMgr-evolution-timeout" class="text_pole" min="5" max="300" value="30">
                </div>
            </div>

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">Prompts</div>
                <label class="loreMgr-settings-label" for="loreMgr-create-prompt">Entry Creation System Prompt</label>
                <textarea id="loreMgr-create-prompt" class="text_pole loreMgr-prompt-textarea" rows="4" spellcheck="false"></textarea>
                <label class="loreMgr-settings-label" for="loreMgr-evolve-prompt">Entry Evolution System Prompt</label>
                <textarea id="loreMgr-evolve-prompt" class="text_pole loreMgr-prompt-textarea" rows="4" spellcheck="false"></textarea>
            </div>

            <div class="loreMgr-settings-section">
                <div class="loreMgr-settings-heading">Prompt Presets</div>
                <div id="loreMgr-preset-list"></div>
                <button id="loreMgr-add-preset-btn" class="menu_button loreMgr-add-preset-btn">
                    <i class="fa-solid fa-plus"></i> Add Preset
                </button>
                <div id="loreMgr-preset-form" class="loreMgr-preset-form" style="display:none;">
                    <label class="loreMgr-settings-label" for="loreMgr-pf-name">Preset Name</label>
                    <input type="text" id="loreMgr-pf-name" class="text_pole" placeholder="e.g. Character entry">
                    <div class="loreMgr-radio-group" style="margin:6px 0;">
                        <label class="loreMgr-radio-label">
                            <input type="radio" id="loreMgr-pf-scope-global" name="loreMgr-pf-scope" value="global" checked>
                            Global
                        </label>
                        <label class="loreMgr-radio-label">
                            <input type="radio" id="loreMgr-pf-scope-chat" name="loreMgr-pf-scope" value="chat">
                            <span class="loreMgr-pf-chat-label">This Chat</span>
                        </label>
                    </div>
                    <label class="loreMgr-settings-label" for="loreMgr-pf-prompt">System Prompt</label>
                    <textarea id="loreMgr-pf-prompt" class="text_pole loreMgr-prompt-textarea" rows="4" spellcheck="false"></textarea>
                    <div class="loreMgr-preset-form-actions">
                        <button id="loreMgr-pf-save" class="menu_button">Save</button>
                        <button id="loreMgr-pf-cancel" class="menu_button">Cancel</button>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>`;

// ============================================================
// Constants & module state
// ============================================================

const MODULE     = 'lore_manager';

const DEFAULT_CREATE_PROMPT =
    'You write concise lorebook entries for collaborative fiction. '
    + 'When given a topic and conversation context, return ONLY the '
    + 'descriptive entry text — no title, no preamble, no markdown.';

const DEFAULT_EVOLVE_PROMPT =
    'You maintain lorebook entries for collaborative fiction. '
    + 'When given a current entry and a recent story exchange, '
    + 'determine if the entry should be updated to reflect new '
    + 'information. If yes, return ONLY the updated content text — '
    + 'no title, no preamble, no markdown. '
    + 'If no update is needed, return exactly: N/A';

const DEFAULT_SETTINGS = {
    createProfileId:         null,
    evolveProfileId:         null,
    defaultMsgCount:         10,
    defaultMaxTokens:        500,
    entryDefaults: {
        position:   0,
        depth:      4,
        order:      100,
        constant:   false,
        scanDepth:  null,
    },
    evolutionMode:           'confirm',  // 'auto' | 'confirm' | 'timeout'
    evolutionTimeout:        30,
    panelPositions:          {},         // { [bookName]: { top, left } }
    evolvingEntries:         {},         // { [bookName]: uid[] }
    dismissTopInfoBarNotice: false,
    createSystemPrompt:      DEFAULT_CREATE_PROMPT,
    evolveSystemPrompt:      DEFAULT_EVOLVE_PROMPT,
    promptPresets:           [],         // [{ id, name, scope:'global'|'chat', chatId, systemPrompt }]
};

/** Guard: prevent concurrent evolution runs (one pass at a time). */
let evolutionRunning = false;

/** Monotonically-increasing z-index counter for panels. */
let panelZ = 9000;

// ============================================================
// Utilities
// ============================================================

function getSettings() {
    return SillyTavern.getContext().extensionSettings[MODULE];
}

/** Replace non-alphanumeric/hyphen/underscore chars so name is safe as a DOM id. */
function safeId(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;');
}

// ============================================================
// LLM request helper (chat-completion only, mirrors MemoryBooks approach)
// ============================================================

async function loreMgrFetch(messages, profileId) {
    const ctx = SillyTavern.getContext();

    // Sanitize — may have been persisted as a full profile object
    const id = typeof profileId === 'object' ? (profileId?.id ?? null) : (profileId ?? null);
    if (!id) throw new Error('No LLM profile selected — configure one in extension settings.');

    const profile = ctx.extensionSettings?.connectionManager?.profiles?.find(p => p.id === id);
    if (!profile) throw new Error(`LLM profile not found (ID: ${id}). Re-select it in extension settings.`);

    const apiMap = ctx.CONNECT_API_MAP?.[profile.api];
    if (!apiMap || apiMap.selected !== 'openai') {
        throw new Error(
            `Profile "${profile.name}" uses a text-completion API which is not supported. `
            + 'Please select a chat-completion profile (OpenAI, Claude, etc.).',
        );
    }

    const body = {
        messages,
        model:                    profile.model ?? '',
        chat_completion_source:   apiMap.source ?? profile.api,
        stream:                   false,
        max_tokens:               getSettings().defaultMaxTokens,
    };

    if (profile['api-url'])   body.custom_url = profile['api-url'];
    if (profile['secret-id']) body.secret_id  = profile['secret-id'];

    const res = await fetch('/api/backends/chat-completions/generate', {
        method:  'POST',
        headers: getRequestHeaders(),
        body:    JSON.stringify(body),
    });

    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status} from LLM backend${detail ? ': ' + detail.slice(0, 400) : ''}`);
    }

    const data    = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('LLM returned an empty response.');
    return content;
}

// ============================================================
// TopInfoBar button
// ============================================================

function initTopBarButton() {
    if (document.getElementById('loreMgrPanelToggle')) return;

    const topBar = document.getElementById('extensionTopBar');
    if (!topBar) {
        showMissingTopInfoBarNotice();
        return;
    }

    const btn = makeToggleButton('loreMgrPanelToggle');
    const anchor = document.getElementById('extensionTopBarChatName');
    topBar.insertBefore(btn, anchor ?? null);
}

function makeToggleButton(id) {
    const btn = document.createElement('i');
    btn.id        = id;
    btn.className = 'fa-fw fa-solid fa-book-open right_menu_button';
    btn.title     = 'Lore Manager';
    btn.tabIndex  = 0;
    btn.setAttribute('role', 'button');
    btn.addEventListener('click', onToggleButtonClick);
    btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleButtonClick(e); }
    });
    return btn;
}

function showMissingTopInfoBarNotice() {
    const settings = getSettings();
    if (settings.dismissTopInfoBarNotice) return;

    settings.dismissTopInfoBarNotice = true;
    SillyTavern.getContext().saveSettingsDebounced();

    if (window.toastr) {
        window.toastr.warning(
            'Install the <b>Chat Top Bar</b> extension for the Lore Manager button. A fallback button has been placed in the top-right menu.',
            'Lore Manager',
            { timeOut: 9000, escapeHtml: false },
        );
    }

    // Fallback: inject into ST's top-right icon row
    const fallbackContainers = [
        '#top-settings-holder',
        '#options_container',
        '.right_menu',
    ];
    for (const sel of fallbackContainers) {
        const el = document.querySelector(sel);
        if (el && !document.getElementById('loreMgrFallbackToggle')) {
            el.prepend(makeToggleButton('loreMgrFallbackToggle'));
            break;
        }
    }
}

// ============================================================
// Dropdown
// ============================================================

function onToggleButtonClick(e) {
    if (e) e.stopPropagation();
    if (document.getElementById('loreMgrDropdown')) {
        closeDropdown();
    } else {
        openDropdown();
    }
}

function getPreSelectedBook() {
    const ctx    = SillyTavern.getContext();
    const chatBook = ctx.chatMetadata?.[METADATA_KEY];
    if (chatBook && world_names.includes(chatBook)) return chatBook;

    const charId   = ctx.characterId;
    if (charId != null) {
        const charBook = ctx.characters?.[charId]?.data?.extensions?.world;
        if (charBook && world_names.includes(charBook)) return charBook;
    }
    return null;
}

function openDropdown() {
    const btn = document.getElementById('loreMgrPanelToggle')
             || document.getElementById('loreMgrFallbackToggle');
    if (!btn) return;

    const rect        = btn.getBoundingClientRect();
    const panelWidth  = 280;
    const leftPos     = Math.min(rect.left, window.innerWidth - panelWidth - 8);
    const preSelected = getPreSelectedBook();

    const dropdown    = document.createElement('div');
    dropdown.id       = 'loreMgrDropdown';
    dropdown.style.top  = `${rect.bottom + 4}px`;
    dropdown.style.left = `${leftPos}px`;
    dropdown.innerHTML  = `
        <div class="loreMgr-dropdown-inner">
            <input
                type="text"
                id="loreMgrSearch"
                placeholder="Search lorebooks…"
                autocomplete="off"
                spellcheck="false"
                aria-label="Search lorebooks"
            >
            <ul id="loreMgrList" role="listbox" aria-label="Lorebook list"></ul>
        </div>`;

    document.body.appendChild(dropdown);
    renderDropdownList(preSelected, '');

    const search = document.getElementById('loreMgrSearch');
    search.focus();
    search.addEventListener('input',   () => renderDropdownList(preSelected, search.value));
    search.addEventListener('keydown', handleSearchKeydown);

    // Defer attaching the outside-click listener so the current click doesn't
    // immediately trigger it.
    setTimeout(() => document.addEventListener('mousedown', handleOutsideClick), 0);
}

function renderDropdownList(preSelected, filter) {
    const list = document.getElementById('loreMgrList');
    if (!list) return;

    const lf       = filter.toLowerCase();
    const filtered = world_names.filter(n => n.toLowerCase().includes(lf));

    if (filtered.length === 0) {
        list.innerHTML = '<li class="loreMgr-dropdown-empty">No lorebooks found</li>';
        return;
    }

    list.innerHTML = filtered.map(name => `
        <li
            class="loreMgr-dropdown-item${name === preSelected ? ' loreMgr-preselected' : ''}"
            data-book="${escapeAttr(name)}"
            tabindex="0"
            role="option"
            aria-selected="${name === preSelected}"
        >${escapeHtml(name)}</li>`).join('');

    list.querySelectorAll('.loreMgr-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            closeDropdown();
            openLorePanel(item.dataset.book);
        });
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter')     { item.click(); }
            if (e.key === 'Escape')    { closeDropdown(); }
            if (e.key === 'ArrowDown') { item.nextElementSibling?.focus(); }
            if (e.key === 'ArrowUp') {
                const prev = item.previousElementSibling;
                if (prev) prev.focus();
                else document.getElementById('loreMgrSearch')?.focus();
            }
        });
    });
}

function handleSearchKeydown(e) {
    if (e.key === 'Escape')    { closeDropdown(); }
    if (e.key === 'ArrowDown') {
        document.querySelector('#loreMgrList .loreMgr-dropdown-item')?.focus();
    }
}

function handleOutsideClick(e) {
    const dropdown = document.getElementById('loreMgrDropdown');
    const btn1     = document.getElementById('loreMgrPanelToggle');
    const btn2     = document.getElementById('loreMgrFallbackToggle');
    if (dropdown && !dropdown.contains(e.target) && e.target !== btn1 && e.target !== btn2) {
        closeDropdown();
    }
}

function closeDropdown() {
    document.getElementById('loreMgrDropdown')?.remove();
    document.removeEventListener('mousedown', handleOutsideClick);
}

// ============================================================
// Panels
// ============================================================

function openLorePanel(bookName) {
    const id       = `loreMgr-panel-${safeId(bookName)}`;
    const existing = document.getElementById(id);
    if (existing) {
        existing.style.zIndex = String(++panelZ);
        return;
    }
    buildLorePanel(bookName, id);
}

function buildLorePanel(bookName, id) {
    const settings  = getSettings();
    const existingCount = document.querySelectorAll('.loreMgr-panel').length;
    const savedPos  = settings.panelPositions?.[bookName]
                    ?? { top: 80 + existingCount * 28, left: 200 + existingCount * 28 };

    const panel       = document.createElement('div');
    panel.id          = id;
    panel.className   = 'loreMgr-panel';
    panel.style.top   = `${savedPos.top}px`;
    panel.style.left  = `${savedPos.left}px`;
    panel.style.zIndex = String(++panelZ);

    panel.innerHTML = `
        <div class="loreMgr-panel-header">
            <span class="loreMgr-panel-title" title="${escapeAttr(bookName)}">${escapeHtml(bookName)}</span>
            <div class="loreMgr-panel-header-actions">
                <button class="loreMgr-new-entry-btn menu_button" title="Create a new entry with LLM">
                    <i class="fa-solid fa-plus"></i> New Entry
                </button>
                <i class="loreMgr-close-btn fa-solid fa-xmark right_menu_button" title="Close panel" tabindex="0" role="button"></i>
            </div>
        </div>
        <div class="loreMgr-creation-form" style="display:none;">
            <label class="loreMgr-form-label">Topic / Title</label>
            <input type="text" class="loreMgr-topic-input text_pole" placeholder="e.g. The Iron Throne">
            <label class="loreMgr-form-label">Keywords <span class="loreMgr-form-hint">(comma-separated trigger words)</span></label>
            <input type="text" class="loreMgr-keywords-input text_pole" placeholder="e.g. iron throne, the throne">
            <div class="loreMgr-form-row">
                <label>Recent messages:
                    <input type="number" class="loreMgr-msgcount-input text_pole"
                        value="${settings.defaultMsgCount}" min="1" max="200">
                </label>
            </div>
            <label class="loreMgr-form-label">Prompt Preset</label>
            <select class="loreMgr-preset-select text_pole"></select>
            <div class="loreMgr-form-actions">
                <button class="loreMgr-generate-btn menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Generate
                </button>
                <button class="loreMgr-form-cancel-btn menu_button">Cancel</button>
            </div>
            <div class="loreMgr-form-status"></div>
        </div>
        <div class="loreMgr-entry-list"></div>`;

    const container = document.getElementById('movingDivs') ?? document.body;
    container.appendChild(panel);

    // Make draggable via jQuery UI (included in ST)
    $(panel).draggable({
        handle:      '.loreMgr-panel-header',
        containment: 'window',
        stop() {
            const pos = $(panel).position();
            const s   = getSettings();
            s.panelPositions[bookName] = { top: pos.top, left: pos.left };
            SillyTavern.getContext().saveSettingsDebounced();
        },
    });

    // Bring to front when clicked anywhere on the panel
    panel.addEventListener('mousedown', () => { panel.style.zIndex = String(++panelZ); });

    // Close button
    panel.querySelector('.loreMgr-close-btn').addEventListener('click', () => panel.remove());
    panel.querySelector('.loreMgr-close-btn').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panel.remove(); }
    });

    wireCreationForm(panel, bookName);
    renderPanelEntries(panel, bookName);
}

// ============================================================
// Entry creation form
// ============================================================

function wireCreationForm(panel, bookName) {
    const newBtn      = panel.querySelector('.loreMgr-new-entry-btn');
    const form        = panel.querySelector('.loreMgr-creation-form');
    const cancelBtn   = panel.querySelector('.loreMgr-form-cancel-btn');
    const generateBtn = panel.querySelector('.loreMgr-generate-btn');
    const topicInput  = panel.querySelector('.loreMgr-topic-input');
    const kwInput     = panel.querySelector('.loreMgr-keywords-input');

    newBtn.addEventListener('click', () => {
        const isVisible = form.style.display !== 'none';
        form.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            populatePresetSelect(panel.querySelector('.loreMgr-preset-select'));
            topicInput.focus();
        }
    });

    cancelBtn.addEventListener('click', () => {
        form.style.display = 'none';
        panel.querySelector('.loreMgr-form-status').textContent = '';
    });

    // Auto-fill keywords from topic when the keywords field hasn't been manually edited
    topicInput.addEventListener('input', () => {
        if (!kwInput.dataset.userEdited) {
            kwInput.value = topicInput.value.toLowerCase();
        }
    });
    kwInput.addEventListener('input', () => { kwInput.dataset.userEdited = '1'; });

    generateBtn.addEventListener('click', () => handleGenerateEntry(panel, bookName));

    // Enter in either field triggers generation
    topicInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGenerateEntry(panel, bookName); });
    kwInput.addEventListener('keydown',    e => { if (e.key === 'Enter') handleGenerateEntry(panel, bookName); });
}

async function handleGenerateEntry(panel, bookName) {
    const topic       = panel.querySelector('.loreMgr-topic-input').value.trim();
    const kwRaw       = panel.querySelector('.loreMgr-keywords-input').value.trim();
    const msgCount    = Math.max(1, parseInt(panel.querySelector('.loreMgr-msgcount-input').value) || 10);
    const status      = panel.querySelector('.loreMgr-form-status');
    const generateBtn = panel.querySelector('.loreMgr-generate-btn');

    if (!topic) { status.textContent = 'Please enter a topic.'; return; }

    // Parse keywords: comma-separated, lowercase, deduplicated; fall back to topic
    const keywords = kwRaw
        ? [...new Set(kwRaw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean))]
        : [topic.toLowerCase()];

    const settings = getSettings();
    if (!settings.createProfileId) {
        status.textContent = 'No creation profile set — configure in extension settings.';
        return;
    }

    const presetId     = panel.querySelector('.loreMgr-preset-select')?.value ?? 'default';
    const systemPrompt = resolvePresetPrompt(presetId);

    const { chat } = SillyTavern.getContext();
    const recent     = chat.slice(-msgCount);
    const transcript = recent.map(m => `${m.name}: ${m.mes}`).join('\n');

    const messages = [
        {
            role:    'system',
            content: systemPrompt,
        },
        {
            role:    'user',
            content: `Write a lorebook entry for the topic: "${topic}"\n\nRecent conversation:\n${transcript}`,
        },
    ];

    status.textContent    = 'Generating…';
    generateBtn.disabled  = true;

    try {
        const content = await loreMgrFetch(messages, settings.createProfileId);

        const data  = await loadWorldInfo(bookName);
        const entry = createWorldInfoEntry(bookName, data);

        entry.comment  = topic;
        entry.key      = keywords;
        entry.content  = content;

        const d        = settings.entryDefaults;
        entry.position = d.position  ?? 0;
        entry.depth    = d.depth     ?? 4;
        entry.order    = d.order     ?? 100;
        entry.constant = d.constant  ?? false;
        if (d.scanDepth != null) entry.scanDepth = d.scanDepth;

        await saveWorldInfo(bookName, data, true);

        status.textContent = `✓ Entry "${topic}" created.`;
        panel.querySelector('.loreMgr-topic-input').value    = '';
        panel.querySelector('.loreMgr-keywords-input').value = '';
        delete panel.querySelector('.loreMgr-keywords-input').dataset.userEdited;

        setTimeout(() => {
            if (panel.isConnected) {
                panel.querySelector('.loreMgr-creation-form').style.display = 'none';
                panel.querySelector('.loreMgr-form-status').textContent = '';
            }
        }, 2200);

        await renderPanelEntries(panel, bookName);
    } catch (err) {
        status.textContent = `Error: ${err.message}`;
        let e = err;
        let depth = 0;
        while (e) {
            console.error(`[LoreManager] Error[${depth}]:`, e.message, e);
            e = e.cause;
            depth++;
        }
    } finally {
        generateBtn.disabled = false;
    }
}

// ============================================================
// Entry rendering
// ============================================================

async function renderPanelEntries(panel, bookName) {
    const listEl = panel.querySelector('.loreMgr-entry-list');
    listEl.innerHTML = '<div class="loreMgr-loading">Loading entries…</div>';

    try {
        const data     = await loadWorldInfo(bookName);
        const entries  = Object.values(data.entries)
            .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
        const settings    = getSettings();
        const evolvingSet = new Set(settings.evolvingEntries?.[bookName] ?? []);

        listEl.innerHTML = '';

        if (entries.length === 0) {
            listEl.innerHTML = '<div class="loreMgr-empty">No entries yet.</div>';
            return;
        }

        for (const entry of entries) {
            listEl.appendChild(buildEntryRow(entry, bookName, evolvingSet, data));
        }
    } catch (err) {
        listEl.innerHTML = `<div class="loreMgr-error">Error loading entries: ${escapeHtml(err.message)}</div>`;
        console.error('[LoreManager] Load entries error:', err);
    }
}

function buildEntryRow(entry, bookName, evolvingSet, data) {
    const isEvolving = evolvingSet.has(entry.uid);
    const title      = entry.comment || entry.key?.[0] || 'Untitled';
    const contentStr = entry.content ?? '';
    const preview    = contentStr.length > 120 ? `${contentStr.slice(0, 120)}…` : contentStr;
    const keywords   = (entry.key ?? [])
        .map(k => `<span class="loreMgr-chip">${escapeHtml(k)}</span>`)
        .join('');

    const row        = document.createElement('div');
    row.className    = 'loreMgr-entry-row';
    row.dataset.uid  = String(entry.uid);
    row.innerHTML    = `
        <div class="loreMgr-entry-summary">
            <div class="loreMgr-entry-title-row">
                <span class="loreMgr-entry-title">${escapeHtml(title)}</span>
                ${isEvolving ? '<span class="loreMgr-evolve-badge" title="Evolving entry">♻</span>' : ''}
            </div>
            <span class="loreMgr-entry-preview">${escapeHtml(preview)}</span>
        </div>
        <div class="loreMgr-entry-detail" style="display:none;">
            <div class="loreMgr-keywords">${keywords}</div>
            <textarea class="loreMgr-content-edit text_pole">${escapeHtml(contentStr)}</textarea>
            <div class="loreMgr-detail-actions">
                <button class="loreMgr-save-btn menu_button">Save</button>
                <label class="loreMgr-evolve-label">
                    <input type="checkbox" class="loreMgr-evolve-toggle"${isEvolving ? ' checked' : ''}>
                    <span>Evolving ♻</span>
                </label>
            </div>
        </div>`;

    // Toggle expand/collapse on summary click
    row.querySelector('.loreMgr-entry-summary').addEventListener('click', () => {
        const detail = row.querySelector('.loreMgr-entry-detail');
        detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });

    // Save edited content
    row.querySelector('.loreMgr-save-btn').addEventListener('click', async () => {
        const newContent = row.querySelector('.loreMgr-content-edit').value;
        try {
            data.entries[entry.uid].content = newContent;
            await saveWorldInfo(bookName, data, true);
            entry.content = newContent;
            const newPreview = newContent.length > 120 ? `${newContent.slice(0, 120)}…` : newContent;
            row.querySelector('.loreMgr-entry-preview').textContent = newPreview;
        } catch (err) {
            console.error('[LoreManager] Save entry error:', err);
        }
    });

    // Evolving toggle
    row.querySelector('.loreMgr-evolve-toggle').addEventListener('change', e => {
        const checked = e.target.checked;
        setEvolvingFlag(bookName, entry.uid, checked);

        const titleRow = row.querySelector('.loreMgr-entry-title-row');
        const badge    = titleRow.querySelector('.loreMgr-evolve-badge');

        if (checked && !badge) {
            const b       = document.createElement('span');
            b.className   = 'loreMgr-evolve-badge';
            b.title       = 'Evolving entry';
            b.textContent = '♻';
            titleRow.appendChild(b);
        } else if (!checked && badge) {
            badge.remove();
        }
    });

    return row;
}

function setEvolvingFlag(bookName, uid, enabled) {
    const settings = getSettings();
    if (!settings.evolvingEntries)          settings.evolvingEntries = {};
    if (!settings.evolvingEntries[bookName]) settings.evolvingEntries[bookName] = [];

    const list = settings.evolvingEntries[bookName];
    const idx  = list.indexOf(uid);

    if (enabled && idx === -1)   list.push(uid);
    if (!enabled && idx !== -1)  list.splice(idx, 1);

    SillyTavern.getContext().saveSettingsDebounced();
}

function refreshOpenPanel(bookName) {
    const panel = document.getElementById(`loreMgr-panel-${safeId(bookName)}`);
    if (panel) renderPanelEntries(panel, bookName);
}

// ============================================================
// Evolution — tracking
// ============================================================

/** Return the lorebook name that owns this UID if it is marked evolving, else null. */


// ============================================================
// Evolution — post-completion processing
// ============================================================

async function handleMessageReceived() {
    if (evolutionRunning) {
        console.log('[LoreManager] MESSAGE_RECEIVED — evolution already running, skipping');
        return;
    }

    const settings = getSettings();
    console.log('[LoreManager] MESSAGE_RECEIVED — evolvingEntries:', JSON.stringify(settings.evolvingEntries));

    // Build the flat list of all flagged entries from settings directly
    const toProcess = [];
    for (const [bookName, uids] of Object.entries(settings.evolvingEntries ?? {})) {
        for (const uid of (uids ?? [])) {
            toProcess.push({ bookName, uid });
        }
    }

    console.log(`[LoreManager] MESSAGE_RECEIVED — ${toProcess.length} evolving entry/entries total`);
    if (toProcess.length === 0) {
        console.log('[LoreManager]   No entries flagged for evolution — done');
        return;
    }
    console.log(`[LoreManager]   Will process: ${toProcess.map(p => `${p.bookName}#${p.uid}`).join(', ')}`);

    const ctx  = SillyTavern.getContext();
    const chat = ctx.chat;
    if (!chat?.length) {
        console.warn('[LoreManager]   Aborting — chat is empty');
        return;
    }

    const lastAi   = [...chat].reverse().find(m => !m.is_user);
    const lastUser = [...chat].reverse().find(m =>  m.is_user);
    if (!lastAi || !lastUser) {
        console.warn('[LoreManager]   Aborting — could not find last user + AI messages in chat');
        return;
    }

    if (!settings.evolveProfileId) {
        console.warn('[LoreManager]   Aborting — no Evolution Profile selected in settings');
        return;
    }
    console.log(`[LoreManager]   Using evolution profile: ${settings.evolveProfileId}`);

    evolutionRunning = true;
    try {
    for (const { bookName, uid } of toProcess) {
        try {
            const label = `${bookName}#${uid}`;
            console.log(`[LoreManager]   ↳ Evolving ${label} ...`);

            const data  = await loadWorldInfo(bookName);
            const entry = data.entries[uid];
            if (!entry) {
                console.warn(`[LoreManager]     uid ${uid} not found in book "${bookName}" — skipping`);
                continue;
            }

            const entryLabel = entry.comment || entry.key?.[0] || '(unnamed)';
            console.log(`[LoreManager]     Entry: "${entryLabel}" (${(entry.content ?? '').length} chars)`);
            console.log(`[LoreManager]     Current content preview:`, (entry.content ?? '').slice(0, 150));

            const messages = [
                {
                    role:    'system',
                    content: settings.evolveSystemPrompt,
                },
                {
                    role:    'user',
                    content: `Current entry:\n"""\n${entry.content}\n"""\n\n`
                           + `Recent exchange:\nUser: ${lastUser.mes}\nAI: ${lastAi.mes}\n\n`
                           + `Should this entry be updated?`,
                },
            ];

            console.log('[LoreManager]     Sending evolution request to LLM ...');
            const newContent = await loreMgrFetch(messages, settings.evolveProfileId);
            console.log(`[LoreManager]     LLM response (${(newContent ?? '').length} chars):`, (newContent ?? '').slice(0, 200));

            if (!newContent || /^(n\/a|no_update)$/i.test(newContent.trim())) {
                console.log('[LoreManager]     LLM indicated no update needed — skipping');
                continue;
            }

            console.log(`[LoreManager]     Applying evolution (mode: ${settings.evolutionMode}) ...`);
            await applyEvolution(bookName, uid, entry, data, newContent, settings);
        } catch (err) {
            let e = err;
            while (e) { console.error(`[LoreManager] Evolution error (${bookName}#${uid}):`, e); e = e.cause; }
        }
    }
    console.log('[LoreManager]   Evolution pass complete');
    } finally {
        evolutionRunning = false;
    }
}

async function applyEvolution(bookName, uid, entry, data, newContent, settings) {
    switch (settings.evolutionMode) {
        case 'auto':
            data.entries[uid].content = newContent;
            await saveWorldInfo(bookName, data, true);
            refreshOpenPanel(bookName);
            break;

        case 'confirm':
            showDiffModal(bookName, uid, entry, data, newContent);
            break;

        case 'timeout':
            showEvolutionToast(bookName, uid, entry, data, newContent, settings.evolutionTimeout ?? 30);
            break;

        default:
            break;
    }
}

// ============================================================
// Evolution — confirm (diff modal)
// ============================================================

function showDiffModal(bookName, uid, entry, data, newContent) {
    const title   = entry.comment || entry.key?.[0] || 'Entry';
    const overlay = document.createElement('div');
    overlay.className = 'loreMgr-diff-overlay';
    overlay.innerHTML = `
        <div class="loreMgr-diff-modal" role="dialog" aria-modal="true" aria-label="Entry update proposal">
            <div class="loreMgr-diff-header">
                <strong>Evolving Entry — Proposed Update</strong>
                <span class="loreMgr-diff-subtitle">${escapeHtml(bookName)} &rsaquo; ${escapeHtml(title)}</span>
            </div>
            <div class="loreMgr-diff-body">
                <div class="loreMgr-diff-col loreMgr-diff-old">
                    <div class="loreMgr-diff-label">Current</div>
                    <div class="loreMgr-diff-text">${escapeHtml(entry.content ?? '')}</div>
                </div>
                <div class="loreMgr-diff-col loreMgr-diff-new">
                    <div class="loreMgr-diff-label">Proposed</div>
                    <div class="loreMgr-diff-text">${escapeHtml(newContent)}</div>
                </div>
            </div>
            <div class="loreMgr-diff-actions">
                <button class="loreMgr-accept-btn menu_button">Accept</button>
                <button class="loreMgr-reject-btn menu_button">Reject</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('.loreMgr-accept-btn').addEventListener('click', async () => {
        overlay.remove();
        data.entries[uid].content = newContent;
        await saveWorldInfo(bookName, data, true);
        refreshOpenPanel(bookName);
    });

    overlay.querySelector('.loreMgr-reject-btn').addEventListener('click', () => overlay.remove());

    // Close on backdrop click
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ============================================================
// Evolution — timeout (toast)
// ============================================================

function showEvolutionToast(bookName, uid, entry, data, newContent, timeoutSecs) {
    const title   = entry.comment || entry.key?.[0] || 'Entry';
    const preview = newContent.length > 140 ? `${newContent.slice(0, 140)}…` : newContent;

    const toast   = document.createElement('div');
    toast.className = 'loreMgr-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
        <div class="loreMgr-toast-header">
            <strong>Entry update ready:</strong> ${escapeHtml(title)}
        </div>
        <div class="loreMgr-toast-body">${escapeHtml(preview)}</div>
        <div class="loreMgr-toast-bar"><div class="loreMgr-toast-progress"></div></div>
        <div class="loreMgr-toast-actions">
            <button class="loreMgr-dismiss-btn menu_button">Dismiss</button>
        </div>`;

    document.body.appendChild(toast);

    let cancelled = false;
    toast.querySelector('.loreMgr-dismiss-btn').addEventListener('click', () => {
        cancelled = true;
        toast.remove();
    });

    // Animate progress bar from 100 → 0 %
    const bar    = toast.querySelector('.loreMgr-toast-progress');
    bar.style.width = '100%';
    requestAnimationFrame(() => {
        bar.style.transition = `width ${timeoutSecs}s linear`;
        bar.style.width = '0%';
    });

    setTimeout(async () => {
        if (cancelled) return;
        toast.remove();
        data.entries[uid].content = newContent;
        await saveWorldInfo(bookName, data, true);
        refreshOpenPanel(bookName);
    }, timeoutSecs * 1000);
}

// ============================================================
// Settings UI wiring
// ============================================================

function wireSettingsUi() {
    const ctx = SillyTavern.getContext();
    const s   = getSettings();

    // Connection profile dropdowns
    const svc = ctx.ConnectionManagerRequestService;
    if (svc) {
        try {
            svc.handleDropdown(
                '#loreMgr-create-profile',
                s.createProfileId,
                profile => { s.createProfileId = profile?.id ?? null; ctx.saveSettingsDebounced(); },
                () => {},
                () => {},
                del => { if (del?.id === s.createProfileId) { s.createProfileId = null; ctx.saveSettingsDebounced(); } },
            );
            svc.handleDropdown(
                '#loreMgr-evolve-profile',
                s.evolveProfileId,
                profile => { s.evolveProfileId = profile?.id ?? null; ctx.saveSettingsDebounced(); },
                () => {},
                () => {},
                del => { if (del?.id === s.evolveProfileId) { s.evolveProfileId = null; ctx.saveSettingsDebounced(); } },
            );
        } catch (err) {
            console.warn('[LoreManager] Profile dropdowns unavailable:', err);
            document.querySelectorAll('.loreMgr-profile-select').forEach(el => {
                el.insertAdjacentHTML(
                    'afterend',
                    '<span class="loreMgr-warn">Connection Manager extension not found.</span>',
                );
                el.style.display = 'none';
            });
        }
    } else {
        // ConnectionManagerRequestService not present on context
        document.querySelectorAll('.loreMgr-profile-select').forEach(el => {
            el.insertAdjacentHTML(
                'afterend',
                '<span class="loreMgr-warn">Install the Connection Manager extension to enable LLM profiles.</span>',
            );
            el.style.display = 'none';
        });
    }

    // Numeric inputs — set initial values then listen for changes
    bindNum('loreMgr-default-msg-count',  () => s.defaultMsgCount,          v => { s.defaultMsgCount          = v; });
    bindNum('loreMgr-default-max-tokens', () => s.defaultMaxTokens,         v => { s.defaultMaxTokens         = v; });
    bindNum('loreMgr-default-position',   () => s.entryDefaults.position,   v => { s.entryDefaults.position   = v; });
    bindNum('loreMgr-default-depth',      () => s.entryDefaults.depth,      v => { s.entryDefaults.depth      = v; });
    bindNum('loreMgr-default-order',      () => s.entryDefaults.order,      v => { s.entryDefaults.order      = v; });
    bindNum('loreMgr-evolution-timeout',  () => s.evolutionTimeout,         v => { s.evolutionTimeout         = v; });

    // Constant checkbox
    const constEl = document.getElementById('loreMgr-default-constant');
    if (constEl) {
        constEl.checked = !!s.entryDefaults.constant;
        constEl.addEventListener('change', () => {
            s.entryDefaults.constant = constEl.checked;
            ctx.saveSettingsDebounced();
        });
    }

    // Evolution mode radios
    document.querySelectorAll('[name="loreMgr-evolution-mode"]').forEach(radio => {
        radio.checked = radio.value === s.evolutionMode;
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            s.evolutionMode = radio.value;
            ctx.saveSettingsDebounced();
            refreshTimeoutRowVisibility();
        });
    });

    refreshTimeoutRowVisibility();

    // Prompt textareas
    bindTextarea('loreMgr-create-prompt', () => s.createSystemPrompt, v => { s.createSystemPrompt = v; });
    bindTextarea('loreMgr-evolve-prompt', () => s.evolveSystemPrompt, v => { s.evolveSystemPrompt = v; });

    // Preset management
    renderPresetList();
    document.getElementById('loreMgr-add-preset-btn')?.addEventListener('click', () => openPresetForm(null));
    const presetFormEl = document.getElementById('loreMgr-preset-form');
    presetFormEl?.querySelector('#loreMgr-pf-save')?.addEventListener('click', savePresetForm);
    presetFormEl?.querySelector('#loreMgr-pf-cancel')?.addEventListener('click', () => {
        presetFormEl.style.display = 'none';
    });
}

function bindNum(id, getter, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = String(getter());
    el.addEventListener('change', () => {
        setter(Number(el.value));
        SillyTavern.getContext().saveSettingsDebounced();
    });
}

function refreshTimeoutRowVisibility() {
    const row = document.getElementById('loreMgr-timeout-row');
    if (row) row.style.display = getSettings().evolutionMode === 'timeout' ? '' : 'none';
}

function bindTextarea(id, getter, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = getter();
    el.addEventListener('input', () => {
        setter(el.value);
        SillyTavern.getContext().saveSettingsDebounced();
    });
}

function renderPresetList() {
    const listEl = document.getElementById('loreMgr-preset-list');
    if (!listEl) return;
    const s = getSettings();

    if (!s.promptPresets?.length) {
        listEl.innerHTML = '<div class="loreMgr-preset-empty">No presets yet.</div>';
        return;
    }

    listEl.innerHTML = '';
    for (const preset of s.promptPresets) {
        const row   = document.createElement('div');
        row.className = 'loreMgr-preset-row';
        const badge = preset.scope === 'global'
            ? `<span class="loreMgr-scope-badge loreMgr-scope-global">Global</span>`
            : `<span class="loreMgr-scope-badge loreMgr-scope-chat" title="${escapeAttr(preset.chatId ?? '')}">Chat</span>`;
        row.innerHTML = `
            <span class="loreMgr-preset-name">${escapeHtml(preset.name)}</span>
            ${badge}
            <div class="loreMgr-preset-actions">
                <button class="loreMgr-preset-edit-btn menu_button" data-id="${escapeAttr(preset.id)}">Edit</button>
                <button class="loreMgr-preset-delete-btn menu_button" data-id="${escapeAttr(preset.id)}">Delete</button>
            </div>`;
        row.querySelector('.loreMgr-preset-edit-btn').addEventListener('click', () => openPresetForm(preset.id));
        row.querySelector('.loreMgr-preset-delete-btn').addEventListener('click', () => {
            const s2 = getSettings();
            s2.promptPresets = s2.promptPresets.filter(p => p.id !== preset.id);
            SillyTavern.getContext().saveSettingsDebounced();
            renderPresetList();
        });
        listEl.appendChild(row);
    }
}

function openPresetForm(presetId) {
    const s        = getSettings();
    const existing = presetId ? s.promptPresets.find(p => p.id === presetId) : null;
    const formEl   = document.getElementById('loreMgr-preset-form');
    if (!formEl) return;

    const chatId = SillyTavern.getContext().chatId ?? null;

    formEl.querySelector('#loreMgr-pf-name').value   = existing?.name ?? '';
    formEl.querySelector('#loreMgr-pf-prompt').value = existing?.systemPrompt ?? s.createSystemPrompt;

    const scopeGlobal = formEl.querySelector('#loreMgr-pf-scope-global');
    const scopeChat   = formEl.querySelector('#loreMgr-pf-scope-chat');
    scopeGlobal.checked = !existing || existing.scope === 'global';
    scopeChat.checked   = existing?.scope === 'chat';
    scopeChat.disabled  = !chatId;

    const chatLbl = formEl.querySelector('.loreMgr-pf-chat-label');
    chatLbl.textContent = chatId
        ? `This Chat (${chatId.length > 28 ? chatId.slice(0, 28) + '\u2026' : chatId})`
        : 'This Chat (no chat open)';

    formEl.dataset.editingId = presetId ?? '';
    formEl.style.display     = 'block';
    formEl.querySelector('#loreMgr-pf-name').focus();
}

function savePresetForm() {
    const s      = getSettings();
    const formEl = document.getElementById('loreMgr-preset-form');
    if (!formEl) return;

    const name = formEl.querySelector('#loreMgr-pf-name').value.trim();
    if (!name) { formEl.querySelector('#loreMgr-pf-name').focus(); return; }

    const systemPrompt = formEl.querySelector('#loreMgr-pf-prompt').value;
    const scope  = formEl.querySelector('#loreMgr-pf-scope-chat').checked ? 'chat' : 'global';
    const chatId = scope === 'chat' ? (SillyTavern.getContext().chatId ?? null) : null;

    const editingId = formEl.dataset.editingId;
    if (editingId) {
        const existing = s.promptPresets.find(p => p.id === editingId);
        if (existing) {
            existing.name         = name;
            existing.systemPrompt = systemPrompt;
            existing.scope        = scope;
            existing.chatId       = chatId;
        }
    } else {
        s.promptPresets.push({ id: crypto.randomUUID(), name, scope, chatId, systemPrompt });
    }

    SillyTavern.getContext().saveSettingsDebounced();
    formEl.style.display = 'none';
    renderPresetList();
}

function populatePresetSelect(select) {
    if (!select) return;
    const s      = getSettings();
    const chatId = SillyTavern.getContext().chatId ?? null;

    select.innerHTML = '';
    const defOpt       = document.createElement('option');
    defOpt.value       = 'default';
    defOpt.textContent = 'Default';
    select.appendChild(defOpt);

    const globals      = s.promptPresets?.filter(p => p.scope === 'global') ?? [];
    const chatSpecific = chatId
        ? (s.promptPresets?.filter(p => p.scope === 'chat' && p.chatId === chatId) ?? [])
        : [];

    if (globals.length) {
        const grp = document.createElement('optgroup');
        grp.label = 'Global';
        for (const p of globals) {
            const opt       = document.createElement('option');
            opt.value       = p.id;
            opt.textContent = p.name;
            grp.appendChild(opt);
        }
        select.appendChild(grp);
    }

    if (chatSpecific.length) {
        const grp = document.createElement('optgroup');
        grp.label = 'This Chat';
        for (const p of chatSpecific) {
            const opt       = document.createElement('option');
            opt.value       = p.id;
            opt.textContent = p.name;
            grp.appendChild(opt);
        }
        select.appendChild(grp);
    }
}

function resolvePresetPrompt(presetId) {
    const s = getSettings();
    if (!presetId || presetId === 'default') return s.createSystemPrompt;
    const preset = s.promptPresets?.find(p => p.id === presetId);
    return preset?.systemPrompt ?? s.createSystemPrompt;
}

// ============================================================
// Event wiring
// ============================================================

function wireEvents() {
    const { eventSource, eventTypes } = SillyTavern.getContext();

    // Guard every registration — older ST builds may not expose all event types
    function safeOn(type, handler) {
        if (type == null) {
            console.warn('[LoreManager] safeOn: skipping null/undefined event type — handler not registered:', handler.toString().slice(0, 80));
            return;
        }
        eventSource.on(type, handler);
    }

    // Dump the event type values we depend on so we can catch missing/renamed events
    console.log('[LoreManager] wireEvents — event type values:',
        'GENERATION_STARTED=', eventTypes.GENERATION_STARTED,
        'WORLDINFO_ACTIVATED=', eventTypes.WORLDINFO_ACTIVATED,
        'MESSAGE_RECEIVED=',   eventTypes.MESSAGE_RECEIVED);

    // GENERATION_STARTED: reset the concurrency guard in case a previous run was interrupted
    safeOn(eventTypes.GENERATION_STARTED, () => {
        console.log('[LoreManager] GENERATION_STARTED — resetting evolutionRunning guard');
        evolutionRunning = false;
    });

    // WORLDINFO_ACTIVATED is undefined in ST 1.18 — entries are collected directly in handleMessageReceived
    if (eventTypes.WORLDINFO_ACTIVATED != null) {
        console.log('[LoreManager] WORLDINFO_ACTIVATED is available — registering (unused in current build)');
    }

    safeOn(eventTypes.MESSAGE_RECEIVED, () => {
        handleMessageReceived();
    });

    // WORLDINFO_UPDATED fires as (name, data) — use first arg as name
    safeOn(eventTypes.WORLDINFO_UPDATED, (nameOrObj) => {
        const name = typeof nameOrObj === 'string' ? nameOrObj : nameOrObj?.name;
        if (name) refreshOpenPanel(name);
    });
}

// ============================================================
// Bootstrap
// ============================================================

(async () => {
    const {
        eventSource,
        eventTypes,
        extensionSettings,
    } = SillyTavern.getContext();

    // Deep-merge saved settings with defaults so new fields are always present
    const saved = extensionSettings[MODULE] ?? {};

    // Sanitize profile IDs — previous versions may have persisted full profile objects
    const sanitizeProfileId = v => (typeof v === 'object' ? v?.id ?? null : v ?? null);

    extensionSettings[MODULE] = {
        ...DEFAULT_SETTINGS,
        ...saved,
        createProfileId: sanitizeProfileId(saved.createProfileId),
        evolveProfileId: sanitizeProfileId(saved.evolveProfileId),
        entryDefaults: {
            ...DEFAULT_SETTINGS.entryDefaults,
            ...(saved.entryDefaults ?? {}),
        },
        panelPositions:  saved.panelPositions  ?? {},
        evolvingEntries: saved.evolvingEntries ?? {},
        promptPresets:   saved.promptPresets   ?? [],
    };

    // Inject settings panel HTML inline — avoids template-loader 404
    $('#extensions_settings2').append(SETTINGS_HTML);

    // APP_READY auto-fires for late listeners, so this is safe regardless of
    // whether the extension loaded before or after the app became ready.
    eventSource.on(eventTypes.APP_READY, () => {
        wireSettingsUi();
        initTopBarButton();
        wireEvents();
    });
})();
