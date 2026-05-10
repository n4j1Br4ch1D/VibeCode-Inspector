const VibeCodeConfig = {
    configs: {
        outputTarget: { id: 'config-output-target', label: 'Output Target', default: 'ide', type: 'select', options: [{ val: 'ide', text: 'IDE Chat' }, { val: 'file', text: 'Save to IDE file' }, { val: 'api', text: 'Send to Webhook/API' }, { val: 'mcp', text: 'MCP (Model Context Protocol)' }, { val: 'cli', text: 'Local CLI / Shell' }] },
        targetProject: { id: 'config-project', label: 'Target IDE', default: 'antigravity', type: 'select', options: [{ val: 'antigravity', text: 'Antigravity' }, { val: 'cursor', text: 'Cursor' }, { val: 'windsurf', text: 'Windsurf' }, { val: 'vscode', text: 'VS Code' }] },
        chatType: { id: 'config-chat-type', label: 'Chat Type', default: 'same', type: 'select', options: [{ val: 'same', text: 'Same Chat' }, { val: 'new', text: 'New Chat' }] },
        taskFileName: { id: 'config-task-file', label: 'Save to file name', default: 'report.md', type: 'string' },
        webhookUrl: { id: 'config-webhook-url', label: 'Webhook URL', default: '', type: 'string' },
        mcpUrl: { id: 'config-mcp-url', label: 'MCP Host URL', default: 'http://localhost:3000', type: 'string' },
        cliCommand: { id: 'config-cli-command', label: 'CLI Command (pipe to)', default: 'pbcopy', type: 'string' },
        modelSelection: { id: 'config-model', label: 'Model', default: 'auto', type: 'select', options: [{ val: 'auto', text: 'Auto Model' }, { val: 'gemini-1.5-pro', text: 'Gemini 1.5 Pro' }, { val: 'gpt-4o', text: 'GPT-4o' }] },
        hotReloadEnabled: { id: 'config-hot-reload', label: 'Hot Reload', default: false, type: 'boolean' },
        enableHistorySug: { id: 'config-history-sug', label: 'History Suggest', default: false, type: 'boolean' },
        enableActionSug: { id: 'config-action-sug', label: 'Actions Suggest', default: false, type: 'boolean' },
        enableDirectRun: { id: 'config-direct-run', label: 'Direct Run Prompt', default: false, type: 'boolean' },
        enablePromptImprove: { id: 'config-prompt-improve', label: 'Prompt Improver', default: false, type: 'boolean' },
        enableModalDrag: { id: 'config-modal-drag', label: 'Modal Dragging', default: true, type: 'boolean' },
        enableModalResize: { id: 'config-modal-resize', label: 'Modal Resizing', default: false, type: 'boolean' },
        enableMultiSelect: { id: 'config-multi-select', label: 'Enable MultiSelect', default: false, type: 'boolean' },
        enableCopyPrompt: { id: 'config-copy-prompt', label: 'Enable Copy Prompt', default: true, type: 'boolean' },
        confirmBeforeSend: { id: 'config-confirm-send', label: 'Confirm Before Send', default: true, type: 'boolean' },
        enableVibeTextArea: { id: 'config-vibe-textarea', label: 'Enable Instructions', default: true, type: 'boolean' },
        captureSelection: { id: 'config-capture-selection', label: 'Capture Selection', default: false, type: 'boolean' },
        selectorType: { id: 'config-selector-type', label: 'Selector Type', default: 'auto', type: 'select', options: [{ val: 'auto', text: 'Auto (Smart)' }, { val: 'semantic', text: 'Semantic (ARIA/Role)' }, { val: 'data-testid', text: 'Data Test ID' }, { val: 'css', text: 'Standard CSS' }, { val: 'css-strict', text: 'Strict CSS Path' }, { val: 'xpath', text: 'XPath' }, { val: 'component', text: 'Framework Component' }] },
        captureLogs: { id: 'config-capture-logs', label: 'Capture Logs', default: 'none', type: 'select', options: [{ val: 'none', text: 'None' }, { val: 'error', text: 'Errors Only' }, { val: 'all', text: 'All Logs' }] },
        captureNetwork: { id: 'config-capture-network', label: 'Capture Network', default: 'none', type: 'select', options: [{ val: 'none', text: 'None' }, { val: 'all', text: 'All Activity' }] },
        includePageInfo: { id: 'config-page-info', label: 'Include Page Info', default: false, type: 'boolean' },
        includeBrowserInfo: { id: 'config-browser-info', label: 'Include Browser Info', default: false, type: 'boolean' },
        captureHTML: { id: 'config-capture-html', label: 'Captured HTML', default: false, type: 'boolean' },
        captureImages: { id: 'config-capture-images', label: 'Captured Images', default: false, type: 'boolean' },
        captureCSS: { id: 'config-capture-css', label: 'Captured CSS', default: false, type: 'boolean' },
        includeDynamicState: { id: 'config-dynamic-state', label: 'Capture Dynamic State', default: false, type: 'boolean' },
        captureJSContext: { id: 'config-js-context', label: 'Capture JS Context (React/Vue/Events)', default: false, type: 'boolean' },
        enableIframeCapture: { id: 'config-iframe-capture', label: 'Capture Elements in Iframes', default: false, type: 'boolean' },
        enableCrossSiteCapture: { id: 'config-cross-site', label: 'Enable Cross-Site Capture', default: false, type: 'boolean' },
        captureElementScreenshots: { id: 'config-element-screenshots', label: 'Capture Element Screenshots', default: true, type: 'boolean' },
        recordActions: { id: 'config-record-actions', label: 'Record Actions', default: false, type: 'boolean' },
        mainTemplate: { id: 'config-main-template', label: 'Main Layout', default: '{instruction}\n\n{html}\n\n{js_context}\n\n{dynamic_state}\n\n{element_screenshots}\n\n{css}\n\n{logs}\n\n{network}\n\n{page_info}\n\n{browser_info}\n\n{actions}\n\n{selected_text}\n\n{images}', type: 'textarea' },
        templateInstruction: { id: 'config-tpl-instruction', label: 'Instruction Template', default: 'I want to improve the following UI element (`{selector}`) to do the following:\n"{instruction}"\n\nPlease also ensure it looks premium and modern.', type: 'textarea' },
        templateHTML: { id: 'config-tpl-html', label: 'HTML Template', default: '### HTML Context\n```html\n{html}\n```', type: 'textarea' },
        templateDynamicState: { id: 'config-tpl-dynamic', label: 'Dynamic State Template', default: '### Dynamic State (Values/Scroll)\n```json\n{dynamic_state}\n```', type: 'textarea' },
        templateElementScreenshots: { id: 'config-tpl-el-screenshots', label: 'Element Screenshots Template', default: '### Element Screenshots (Visual Reference)\n{element_screenshots}', type: 'textarea' },
        templateCSS: { id: 'config-tpl-css', label: 'CSS Template', default: '### CSS Styles\n```css\n{css}\n```', type: 'textarea' },
        templateLogs: { id: 'config-tpl-logs', label: 'Logs Template', default: '### Console Logs\n```json\n{logs}\n```', type: 'textarea' },
        templateNetwork: { id: 'config-tpl-network', label: 'Network Template', default: '### Network Activity\n```json\n{network}\n```', type: 'textarea' },
        templatePageInfo: { id: 'config-tpl-page', label: 'Page Info Template', default: '### Page URL\n{page_info}', type: 'textarea' },
        templateBrowserInfo: { id: 'config-tpl-browser', label: 'Browser Info Template', default: '### Browser Info\n{browser_info}', type: 'textarea' },
        templateActions: { id: 'config-tpl-actions', label: 'Actions Template', default: '### User Actions\n```json\n{actions}\n```', type: 'textarea' },
        templateSelectedText: { id: 'config-tpl-text', label: 'Selected Text Template', default: '### Selected Text\n{selected_text}', type: 'textarea' },
        templateJSContext: { id: 'config-tpl-js', label: 'JS Context Template', default: '### JS Context (React/Vue/Events)\n```json\n{js_context}\n```', type: 'textarea' },
        templateImages: { id: 'config-tpl-images', label: 'Images Template', default: '### Captured Images\n{images}', type: 'textarea' },
        customPresets: { id: 'config-custom-presets', label: 'Custom Actions Presets (use - )', default: "- Make it look more premium and modern.\n- Tailwind Optimizer: Refactor using clean Tailwind classes.\n- Add smooth glassmorphism effects.\n- Ensure full mobile responsiveness.\n- Improve accessibility (A11y).\n- Refactor into a reusable component.", type: 'textarea' }
    },

    tabs: [
        { id: 'ide', label: 'IDE', keys: ['outputTarget', 'targetProject', 'chatType', 'modelSelection', 'enableDirectRun', 'taskFileName', 'webhookUrl', 'mcpUrl', 'cliCommand'] },
        { id: 'data', label: 'Capture', keys: ['captureLogs', 'captureNetwork', 'includePageInfo', 'includeBrowserInfo', 'captureHTML', 'includeDynamicState', 'captureJSContext', 'enableIframeCapture', 'enableCrossSiteCapture', 'captureElementScreenshots', 'captureImages', 'captureCSS', 'recordActions', 'captureSelection'] },
        { id: 'advanced', label: 'Advanced', keys: ['confirmBeforeSend', 'hotReloadEnabled', 'enableVibeTextArea', 'enableHistorySug', 'enableActionSug', 'enablePromptImprove', 'enableModalDrag', 'enableModalResize', 'enableMultiSelect', 'enableCopyPrompt', 'selectorType'] },
        { id: 'templates', label: 'Templates', keys: ['mainTemplate', 'templateInstruction', 'templateHTML', 'templateDynamicState', 'templateElementScreenshots', 'templateCSS', 'templateLogs', 'templateNetwork', 'templatePageInfo', 'templateBrowserInfo', 'templateActions', 'templateSelectedText', 'templateJSContext', 'templateImages', 'customPresets'] },
        { id: 'info', label: 'Info', keys: [] }
    ],

    generateSettingsHTML: function (isPopup, res) {
        let html = '';
        const tBtnClass = isPopup ? 'tab-btn' : 'vibecode-tab-btn';
        const tContClass = isPopup ? 'tab-content' : 'vibecode-tab-content';
        const gridClass = isPopup ? 'config-section' : 'vibecode-settings-grid';
        const rowClass = isPopup ? 'config-row' : 'vibecode-settings-row';
        const selectClass = isPopup ? '' : 'vibecode-select';

        const tabsContainerClass = isPopup ? 'tabs' : 'vibecode-tabs';

        html += `<div class="${tabsContainerClass}">`;
        this.tabs.forEach((t, i) => {
            html += `<button class="${tBtnClass} ${i === 0 ? 'active' : ''}" data-tabTarget="${t.id}">${t.label}</button>`;
        });
        html += `</div>`;

        this.tabs.forEach((t, i) => {
            html += `<div id="tab-content-${t.id}" class="${tContClass} ${i === 0 ? 'active' : ''}">`;

            if (t.id === 'info') {
                html += `
                <div class="${gridClass}" style="grid-template-columns: 1fr; text-align: center; gap: 8px;">
                    <p style="margin:0; font-size:11px; color:#cbd5e1;"><strong>VibeCode Inspector</strong> v1.0.0</p>
                    <p style="margin:0; font-size:10px; color:#94a3b8;">Select elements on the page and seamlessly send them to your IDE with captured context.</p>
                    <p style="margin:0; font-size:10px; color:#f87171;">Don't forget to install the VibeCode IDE extension! <a href="https://vibecode.com/docs" target="_blank" style="color:#60a5fa; text-decoration:underline;">Read more</a></p>
                    <div style="display:flex; justify-content:center; gap:12px; margin-top:4px;">
                        <a href="https://vibecode.com" target="_blank" style="color:#3b82f6; text-decoration:none; font-size:11px; font-weight:600;">Website</a>
                        <a href="https://github.com" target="_blank" style="color:#3b82f6; text-decoration:none; font-size:11px; font-weight:600;">GitHub</a>
                    </div>
                </div>`;
            } else {
                html += `<div class="${gridClass}" style="${t.id === 'templates' ? 'grid-template-columns: 1fr;' : ''}">`;

                if (t.id === 'templates') {
                    html += `<div class="${rowClass}"><label>Template Editor</label><select id="vibecode-template-editor-select" class="${selectClass}">`;
                    t.keys.forEach(k => {
                        html += `<option value="${this.configs[k].id}">${this.configs[k].label}</option>`;
                    });
                    html += `</select></div>`;
                }

                t.keys.forEach(k => {
                    const conf = this.configs[k];
                    let val = res[k] ?? conf.default;
                    const isTemplateTab = t.id === 'templates';
                    const fieldClass = isTemplateTab ? `${rowClass} vibecode-template-field` : rowClass;
                    const fieldStyle = isTemplateTab ? 'display:none;' : '';

                    html += `<div class="${fieldClass}" data-fieldid="${conf.id}" style="${fieldStyle}"><label title="${conf.label}">${conf.label}</label>`;
                    if (conf.type === 'boolean') {
                        html += `<select id="${conf.id}" class="${selectClass}">
                            <option value="true" ${val === true ? 'selected' : ''}>Yes</option>
                            <option value="false" ${val === false ? 'selected' : ''}>No</option>
                        </select>`;
                    } else if (conf.type === 'select') {
                        html += `<select id="${conf.id}" class="${selectClass}">`;
                        conf.options.forEach(opt => {
                            html += `<option value="${opt.val}" ${val === opt.val ? 'selected' : ''}>${opt.text}</option>`;
                        });
                        html += `</select>`;
                    } else if (conf.type === 'textarea') {
                        html += `<textarea id="${conf.id}" class="${selectClass}" ${!isPopup ? 'style="min-height:80px;"' : ''}>${val}</textarea>`;
                        const vars = ['{selector}', '{instruction}', '{html}', '{dynamic_state}', '{element_screenshots}', '{css}', '{logs}', '{network}', '{page_info}', '{browser_info}', '{actions}', '{selected_text}', '{images}'];
                        html += `
                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                            ${vars.map(v => `<button type="button" class="vibecode-var-badge" data-var="${v}" style="font-size:9px; font-family:monospace; background:rgba(139, 92, 246, 0.15); color:#a78bfa; padding:1px 6px; border-radius:3px; border:1px solid rgba(139, 92, 246, 0.2); cursor:default; outline:none; transition:all 0.2s;">${v}</button>`).join('')}
                        </div>`;
                    } else if (conf.type === 'string') {
                        html += `<input type="text" id="${conf.id}" class="${selectClass}" value="${val}">`;
                    }
                    html += `</div>`;
                });
                html += `</div>`;
                if (t.id === 'advanced') {
                    const redStyle = 'background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.25); padding:6px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:600; transition:all 0.2s;';
                    html += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                        <button id="btn-reset-history" style="${redStyle}">Clear History</button>
                        <button id="btn-reset-templates" style="${redStyle}">Reset Templates</button>
                        <button id="btn-reset-presets" style="${redStyle}">Reset Presets</button>
                        <button id="btn-reset-settings" style="${redStyle}">Reset Settings</button>
                        <button id="btn-reset-cross-site" style="${redStyle} grid-column: span 2;">Clear Cross-Site Data</button>
                    </div>`;
                }
            }
            html += `</div>`;
        });

        return html;
    },

    getDefaults: function () {
        const defaults = {};
        for (let key in this.configs) {
            defaults[key] = this.configs[key].default;
        }
        return defaults;
    },

    getSettings: async function () {
        const defaults = this.getDefaults();
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(Object.keys(defaults), (result) => {
                    resolve({ ...defaults, ...result });
                });
            } else {
                resolve(defaults);
            }
        });
    }
};
