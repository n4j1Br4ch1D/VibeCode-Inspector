class VibeCodeExtension {
    constructor() {
        if (window.vibeCodeExtensionInitialized) return;
        window.vibeCodeExtensionInitialized = true;

        this.isActive = false;
        this.hoveredElement = null;
        this.selectedElements = [];
        this.popup = null;

        this.capturedLogs = [];
        this.capturedNetwork = [];
        this.recordedActions = [];
        this.capturedDynamicState = [];
        this.elementScreenshots = [];
        this.crossSiteStore = { sites: {} };
        this.viewingSite = 'current'; // 'current' or hostname
        this.selectedPages = new Set(); // set of URLs to include in prompt
        this.currentUrl = window.location.href;
        this.isTop = window === window.top;

        this.init();
    }

    init() {
        this.recordedActions = [];
        this.selectedText = '';
        this.res = {};
        this.presets = [];
        this.createToast();
        this.injectCaptureScript();
        this.bindEvents();
        console.log('✨ VibeCode Inspector Extension Injected');

        if (chrome && chrome.storage) {
            chrome.storage.local.get(['vibeCodeEnabled', 'crossSiteStore', 'selectedPages'], (result) => {
                if (result.crossSiteStore) this.crossSiteStore = result.crossSiteStore;
                if (result.selectedPages) this.selectedPages = new Set(result.selectedPages);
                if (result.vibeCodeEnabled) {
                    this.isActive = true;
                    this.showToast('VibeCode Inspector Activated');
                }
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.vibeCodeEnabled) {
                    this.isActive = changes.vibeCodeEnabled.newValue;
                    if (this.isActive) {
                        this.showToast('VibeCode Inspector Activated');
                    } else {
                        this.removeHighlight();
                        this.closePopup();
                        this.showToast('VibeCode Inspector Deactivated');
                    }
                }
                if (area === 'local' && changes.crossSiteStore) {
                    this.crossSiteStore = changes.crossSiteStore.newValue || { sites: {} };
                    if (this.popup) this.updateCapturedDataViews();
                }
                if (area === 'local' && changes.selectedPages) {
                    this.selectedPages = new Set(changes.selectedPages.newValue || []);
                    if (this.popup) this.updateCapturedDataViews();
                }
            });
        }
    }

    injectCaptureScript() {
        if (document.getElementById('vibecode-capture-script')) return;
        const script = document.createElement('script');
        script.id = 'vibecode-capture-script';
        script.textContent = `
            (function() {
                const sendMsg = (type, data) => window.postMessage({ source: 'vibecode', type, data }, '*');
                
                const origError = console.error;
                const origInfo = console.info;
                const origLog = console.log;
                
                console.error = function(...args) { sendMsg('LOG', { level: 'error', args: args.map(a => { try { return String(a); } catch(e) { return 'Unknown'; } }) }); origError.apply(console, args); };
                console.info = function(...args) { sendMsg('LOG', { level: 'info', args: args.map(a => { try { return String(a); } catch(e) { return 'Unknown'; } }) }); origInfo.apply(console, args); };
                console.log = function(...args) { sendMsg('LOG', { level: 'log', args: args.map(a => { try { return String(a); } catch(e) { return 'Unknown'; } }) }); origLog.apply(console, args); };
                
                const origFetch = window.fetch;
                window.fetch = async function(...args) {
                    sendMsg('NET', { url: typeof args[0] === 'string' ? args[0] : args[0]?.url, method: args[1]?.method || 'GET', type: 'fetch' });
                    return origFetch.apply(this, args);
                };
                
                const origXhrOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    sendMsg('NET', { url, method, type: 'xhr' });
                    return origXhrOpen.call(this, method, url, ...rest);
                };
            })();
        `;
        document.documentElement.appendChild(script);
    }

    createToast() {
        this.toast = document.createElement('div');
        this.toast.className = 'vibecode-toast';
        document.body.appendChild(this.toast);
    }

    showToast(message, duration = 3000) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), duration);
    }

    bindEvents() {
        document.addEventListener('mouseover', this.handleMouseOver.bind(this), true);
        document.addEventListener('mouseout', this.handleMouseOut.bind(this), true);
        document.addEventListener('click', this.handleClick.bind(this), true);
        document.addEventListener('input', this.handleUserAction.bind(this), true);
        document.addEventListener('change', this.handleUserAction.bind(this), true);

        window.addEventListener('message', (e) => {
            if (e.source !== window || !e.data || e.data.source !== 'vibecode') return;
            let updated = false;
            if (e.data.type === 'LOG') {
                this.capturedLogs.push(e.data.data);
                if (this.capturedLogs.length > 100) this.capturedLogs.shift();
                updated = true;
            } else if (e.data.type === 'NET') {
                this.capturedNetwork.push(e.data.data);
                if (this.capturedNetwork.length > 100) this.capturedNetwork.shift();
                updated = true;
            }
            if (updated && this.popup) {
                this.updateCapturedDataViews();
            }
        });

        window.addEventListener('resize', () => { if (!this.enableMultiSelect) this.closePopup(); });

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "toggleInspector") {
                this.toggleInspector();
                sendResponse({ isActive: this.isActive });
            } else if (request.action === "getStatus") {
                sendResponse({ isActive: this.isActive });
            } else if (request.action === "configChanged") {
                this.handleConfigChange(request.key, request.value);
            }
            return true;
        });
    }

    handleUserAction(e) {
        if (document.getElementById('vibecode-confirm-overlay')) return;
        if (e.target.closest('.vibecode-popup')) return;
        const tagName = e.target.tagName.toLowerCase();
        const id = e.target.id ? '#' + e.target.id : '';
        
        // Record action
        this.recordedActions.push({ type: e.type, target: tagName + id, value: e.target.value });
        if (this.recordedActions.length > 50) this.recordedActions.shift();

        // Real-time Dynamic State Update
        const selector = this.getSelectorForElement(e.target, 'auto');
        const stateKey = e.target.id || e.target.name || e.target.tagName.toLowerCase();
        let val = e.target.value;
        if (e.target.type === 'checkbox' || e.target.type === 'radio') val = e.target.checked;

        this.upsertState(selector, stateKey, val);

        if (this.popup) this.updateCapturedDataViews();
    }

    upsertState(elSelector, key, value) {
        const existingIdx = this.capturedDynamicState.findIndex(s => s.el === elSelector && s.key === key);
        if (existingIdx >= 0) {
            this.capturedDynamicState[existingIdx].value = value;
        } else {
            this.capturedDynamicState.push({ el: elSelector, key, value });
        }
    }

    toggleInspector() {
        this.isActive = !this.isActive;
        if (this.isActive) {
            this.showToast('VibeCode Inspector Activated');
        } else {
            this.removeHighlight();
            this.closePopup();
            this.showToast('VibeCode Inspector Deactivated');
        }
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: "iconStateChanged", isActive: this.isActive }).catch(() => { });
        }
    }

    handleMouseOver(e) {
        if (!this.isActive || document.getElementById('vibecode-confirm-overlay')) return;
        if (e.target.closest('.vibecode-popup') || e.target.closest('.vibecode-toast')) return;
        if (this.selectedElements.includes(e.target)) return;

        if (this.hoveredElement && !this.selectedElements.includes(this.hoveredElement)) {
            this.hoveredElement.classList.remove('vibecode-highlight');
        }

        this.hoveredElement = e.target;
        this.hoveredElement.classList.add('vibecode-highlight');
    }

    handleMouseOut(e) {
        if (!this.isActive || document.getElementById('vibecode-confirm-overlay')) return;
        if (this.hoveredElement && !this.selectedElements.includes(this.hoveredElement)) {
            this.hoveredElement.classList.remove('vibecode-highlight');
        }
    }

    async handleClick(e) {
        if (!this.isActive || document.getElementById('vibecode-confirm-overlay')) return;
        if (e.target.closest('.vibecode-popup') || e.target.closest('.vibecode-toast')) return;

        // Always record clicks as user actions if not clicking popup
        const tagName = e.target.tagName.toLowerCase();
        const id = e.target.id ? '#' + e.target.id : '';
        this.recordedActions.push({ type: 'click', target: tagName + id });
        if (this.recordedActions.length > 50) this.recordedActions.shift();

        if (!this.isActive) return;

        e.preventDefault();
        e.stopPropagation();

        const res = await new Promise(resolve => chrome.storage.local.get(null, resolve));
        this.enableMultiSelect = res.enableMultiSelect === true;
        this.recordActionsEnabled = res.recordActions !== false;
        this.captureSelectionConfig = res.captureSelection !== false;        if (this.enableMultiSelect) {
            const idx = this.selectedElements.indexOf(e.target);
            if (idx >= 0) {
                this.selectedElements.splice(idx, 1);
                e.target.classList.remove('vibecode-multi-highlight');
            } else {
                this.selectedElements.push(e.target);
                e.target.classList.remove('vibecode-highlight');
                e.target.classList.add('vibecode-multi-highlight');
                // Capture state for new element
                const newState = this.getDynamicState(e.target);
                newState.forEach(s => this.upsertState(s.el, s.key, s.value));
                if (res.captureJSContext) {
                    const jsCtx = this.getJSContext(e.target);
                    if (jsCtx) this.upsertState(this.getSelectorForElement(e.target, 'auto'), 'js_context', jsCtx);
                }
            }
            
            if (this.isTop) {
                if (!this.popup && this.selectedElements.length > 0) {
                    await this.createPopup(e.clientX, e.clientY, res);
                    if (res.captureElementScreenshots !== false) setTimeout(() => this.captureElementScreenshot(e.target).then(() => this.persistToCrossSite()), 500);
                    else this.persistToCrossSite();
                } else if (this.popup) {
                    this.updateElementsList();
                    this.updateCapturedDataViews();
                    if (idx < 0 && res.captureElementScreenshots !== false) setTimeout(() => this.captureElementScreenshot(e.target).then(() => this.persistToCrossSite()), 500);
                    else this.persistToCrossSite();
                    if (this.selectedElements.length === 0) this.closePopup();
                }
            } else {
                // Iframe logic: just persist to cross-site storage
                if (res.enableIframeCapture) {
                    if (res.captureElementScreenshots !== false) {
                        setTimeout(() => this.captureElementScreenshot(e.target).then(() => this.persistToCrossSite()), 500);
                    } else {
                        this.persistToCrossSite();
                    }
                    this.showToast('Element captured in iframe');
                }
            }
        } else {
            if (this.isTop && this.popup) this.closePopup();
            this.removeHighlight();
            this.selectedElements = [e.target];
            this.capturedDynamicState = []; // Reset for new single selection
            const newState = this.getDynamicState(e.target);
            newState.forEach(s => this.upsertState(s.el, s.key, s.value));

            if (res.captureJSContext) {
                const jsCtx = this.getJSContext(e.target);
                if (jsCtx) this.upsertState(this.getSelectorForElement(e.target, 'auto'), 'js_context', jsCtx);
            }

            e.target.classList.add('vibecode-multi-highlight');
            
            if (this.isTop) {
                await this.createPopup(e.clientX, e.clientY, res);
                if (res.captureElementScreenshots !== false) setTimeout(() => this.captureElementScreenshot(e.target).then(() => this.persistToCrossSite()), 500);
                else this.persistToCrossSite();
            } else {
                if (res.enableIframeCapture) {
                    if (res.captureElementScreenshots !== false) {
                        setTimeout(() => this.captureElementScreenshot(e.target).then(() => this.persistToCrossSite()), 500);
                    } else {
                        this.persistToCrossSite();
                    }
                    this.showToast('Element captured in iframe');
                }
            }
        }
    }

    updateElementsList() {
        if (!this.popup) return;
        const listContainer = this.popup.querySelector('#vibecode-el-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        this.selectedElements.forEach((el, index) => {
            const tagName = el.tagName.toLowerCase();
            const id = el.id ? '#' + el.id : '';
            const cls = Array.from(el.classList).filter(c => !c.includes('vibecode')).join('.');
            const label = `${tagName}${id}${cls ? '.' + cls : ''}`;

            const item = document.createElement('div');
            item.className = 'vibecode-element-item';
            item.innerHTML = `<span>${label.substring(0, 40)}${label.length > 40 ? '...' : ''}</span> <span class="vibecode-element-remove" data-idx="${index}">×</span>`;
            listContainer.appendChild(item);
        });

        const countSpan = this.popup.querySelector('#vibecode-el-count');
        if (countSpan) countSpan.textContent = this.selectedElements.length;

        const multiCollapse = this.popup.querySelector('#vibecode-multi-collapse');
        // Do not force open/closed state on multiCollapse to preserve user preference

        listContainer.querySelectorAll('.vibecode-element-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const el = this.selectedElements[idx];
                const selector = this.getSelectorForElement(el, 'auto');
                el.classList.remove('vibecode-multi-highlight');
                this.selectedElements.splice(idx, 1);
                // Remove state associated with this element
                this.capturedDynamicState = this.capturedDynamicState.filter(s => s.el !== selector);
                this.updateElementsList();
                this.updateCapturedDataViews();
                if (this.selectedElements.length === 0) this.closePopup();
            });
        });
    }

    async createPopup(x, y, res) {
        this.res = res;
        const defaults = typeof VibeCodeConfig !== 'undefined' ? VibeCodeConfig.getDefaults() : {};
        res = { ...defaults, ...res };

        const enableHistorySug = res.enableHistorySug;
        const enableActionSug = res.enableActionSug;
        this.enableDirectRun = res.enableDirectRun;
        const enablePromptImprove = res.enablePromptImprove;
        const enableModalDrag = res.enableModalDrag;
        const enableModalResize = res.enableModalResize;
        this.enableCopyPrompt = res.enableCopyPrompt;
        const enableVibeTextArea = res.enableVibeTextArea !== false;
        const targetProject = res.targetProject;
        const chatType = res.chatType;
        const modelSelection = res.modelSelection;
        const hotReloadEnabled = res.hotReloadEnabled;
        const captureSelection = res.captureSelection;
        this.captureSelectionConfig = captureSelection !== false;

        const captureLogs = res.captureLogs;
        const captureNetwork = res.captureNetwork;
        const includePageInfo = res.includePageInfo;
        const includeBrowserInfo = res.includeBrowserInfo;
        const captureHTML = res.captureHTML !== false;
        const captureImages = res.captureImages !== false;
        const captureCSS = res.captureCSS;
        const recordActions = res.recordActions;
        const selectorType = res.selectorType;

        const activeTemplate = res.activeTemplate;
        const promptTemplate = res.promptTemplate;
        this.promptHistory = res.promptHistory || [];
        const capturesOpen = res.capturesOpen !== false;

        this.popup = document.createElement('div');
        this.popup.className = 'vibecode-popup';
        
        const modalWidth = res.modalWidth || 400;
        this.popup.style.width = modalWidth + 'px';
        // Height is now auto in CSS to fit content perfectly

        if (enableModalDrag) this.popup.style.cursor = 'grab';
        if (!enableModalResize) this.popup.style.resize = 'none';

        const isImg = this.selectedElements.some(el => el.tagName.toLowerCase() === 'img');

        const colStates = res.collapseStates || {};
        const getOpen = (id, def) => colStates[id] !== undefined ? (colStates[id] ? 'open' : '') : (def ? 'open' : '');

        this.selectedText = '';
        if (captureSelection) {
            this.selectedText = window.getSelection().toString().trim();
        }

        // Prepare static page info
        const pageInfoHTML = `URL: ${window.location.href}<br>Title: ${document.title}<br>Ref: ${document.referrer}`;
        const browserInfoHTML = `UA: ${navigator.userAgent}<br>Size: ${window.innerWidth}x${window.innerHeight}`;

        let cssHTML = '';
        if (this.selectedElements.length > 0) {
            const styles = window.getComputedStyle(this.selectedElements[0]);
            cssHTML = `display: ${styles.display}; color: ${styles.color}; background: ${styles.backgroundColor}; font-size: ${styles.fontSize};`;
        }



        this.popup.innerHTML = `
            <div class="vibecode-popup-header" style="${enableModalDrag ? 'cursor: grab;' : ''}">
                <div style="display:flex; align-items:center; gap:6px;">
                    <img src="${chrome.runtime.getURL('icons/icon32.png')}" alt="Logo" style="width:16px; height:16px; border-radius:3px;">
                    <h2 style="margin: 0; font-size: 14px; font-weight: 700; background: linear-gradient(135deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">VibeCode Inspector</h2>
                </div>
                <div style="display:flex; gap:4px; align-items:center;">
                    <button class="vibecode-btn-icon btn-toggle-captures" title="Toggle Captures" style="display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path></svg>
                    </button>
                    <button class="vibecode-btn-icon btn-settings" title="Settings" style="cursor: pointer;">⚙️</button>
                    <button class="vibecode-btn-icon btn-close" title="Close" style="cursor: pointer;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            
            <div class="vibecode-settings-panel" style="display: none;">
                ${typeof VibeCodeConfig !== 'undefined' ? VibeCodeConfig.generateSettingsHTML(false, res) : ''}
            </div>

            <div id="vibecode-data-modules" style="display: ${capturesOpen ? 'flex' : 'none'}; flex-direction: column; gap: 0; margin-top: 4px;">
                
                <div id="capture-modules" style="display: flex; flex-direction: column; gap: 0;">
                    
                    <div class="vibecode-collapsible ${getOpen('col-sources', true)}" id="vibecode-sources-collapse" data-colid="col-sources" style="display: ${res.enableCrossSiteCapture ? 'block' : 'none'};">
                        <div class="vibecode-collapsible-header">
                            <div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="send-cross-site" checked> Cross-Site Sources (<span id="vibecode-site-count">0</span>)</div>
                            <span>▼</span>
                        </div>
                        <div class="vibecode-collapsible-body" style="padding:0; max-height:120px; overflow-y:auto;" id="vibecode-site-list">
                            <!-- Sites will be listed here -->
                        </div>
                    </div>

                    <div class="vibecode-collapsible ${getOpen('col-elements', true)}" id="vibecode-multi-collapse" data-colid="col-multi" style="display: ${this.selectedElements.length > 0 ? 'block' : 'none'};">
                        <div class="vibecode-collapsible-header">
                            <div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="send-multi-list" checked> Selected Elements (<span id="vibecode-el-count">${this.selectedElements.length}</span>)</div>
                            <span>▼</span>
                        </div>
                        <div class="vibecode-collapsible-body" style="padding: 4px; white-space: normal;"><div id="vibecode-el-list" class="vibecode-element-list" style="margin-bottom: 0;"></div></div>
                    </div>

                    <div class="vibecode-collapsible ${getOpen('col-logs', false)}" data-colid="col-logs" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureLogs" data-configkey="captureLogs" ${res.captureLogs !== 'none' && res.captureLogs !== false ? 'checked' : ''}> Logs</div><span>▼</span></div><div class="vibecode-collapsible-body" style="font-family:monospace; font-size:10px; max-height:100px; overflow-y:auto;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-net', false)}" data-colid="col-net" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureNetwork" data-configkey="captureNetwork" ${res.captureNetwork !== 'none' && res.captureNetwork !== false ? 'checked' : ''}> Network</div><span>▼</span></div><div class="vibecode-collapsible-body" style="font-family:monospace; font-size:10px; max-height:100px; overflow-y:auto;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-page', false)}" data-colid="col-page" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-includePageInfo" data-configkey="includePageInfo" ${res.includePageInfo ? 'checked' : ''}> Page Info</div><span>▼</span></div><div class="vibecode-collapsible-body" style="white-space: normal;">${pageInfoHTML}</div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-browser', false)}" data-colid="col-browser" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-includeBrowserInfo" data-configkey="includeBrowserInfo" ${res.includeBrowserInfo ? 'checked' : ''}> Browser Info</div><span>▼</span></div><div class="vibecode-collapsible-body" style="white-space: normal;">${browserInfoHTML}</div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-html', false)}" data-colid="col-html" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureHTML" data-configkey="captureHTML" ${res.captureHTML !== false ? 'checked' : ''}> Captured HTML</div><span>▼</span></div><div class="vibecode-collapsible-body" style="white-space: normal;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-dynamic', false)}" data-colid="col-dynamic" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-includeDynamicState" data-configkey="includeDynamicState" ${res.includeDynamicState !== false ? 'checked' : ''}> Dynamic State</div><span>▼</span></div><div class="vibecode-collapsible-body" style="white-space: normal;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-el-screenshots', false)}" data-colid="col-el-screenshots" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureElementScreenshots" data-configkey="captureElementScreenshots" ${res.captureElementScreenshots !== false ? 'checked' : ''}> Element Screenshots</div><span>▼</span></div><div class="vibecode-collapsible-body" style="padding:4px; white-space: normal;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-images', false)}" data-colid="col-images" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureImages" data-configkey="captureImages" ${res.captureImages !== false ? 'checked' : ''}> Captured Images</div><span>▼</span></div><div class="vibecode-collapsible-body" style="padding:4px; white-space: normal;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-css', false)}" data-colid="col-css" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureCSS" data-configkey="captureCSS" ${res.captureCSS !== false ? 'checked' : ''}> Captured CSS</div><span>▼</span></div><div class="vibecode-collapsible-body"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-actions', false)}" data-colid="col-actions" style="display: none;"><div class="vibecode-collapsible-header"><div style="display:flex; align-items:center; gap:6px;"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-recordActions" data-configkey="recordActions" ${res.recordActions !== false ? 'checked' : ''}> User Actions</div><span>▼</span></div><div class="vibecode-collapsible-body" style="white-space: normal; padding: 4px;"></div></div>
                    
                    <div class="vibecode-collapsible ${getOpen('col-sel-text', false)}" data-colid="col-sel-text" style="display: none;"><div class="vibecode-collapsible-header"><div class="vibecode-collapsible-header-inner"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureSelection" data-configkey="captureSelection" ${res.captureSelection !== false ? 'checked' : ''}> Selected Text</div><span>▼</span></div><div class="vibecode-collapsible-body"></div></div>

                    <div class="vibecode-collapsible ${getOpen('col-js-context', false)}" data-colid="col-js-context" style="display: none;"><div class="vibecode-collapsible-header"><div class="vibecode-collapsible-header-inner"><input type="checkbox" class="vibecode-capture-checkbox" id="header-check-captureJSContext" data-configkey="captureJSContext" ${res.captureJSContext ? 'checked' : ''}> JS Context (React/Vue/Events)</div><span>▼</span></div><div class="vibecode-collapsible-body"></div></div>

                    <div class="vibecode-collapsible vibecode-collapsible-special ${getOpen('col-suggestions', false)}" data-colid="col-suggestions" style="display: none;">
                        <div class="vibecode-collapsible-header">
                            <div class="vibecode-collapsible-header-inner">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
                                Suggestions & History
                            </div>
                            <span>▼</span>
                        </div>
                        <div class="vibecode-collapsible-body" id="vibecode-autocomplete-body" style="padding: 0; max-height: 150px; overflow-y: auto;"></div>
                    </div>
                </div>
            </div>
            ${enableVibeTextArea ? `
            <div style="position: relative; margin-top: 2px;" class="vibecode-prompt-container">
                <textarea class="vibecode-textarea" id="vibecode-custom-prompt" placeholder="Type instruction to improve..."></textarea>
                ${enablePromptImprove ? `
                <button class="vibecode-btn-icon" id="vibecode-improve-btn" title="Improve Prompt" style="position: absolute; top: 6px; right: 6px; background: rgba(59,130,246,0.15); border-radius: 4px; padding: 4px; cursor: pointer; color: #60a5fa; border: none; outline: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; transition: background 0.2s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"></path><path d="m14 7 3 3"></path><path d="M5 6v4"></path><path d="M19 14v4"></path><path d="M10 2v2"></path><path d="M7 8H3"></path><path d="M21 16h-4"></path><path d="M11 3H9"></path></svg>
                </button>
                ` : ''}
            </div>
            ` : ''}
            <div style="display: flex; gap: 4px; margin-top: 2px;">
                <button class="vibecode-action-btn" id="vibecode-send-btn" style="flex: 1; margin-top: 0; padding: 6px 12px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    <span id="vibecode-send-text">${res.outputTarget === 'file' ? 'Save to ' + (res.taskFileName || 'tasks.md') : (res.outputTarget === 'api' ? 'Send to API' : 'Send to ' + targetProject.charAt(0).toUpperCase() + targetProject.slice(1))}</span>
                </button>
                ${this.enableCopyPrompt ? `
                <button class="vibecode-action-btn" id="vibecode-copy-btn" title="Copy Prompt" style="margin-top: 0; padding: 6px 10px; background: #334155;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                ` : ''}
            </div>
        `;

        document.body.appendChild(this.popup);
        this.updateElementsList();
        this.updateCapturedDataViews();

        const rect = this.popup.getBoundingClientRect();
        let posX = x + 15; let posY = y + 15;
        if (posX + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 15;
        if (posY + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 15;
        this.popup.style.left = `${posX}px`; this.popup.style.top = `${posY}px`;

        this.attachModalEvents(res);
    }

    attachModalEvents(res) {
        this.res = res;
        const textarea = this.popup.querySelector('#vibecode-custom-prompt');
        const oldDropdown = document.getElementById('vibecode-autocomplete');
        if (oldDropdown) oldDropdown.remove();

        const suggestionsCol = this.popup.querySelector('[data-colid="col-suggestions"]');
        const autocompleteBody = this.popup.querySelector('#vibecode-autocomplete-body');

        const customPresetsText = this.res.customPresets || "- Make it look more premium.\n- Fix layout issues.\n- Add hover effects.";
        this.presets = customPresetsText.split('\n').map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-+\s*/, '').trim()).filter(l => l.length > 0);

        let activeIdx = -1; let sugItems = [];
        this.renderAutocomplete = () => {
            if (!this.popup || !autocompleteBody || !textarea) return;
            const query = textarea.value.toLowerCase().trim();
            autocompleteBody.innerHTML = '';
            let hasItems = false;
            sugItems = [];
            activeIdx = -1;

            const createItem = (text, isGroup = false) => {
                const div = document.createElement('div');
                if (isGroup) {
                    div.className = 'vibecode-autocomplete-group';
                    div.textContent = text;
                }
                else {
                    hasItems = true;
                    div.className = 'vibecode-autocomplete-item';
                    div.style.padding = '6px 8px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    const mi = text.toLowerCase().indexOf(query);
                    if (mi >= 0 && query.length > 0) {
                        div.innerHTML = `${text.substring(0, mi)}<strong style="color:#fff">${text.substring(mi, mi + query.length)}</strong>${text.substring(mi + query.length)}`;
                    } else div.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
                    div.dataset.value = text;
                    div.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        textarea.value = text;
                        textarea.dispatchEvent(new Event('input'));
                        if (this.enableDirectRun) this.sendToAntigravity();
                    });
                    div.addEventListener('mouseenter', () => {
                        const all = autocompleteBody.querySelectorAll('.vibecode-autocomplete-item');
                        all.forEach(i => i.style.background = 'transparent');
                        div.style.background = 'rgba(59, 130, 246, 0.2)';
                    });
                    div.addEventListener('mouseleave', () => {
                        div.style.background = 'transparent';
                    });
                    sugItems.push(div);
                }
                return div;
            };

            const fPresets = this.presets.filter(p => p.toLowerCase().includes(query));
            if ((this.res.enableActionSug ?? true) && fPresets.length) {
                autocompleteBody.appendChild(createItem('Presets', true));
                fPresets.forEach(p => autocompleteBody.appendChild(createItem(p)));
            }
            const fHistory = this.promptHistory.filter(h => h.toLowerCase().includes(query));
            if ((this.res.enableHistorySug ?? true) && fHistory.length) {
                autocompleteBody.appendChild(createItem('History', true));
                fHistory.forEach(h => autocompleteBody.appendChild(createItem(h)));
            }

            if (suggestionsCol) {
                suggestionsCol.style.display = hasItems ? 'block' : 'none';
                if (hasItems && query.length > 0) {
                    const allCols = this.popup.querySelectorAll('.vibecode-collapsible');
                    allCols.forEach(c => c.classList.remove('open'));
                    suggestionsCol.classList.add('open');
                }
            }
            this.updateCapturedDataViews();
        };

        if (textarea) {
            textarea.addEventListener('input', () => {
                textarea.style.height = 'auto';
                textarea.style.height = (textarea.scrollHeight) + 'px';
                this.renderAutocomplete();
            });

            textarea.addEventListener('keydown', (e) => {
                if (suggestionsCol && suggestionsCol.style.display !== 'none' && suggestionsCol.classList.contains('open')) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); if (activeIdx < sugItems.length - 1) { activeIdx++; sugItems.forEach(i => i.style.background = 'transparent'); sugItems[activeIdx].style.background = 'rgba(59, 130, 246, 0.2)'; sugItems[activeIdx].scrollIntoView({ block: 'nearest' }); } }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); if (activeIdx > 0) { activeIdx--; sugItems.forEach(i => i.style.background = 'transparent'); sugItems[activeIdx].style.background = 'rgba(59, 130, 246, 0.2)'; sugItems[activeIdx].scrollIntoView({ block: 'nearest' }); } }
                    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); textarea.value = sugItems[activeIdx].dataset.value; textarea.dispatchEvent(new Event('input')); if (this.enableDirectRun) this.sendToAntigravity(); }
                }
            });

            textarea.addEventListener('focus', () => {
                this.renderAutocomplete();
            });
        }

        // Initial render to populate history/presets before typing
        this.renderAutocomplete();

        // Collapsible sections
        this.popup.querySelectorAll('.vibecode-collapsible-header').forEach((header, index) => {
            header.addEventListener('click', async (e) => {
                if (e.target.tagName.toLowerCase() === 'input') return; // Don't collapse if clicking checkbox
                const parent = header.parentElement;

                const wasOpen = parent.classList.contains('open');

                // Accordion logic: close all other collapsibles
                const allCols = this.popup.querySelectorAll('.vibecode-collapsible');
                allCols.forEach(c => c.classList.remove('open'));

                if (!wasOpen) {
                    parent.classList.add('open');
                }

                if (chrome && chrome.storage) {
                    const res = await new Promise(r => chrome.storage.local.get('collapseStates', r));
                    const states = res.collapseStates || {};
                    allCols.forEach(c => {
                        const cid = c.dataset.colid;
                        if (cid) states[cid] = c.classList.contains('open');
                    });
                    chrome.storage.local.set({ collapseStates: states });
                }
            });
        });

        // Tabs logic
        const tBtns = this.popup.querySelectorAll('.vibecode-tab-btn');
        const tConts = this.popup.querySelectorAll('.vibecode-tab-content');
        tBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tBtns.forEach(b => b.classList.remove('active'));
                tConts.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                this.popup.querySelector('#tab-content-' + btn.dataset.tabtarget).classList.add('active');
            });
        });

        const setBtn = this.popup.querySelector('.btn-settings');
        const setPan = this.popup.querySelector('.vibecode-settings-panel');
        setBtn.addEventListener('click', () => setPan.style.display = setPan.style.display === 'none' ? 'flex' : 'none');

        const toggleBtn = this.popup.querySelector('.btn-toggle-captures');
        const dataMods = this.popup.querySelector('#vibecode-data-modules');
        if (toggleBtn && dataMods) {
            toggleBtn.addEventListener('click', async () => {
                const isNowOpen = dataMods.style.display === 'none';
                dataMods.style.display = isNowOpen ? 'flex' : 'none';
                this.res.capturesOpen = isNowOpen;
                if (chrome && chrome.storage) {
                    await new Promise(r => chrome.storage.local.set({ capturesOpen: isNowOpen }, r));
                }
            });
        }



        this.attachSettingsPanelListeners(res);
        this.updateOutputRowVisibility();

        if (res.enableModalDrag !== false) {
            const popupEl = this.popup;
            this.dragHandlers = {
                move: (e) => { if (!this.isDragging) return; e.preventDefault(); let left = e.clientX - this.dragOffX; let top = e.clientY - this.dragOffY; this.popup.style.left = left + 'px'; this.popup.style.top = top + 'px'; },
                up: () => this.isDragging = false
            };
            popupEl.addEventListener('mousedown', (e) => {
                if (e.target.closest('button, input, select, textarea, .vibecode-element-item, .vibecode-autocomplete-item, a, .vibecode-collapsible-body, .vibecode-settings-panel')) return;
                this.isDragging = true;
                const r = this.popup.getBoundingClientRect();
                this.dragOffX = e.clientX - r.left;
                this.dragOffY = e.clientY - r.top;
            });
            document.addEventListener('mousemove', this.dragHandlers.move);
            document.addEventListener('mouseup', this.dragHandlers.up);
        }

        this.popup.querySelectorAll('.vibecode-log-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                this.capturedLogs.splice(idx, 1);
                this.rebuildPopup();
            });
        });

        this.popup.querySelectorAll('.vibecode-net-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx);
                this.capturedNetwork.splice(idx, 1);
                this.rebuildPopup();
            });
        });



        this.popup.querySelectorAll('.vibecode-capture-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const key = e.target.dataset.configkey;
                const val = e.target.checked;
                this.handleConfigChange(key, val);
                chrome.storage.local.set({ [key]: val });
            });
        });

        this.popup.querySelector('.btn-close').addEventListener('click', () => this.closePopup());
        this.popup.querySelector('#vibecode-send-btn').addEventListener('click', () => this.sendToAntigravity());

        this.popup.querySelector('#vibecode-upload-img')?.addEventListener('click', () => {
            this.showToast('Processing image...');
            this.sendToAntigravity();
        });

        this.popup.querySelector('#vibecode-improve-btn')?.addEventListener('click', () => {
            const ta = this.popup.querySelector('#vibecode-custom-prompt');
            if (ta) { ta.value += ' (make it very premium and aesthetic)'; ta.dispatchEvent(new Event('input')); }
        });

        this.popup.querySelector('#vibecode-copy-btn')?.addEventListener('click', async () => {
            const prompt = await this.buildPromptPayload();
            const config = await VibeCodeConfig.getSettings();
            const confirmSend = config.confirmBeforeSend === true || config.confirmBeforeSend === 'true';

            if (confirmSend) {
                this.showConfirmModal(prompt, 'Confirm & Copy', (editedPrompt) => {
                    navigator.clipboard.writeText(editedPrompt);
                    this.showToast('📋 Prompt copied to clipboard!');
                    this.closePopup();
                });
            } else {
                navigator.clipboard.writeText(prompt);
                this.showToast('📋 Prompt copied to clipboard!');
                this.closePopup();
            }
        });

        // Remember resized width only
        if (res.enableModalResize !== false) {
            let resizeTimer;
            this.resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const { width } = entry.contentRect;
                    // Debounce saving to storage
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        if (chrome && chrome.storage) {
                            chrome.storage.local.set({ modalWidth: width });
                        }
                    }, 500);
                }
            });
            this.resizeObserver.observe(this.popup);
        }
    }

    updateCapturedDataViews() {
        if (!this.popup) return;
        const res = this.res;
        const isCrossEnabled = res.enableCrossSiteCapture === true;
        const isCapturesOpen = res.capturesOpen !== false;
        let hasVisibleCapture = false;

        // Elements
        this.updateElementsList();
        if (this.selectedElements.length > 0) hasVisibleCapture = true;

        // 0. Update Site/Page List (Cross-Site Sources)
        const siteList = this.popup.querySelector('#vibecode-site-list');
        const siteCount = this.popup.querySelector('#vibecode-site-count');
        const sourcesCol = this.popup.querySelector('#vibecode-sources-collapse');

        if (siteList) {
            const allPages = this.crossSiteStore.sites || {};
            // Filter out legacy hostname-based keys (like 'local-page') and keep only URL-based ones
            const pagesArray = Object.keys(allPages)
                .filter(key => key.includes('://')) 
                .map(url => ({ url, ...allPages[url] }));
            
            // Ensure current page is represented exactly once
            const currentUrl = window.location.href;
            const hasCurrentInStore = pagesArray.some(p => p.url === currentUrl);
            
            if (!hasCurrentInStore) {
                pagesArray.unshift({
                    url: currentUrl,
                    hostname: window.location.hostname || 'local-page',
                    title: document.title,
                    isCurrent: true
                });
            }

            if (siteCount) siteCount.textContent = pagesArray.length;

            let html = '';
            pagesArray.forEach(p => {
                const isCurrentPage = p.url === window.location.href;
                const isSelected = isCurrentPage || this.selectedPages.has(p.url);
                const title = p.title || p.url.split('/').pop() || 'Untitled';
                const host = p.hostname || 'local-page';
                
                html += `
                    <div class="vibecode-site-item ${isSelected ? 'active' : ''}" 
                         style="display:flex; align-items:center; gap:4px; padding:2px 6px; background:${isSelected ? 'rgba(59,130,246,0.08)' : 'transparent'}; border-radius:0; cursor:pointer; margin-bottom:0;" 
                         data-url="${p.url}">
                        <div style="width:3px; height:3px; border-radius:50%; background:${isSelected ? '#60a5fa' : '#475569'}; flex-shrink:0;"></div>
                        <div style="flex:1; display:flex; align-items:baseline; gap:4px; overflow:hidden;">
                            <span style="font-size:10px; color:${isSelected ? '#fff' : '#94a3b8'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</span>
                            <span style="font-size:8px; color:#64748b; opacity:0.6; white-space:nowrap;">(${host})</span>
                        </div>
                        ${!isCurrentPage ? `<span class="vibecode-site-remove" data-url="${p.url}" style="color:#ef4444; opacity:0.4; padding:0 2px; font-size:12px; line-height:1;">&times;</span>` : ''}
                    </div>
                `;
            });

            siteList.innerHTML = html;

            siteList.querySelectorAll('.vibecode-site-item').forEach(item => {
                item.onclick = (e) => {
                    if (e.target.classList.contains('vibecode-site-remove')) return;
                    const url = item.dataset.url;
                    if (!url || url === window.location.href) return;
                    
                    if (this.selectedPages.has(url)) this.selectedPages.delete(url);
                    else this.selectedPages.add(url);
                    
                    chrome.storage.local.set({ selectedPages: Array.from(this.selectedPages) });
                    this.updateCapturedDataViews();
                };
            });

            siteList.querySelectorAll('.vibecode-site-remove').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const url = e.target.dataset.url;
                    delete this.crossSiteStore.sites[url];
                    this.selectedPages.delete(url);
                    chrome.storage.local.set({ 
                        crossSiteStore: this.crossSiteStore,
                        selectedPages: Array.from(this.selectedPages)
                    });
                    this.updateCapturedDataViews();
                };
            });

            if (sourcesCol) {
                const shouldShow = isCrossEnabled && (pagesArray.length > 0 || currentHostname);
                sourcesCol.style.display = shouldShow ? 'block' : 'none';
                if (shouldShow) hasVisibleCapture = true;
            }
        }

        // 1. Data Merging Logic
        let mergedData = {
            logs: [...this.capturedLogs],
            net: [...this.capturedNetwork],
            elements: this.selectedElements.map(el => ({
                html: (() => { const clone = el.cloneNode(true); clone.classList.remove('vibecode-highlight', 'vibecode-multi-highlight'); return clone.outerHTML; })(),
                css: this.getImportantCSS(el),
                selector: this.getSelectorForElement(el, res.selectorType || 'auto'),
                isRemote: false
            })),
            dyn: [...this.capturedDynamicState],
            screens: [...this.elementScreenshots],
            actions: [...this.recordedActions],
            text: this.selectedText ? [this.selectedText] : [],
            urls: [window.location.href]
        };

        if (res.enableCrossSiteCapture) {
            this.selectedPages.forEach(url => {
                if (url === window.location.href) return;
                const sd = this.crossSiteStore.sites[url];
                if (sd) {
                    const pageTag = sd.title || url.split('/').pop() || 'Remote';
                    if (sd.logs) mergedData.logs.push(...sd.logs.map(l => ({ ...l, site: pageTag })));
                    if (sd.network) mergedData.net.push(...sd.network.map(n => ({ ...n, site: pageTag })));
                    if (sd.elements) mergedData.elements.push(...sd.elements.map(e => ({ ...e, isRemote: true, site: pageTag })));
                    if (sd.dynamicState) mergedData.dyn.push(...sd.dynamicState.map(d => ({ ...d, site: pageTag })));
                    if (sd.screenshots) mergedData.screens.push(...sd.screenshots.map((s, i) => ({ id: url + i, base64: s, tagName: 'remote', isRemote: true, site: pageTag })));
                    if (sd.actions) mergedData.actions.push(...sd.actions.map(a => ({ ...a, site: pageTag })));
                    if (sd.selectedText) mergedData.text.push(sd.selectedText);
                    if (sd.url) mergedData.urls.push(sd.url);
                }
            });
        }

        // 2. Render Merged Views
        this._renderMergedViews(mergedData, hasVisibleCapture, isCapturesOpen);
    }

    _renderMergedViews(mergedData, hasVisibleCapture, isCapturesOpen) {
        const res = this.res;

        // 2. Render Merged Views

        // Logs
        const logsBody = this.popup.querySelector('[data-colid="col-logs"] .vibecode-collapsible-body');
        const logsCol = this.popup.querySelector('[data-colid="col-logs"]');
        if (logsBody && logsCol) {
            const isEnabled = res.captureLogs !== 'none' && res.captureLogs !== false;
            const hasData = mergedData.logs.length > 0;
            if (isEnabled && hasData) {
                logsBody.innerHTML = mergedData.logs.map((l, i) => {
                    let color = '#cbd5e1';
                    if (l.level === 'error') color = '#ef4444';
                    if (l.level === 'info') color = '#3b82f6';
                    const siteTag = l.site ? `<span style="opacity:0.5; margin-right:4px;">${l.site}</span>` : '';
                    return `<div style="color:${color}; margin-bottom:2px; padding-bottom:2px; font-size:9px; border-bottom:1px solid rgba(255,255,255,0.03);">${siteTag}[${l.level.toUpperCase()}] ${l.args.join(' ')}</div>`;
                }).join('');
                logsCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                logsCol.style.display = 'none';
            }
        }

        // Network
        const netBody = this.popup.querySelector('[data-colid="col-net"] .vibecode-collapsible-body');
        const netCol = this.popup.querySelector('[data-colid="col-net"]');
        if (netBody && netCol) {
            const isEnabled = res.captureNetwork !== 'none' && res.captureNetwork !== false;
            const hasData = mergedData.net.length > 0;
            if (isEnabled && hasData) {
                netBody.innerHTML = mergedData.net.map(n => {
                    const siteTag = n.site ? `<span style="opacity:0.5; margin-right:4px;">${n.site}</span>` : '';
                    return `<div style="margin-bottom:2px; padding-bottom:2px; font-size:9px; border-bottom:1px solid rgba(255,255,255,0.03);">${siteTag}[${n.method}] ${n.url.substring(0, 50)}${n.url.length > 50 ? '...' : ''}</div>`;
                }).join('');
                netCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                netCol.style.display = 'none';
            }
        }

        // Page Info
        const pageCol = this.popup.querySelector('[data-colid="col-page"]');
        const pageBody = this.popup.querySelector('[data-colid="col-page"] .vibecode-collapsible-body');
        if (pageCol && pageBody) {
            const isEnabled = res.includePageInfo === true;
            const hasData = mergedData.urls.length > 0;
            if (isEnabled && hasData) {
                pageBody.innerHTML = mergedData.urls.map(u => `<div style="font-size:10px; color:#cbd5e1; margin-bottom:2px; word-break:break-all; opacity:0.8;">• ${u}</div>`).join('');
                pageCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                pageCol.style.display = 'none';
            }
        }

        // Browser Info
        const browserCol = this.popup.querySelector('[data-colid="col-browser"]');
        if (browserCol) {
            const isEnabled = res.includeBrowserInfo === true;
            browserCol.style.display = isEnabled ? 'block' : 'none';
            if (isEnabled) hasVisibleCapture = true;
        }

        // HTML
        const htmlBody = this.popup.querySelector('[data-colid="col-html"] .vibecode-collapsible-body');
        const htmlCol = this.popup.querySelector('[data-colid="col-html"]');
        if (htmlBody && htmlCol) {
            const isEnabled = res.captureHTML !== false;
            const hasData = mergedData.elements.length > 0;
            if (isEnabled && hasData) {
                let htmlStr = "";
                mergedData.elements.forEach((item, i) => {
                    const tag = item.isRemote ? `From Site: ${item.site}` : `Element ${i + 1}`;
                    htmlStr += `<!-- ${tag} -->\n${item.html}\n\n`;
                });
                htmlBody.innerHTML = `<pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${this.escapeHTML(htmlStr.trim())}</pre>`;
                htmlCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                htmlCol.style.display = 'none';
            }
        }

        // Dynamic State
        const dynBody = this.popup.querySelector('[data-colid="col-dynamic"] .vibecode-collapsible-body');
        const dynCol = this.popup.querySelector('[data-colid="col-dynamic"]');
        if (dynBody && dynCol) {
            const isEnabled = res.includeDynamicState !== false;
            const hasData = mergedData.dyn.length > 0;
            if (isEnabled && hasData) {
                dynBody.innerHTML = mergedData.dyn.map((s, i) => {
                    const siteTag = s.site ? `<span style="opacity:0.5; margin-right:4px;">${s.site}:</span>` : '';
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; padding:2px 6px; background:rgba(0,0,0,0.1); border-radius:3px;">
                            <span style="font-size:10px; color:#cbd5e1; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; margin-right:8px;">${siteTag}${s.key}: ${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value}</span>
                            ${!s.site ? `<span class="vibecode-dyn-remove" data-idx="${i}" style="cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px;">&times;</span>` : ''}
                        </div>
                    `;
                }).join('');
                dynBody.querySelectorAll('.vibecode-dyn-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        this.capturedDynamicState.splice(idx, 1);
                        this.updateCapturedDataViews();
                    };
                });
                dynCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                dynCol.style.display = 'none';
            }
        }

        // Images
        const imgBody = this.popup.querySelector('[data-colid="col-images"] .vibecode-collapsible-body');
        const imgCol = this.popup.querySelector('[data-colid="col-images"]');
        if (imgBody && imgCol) {
            const isEnabled = res.captureImages !== false;
            const hasData = this.selectedElements.filter(el => el.tagName.toLowerCase() === 'img').length > 0;
            if (isEnabled && hasData) {
                const localImages = this.selectedElements.filter(el => el.tagName.toLowerCase() === 'img');
                imgBody.innerHTML = localImages.map((img, i) => `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px; padding:2px 6px; background:rgba(0,0,0,0.1); border-radius:3px;">
                        <img src="${img.src}" style="width:16px; height:16px; object-fit:cover; border-radius:2px;">
                        <span style="flex:1; font-size:10px; color:#cbd5e1; font-family:monospace;">img-${i + 1}</span>
                        <span class="vibecode-img-remove" data-src="${img.src}" style="cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px;">&times;</span>
                    </div>
                `).join('');
                imgBody.querySelectorAll('.vibecode-img-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const src = e.target.dataset.src;
                        const idx = this.selectedElements.findIndex(el => el.tagName.toLowerCase() === 'img' && el.src === src);
                        if (idx >= 0) {
                            const el = this.selectedElements[idx];
                            el.classList.remove('vibecode-multi-highlight');
                            this.selectedElements.splice(idx, 1);
                            this.updateElementsList();
                        }
                    };
                });
                imgCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                imgCol.style.display = 'none';
            }
        }

        // CSS
        const cssBody = this.popup.querySelector('[data-colid="col-css"] .vibecode-collapsible-body');
        const cssCol = this.popup.querySelector('[data-colid="col-css"]');
        if (cssBody && cssCol) {
            const isEnabled = res.captureCSS !== false;
            let cssStr = "";
            mergedData.elements.forEach((item, i) => {
                const tag = item.isRemote ? `From Site: ${item.site}` : `Element ${i + 1}`;
                if (item.css) cssStr += `/* ${tag} */\n${item.css}\n\n`;
            });

            const hasData = !!cssStr.trim();
            if (isEnabled && hasData) {
                cssBody.innerHTML = `<pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${cssStr}</pre>`;
                cssCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                cssCol.style.display = 'none';
            }
        }

        // Element Screenshots
        const elScreensBody = this.popup.querySelector('[data-colid="col-el-screenshots"] .vibecode-collapsible-body');
        const elScreensCol = this.popup.querySelector('[data-colid="col-el-screenshots"]');
        if (elScreensBody && elScreensCol) {
            const isEnabled = res.captureElementScreenshots !== false;
            const hasData = mergedData.screens.length > 0;
            if (isEnabled && hasData) {
                elScreensBody.innerHTML = mergedData.screens.map((s, i) => `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px; padding:2px 6px; background:rgba(0,0,0,0.1); border-radius:3px; position:relative;">
                        <img src="${s.base64}" style="width:24px; height:24px; object-fit:cover; border-radius:2px; border:1px solid rgba(255,255,255,0.05);">
                        <span style="flex:1; font-size:10px; color:#cbd5e1; font-family:monospace;">${s.tagName}-${i + 1} ${s.site ? '('+s.site+')' : ''}</span>
                        ${!s.isRemote ? `<span class="vibecode-el-screen-remove" data-id="${s.id}" style="cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px;">&times;</span>` : ''}
                    </div>
                `).join('');
                elScreensBody.querySelectorAll('.vibecode-el-screen-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const id = parseInt(e.target.dataset.id);
                        const idx = this.elementScreenshots.findIndex(s => s.id === id);
                        if (idx >= 0) {
                            this.elementScreenshots.splice(idx, 1);
                            this.updateCapturedDataViews();
                        }
                    };
                });
                elScreensCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                elScreensCol.style.display = 'none';
            }
        }

        // Actions
        const actBody = this.popup.querySelector('[data-colid="col-actions"] .vibecode-collapsible-body');
        const actCol = this.popup.querySelector('[data-colid="col-actions"]');
        if (actBody && actCol) {
            const isEnabled = res.recordActions !== false;
            const hasData = mergedData.actions.length > 0;
            if (isEnabled && hasData) {
                actBody.innerHTML = mergedData.actions.map((a, i) => {
                    const siteTag = a.site ? `<span style="opacity:0.5; margin-right:4px;">${a.site}:</span>` : '';
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px; padding:2px 6px; background:rgba(0,0,0,0.1); border-radius:3px;">
                            <span style="font-size:10px; color:#cbd5e1; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; margin-right:8px;">${siteTag}[${a.type}] ${a.target}</span>
                            ${!a.site ? `<span class="vibecode-act-remove" data-idx="${i}" style="cursor:pointer; color:#ef4444; font-weight:bold; font-size:12px;">&times;</span>` : ''}
                        </div>
                    `;
                }).join('');
                actBody.querySelectorAll('.vibecode-act-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        this.recordedActions.splice(idx, 1);
                        this.updateCapturedDataViews();
                    };
                });
                actCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                actCol.style.display = 'none';
            }
        }

        // Selected Text
        const selBody = this.popup.querySelector('[data-colid="col-sel-text"] .vibecode-collapsible-body');
        const selCol = this.popup.querySelector('[data-colid="col-sel-text"]');
        if (selBody && selCol) {
            const isEnabled = res.captureSelection !== false;
            const hasData = mergedData.text.length > 0;
            if (isEnabled && hasData) {
                selBody.innerHTML = mergedData.text.map(t => `<div style="margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.03); font-size:10px;">${t}</div>`).join('');
                selCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                selCol.style.display = 'none';
            }
        }

        // JS Context
        const jsBody = this.popup.querySelector('[data-colid="col-js-context"] .vibecode-collapsible-body');
        const jsCol = this.popup.querySelector('[data-colid="col-js-context"]');
        if (jsBody && jsCol) {
            const isEnabled = res.captureJSContext === true;
            const jsEntries = mergedData.dyn.filter(d => d.key === 'js_context');
            if (isEnabled && jsEntries.length > 0) {
                jsBody.innerHTML = jsEntries.map(entry => {
                    const siteTag = entry.site ? `<span style="opacity:0.5; margin-right:4px;">${entry.site}:</span>` : '';
                    return `<div style="margin-bottom:4px; padding:4px; background:rgba(0,0,0,0.1); border-radius:3px;">
                        <div style="font-size:9px; color:#60a5fa; margin-bottom:2px; font-family:monospace;">${siteTag}${entry.el}</div>
                        <pre style="margin:0; font-size:9px; color:#cbd5e1; overflow-x:auto;">${JSON.stringify(entry.value, null, 2)}</pre>
                    </div>`;
                }).join('');
                jsCol.style.display = 'block';
                hasVisibleCapture = true;
            } else {
                jsCol.style.display = 'none';
            }
        }

        // Update Elements List (Real Selectors)
        const elCol = this.popup.querySelector('#vibecode-multi-collapse');
        const elList = this.popup.querySelector('#vibecode-el-list');
        const elCount = this.popup.querySelector('#vibecode-el-count');
        if (elCol && elList) {
            const totalCount = mergedData.elements.length;
            if (elCount) elCount.textContent = totalCount;
            elCol.style.display = totalCount > 0 ? 'block' : 'none';
            
            if (totalCount > 0) {
                elList.innerHTML = mergedData.elements.map((item, i) => `
                    <div class="vibecode-element-item" style="display:flex; justify-content:space-between; align-items:center; padding:3px 6px; background:${item.isRemote ? 'rgba(59,130,246,0.05)' : 'rgba(255,255,255,0.03)'}; border-radius:3px; margin-bottom:1px;">
                        <span style="font-size:10px; color:${item.isRemote ? '#60a5fa' : '#cbd5e1'}; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${item.selector}${item.isRemote ? ' ('+item.site+')' : ''}</span>
                        ${!item.isRemote ? `<span class="vibecode-el-remove" data-idx="${i}" style="cursor:pointer; color:#ef4444; font-weight:bold; font-size:14px; margin-left:8px;">&times;</span>` : ''}
                    </div>
                `).join('');

                elList.querySelectorAll('.vibecode-el-remove').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.dataset.idx);
                        const el = this.selectedElements[idx];
                        el.classList.remove('vibecode-highlight', 'vibecode-multi-highlight');
                        this.selectedElements.splice(idx, 1);
                        this.updateElementsList();
                    };
                });
            }
        }

        const dataModules = this.popup.querySelector('#vibecode-data-modules');
        if (dataModules) {
            dataModules.style.display = (hasVisibleCapture && isCapturesOpen) ? 'flex' : 'none';
        }

        const toggleBtn = this.popup.querySelector('.btn-toggle-captures');
        if (toggleBtn) {
            toggleBtn.style.display = hasVisibleCapture ? 'flex' : 'none';
        }
    }

    async handleConfigChange(key, value, skipRebuild = false) {
        if (!this.popup) return;
        this.res[key] = value;
        const res = this.res;

        // Minimal structural keys that still require rebuild for deep layout changes
        const structuralKeys = ['enableModalDrag', 'enableModalResize', 'enableMultiSelect', 'hotReloadEnabled'];

        if (structuralKeys.includes(key) && !skipRebuild) {
            this.rebuildPopup();
            return;
        }

        // GRANULAR UI UPDATES - No Flicker!
        
        // 1. Sync settings panel inputs
        const config = VibeCodeConfig.configs[key];
        if (config) {
            const el = this.popup.querySelector('#' + config.id);
            if (el) {
                if (el.tagName === 'SELECT') {
                    el.value = String(value);
                } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                    if (el.value !== String(value)) el.value = value;
                }
                if (el.tagName === 'TEXTAREA') this.updateBadgeHighlights(el);
            }
        }

        // 2. Sync Header Checkboxes
        const headerCheck = this.popup.querySelector(`#header-check-${key}`);
        if (headerCheck) {
            headerCheck.checked = (value === true || value === 'true');
        }

        // 3. Side effects for specific keys
        if (key === 'enableVibeTextArea') {
            const taContainer = this.popup.querySelector('.vibecode-prompt-container');
            if (taContainer) taContainer.style.display = value ? 'block' : 'none';
        }

        if (key === 'outputTarget' || key === 'taskFileName') {
            this.updateOutputRowVisibility();
            const sendBtn = this.popup.querySelector('#vibecode-send-btn');
            if (sendBtn) {
                const target = res.outputTarget;
                let iconHtml = '<span class="iconify" data-icon="lucide:send"></span>';
                let btnText = 'Send to IDE';
                
                if (target === 'api') {
                    iconHtml = '<span class="iconify" data-icon="lucide:webhook"></span>';
                    btnText = 'Send to API';
                } else if (target === 'file') {
                    btnText = `Save to ${res.taskFileName || 'tasks.md'}`;
                } else if (target === 'mcp') {
                    iconHtml = '<span class="iconify" data-icon="lucide:server"></span>';
                    btnText = 'Send to MCP';
                } else if (target === 'cli') {
                    iconHtml = '<span class="iconify" data-icon="lucide:terminal"></span>';
                    btnText = 'Run CLI Command';
                }
                
                sendBtn.innerHTML = `<i>${iconHtml}</i><span>${btnText}</span>`;
            }
        }

        if (key === 'enableCopyPrompt') {
            const copyBtn = this.popup.querySelector('#vibecode-copy-btn');
            if (copyBtn) copyBtn.style.display = value ? 'flex' : 'none';
        }

        if (key === 'capturesOpen') {
            const dataMods = this.popup.querySelector('#vibecode-data-modules');
            if (dataMods) dataMods.style.display = value ? 'flex' : 'none';
        }

        if (key === 'customPresets') {
            const customPresetsText = res.customPresets || "- Make it look more premium.\n- Fix layout issues.\n- Add hover effects.";
            this.presets = customPresetsText.split('\n').map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-+\s*/, '').trim()).filter(l => l.length > 0);
            if (this.renderAutocomplete) this.renderAutocomplete();
        }

        // Always update views to reflect changes in capture state or templates
        this.updateCapturedDataViews();
    }

    updateBadgeHighlights(textarea) {
        if (!textarea) return;
        const text = textarea.value;
        const row = textarea.closest('.vibecode-settings-row') || textarea.closest('.config-row') || textarea.parentElement;
        if (row) {
            row.querySelectorAll('.vibecode-var-badge').forEach(badge => {
                const varName = badge.dataset.var;
                if (text.includes(varName)) {
                    badge.classList.add('used');
                } else {
                    badge.classList.remove('used');
                }
            });
        }
    }

    updateOutputRowVisibility() {
        if (!this.popup) return;
        const ot = this.popup.querySelector('#config-output-target');
        if (!ot) return;
        const target = ot.value;
        const getRow = (id) => this.popup.querySelector(`[data-fieldid="${id}"]`);
        
        const ideRows = ['config-project', 'config-chat-type', 'config-model', 'config-direct-run'].map(getRow);
        const fileRow = getRow('config-task-file');
        const apiRow = getRow('config-webhook-url');
        const mcpRow = getRow('config-mcp-url');
        const cliRow = getRow('config-cli-command');

        ideRows.forEach(r => { if (r) r.style.display = target === 'ide' ? 'flex' : 'none'; });
        if (fileRow) fileRow.style.display = target === 'file' ? 'flex' : 'none';
        if (apiRow) apiRow.style.display = target === 'api' ? 'flex' : 'none';
        if (mcpRow) mcpRow.style.display = target === 'mcp' ? 'flex' : 'none';
        if (cliRow) cliRow.style.display = target === 'cli' ? 'flex' : 'none';
    }

    attachSettingsPanelListeners(res) {
        if (!this.popup) return;
        const configs = VibeCodeConfig.configs;
        for (let k in configs) {
            const el = this.popup.querySelector('#' + configs[k].id);
            if (el) {
                if (el.tagName === 'TEXTAREA') {
                    this.updateBadgeHighlights(el);
                    el.addEventListener('input', (e) => {
                        this.updateBadgeHighlights(e.target);
                        if (e.target.id.includes('template')) {
                            // Debounced save for templates if needed, but for now just normal
                            this.handleConfigChange(k, e.target.value, true);
                            chrome.storage.local.set({ [k]: e.target.value });
                        }
                    });
                }
                el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', (e) => {
                    let val = e.target.value;
                    if (val === "true") val = true; else if (val === "false") val = false;
                    this.handleConfigChange(k, val);
                    chrome.storage.local.set({ [k]: val });
                });
            }
        }

        // Template Editor Switching
        const editorSelect = this.popup.querySelector('#vibecode-template-editor-select');
        if (editorSelect) {
            const updateEditor = () => {
                const selectedId = editorSelect.value;
                this.popup.querySelectorAll('.vibecode-template-field').forEach(f => {
                    f.style.display = f.dataset.fieldid === selectedId ? 'block' : 'none';
                });
            };
            editorSelect.addEventListener('change', updateEditor);
            updateEditor(); // Init
        }

        const btnHistory = this.popup.querySelector('#btn-reset-history');
        if (btnHistory) {
            btnHistory.onclick = async () => {
                if (confirm("Clear prompt history?")) {
                    this.promptHistory = [];
                    if (chrome && chrome.storage) await new Promise(r => chrome.storage.local.set({ promptHistory: [] }, r));
                    this.renderAutocomplete();
                }
            };
        }

        const btnTemplates = this.popup.querySelector('#btn-reset-templates');
        if (btnTemplates) {
            btnTemplates.onclick = async () => {
                if (confirm("Reset templates to default?")) {
                    const def = VibeCodeConfig.configs.promptTemplate.default;
                    if (chrome && chrome.storage) await new Promise(r => chrome.storage.local.set({ promptTemplate: def, activeTemplate: 'default' }, r));
                    this.rebuildPopup();
                }
            };
        }

        const btnPresets = this.popup.querySelector('#btn-reset-presets');
        if (btnPresets) {
            btnPresets.onclick = async () => {
                if (confirm("Reset preset actions to default?")) {
                    const def = VibeCodeConfig.configs.customPresets.default;
                    if (chrome && chrome.storage) await new Promise(r => chrome.storage.local.set({ customPresets: def }, r));
                    this.rebuildPopup();
                }
            };
        }

        const btnSettings = this.popup.querySelector('#btn-reset-settings');
        if (btnSettings) {
            btnSettings.onclick = async () => {
                if (confirm("Reset all settings (excluding history/templates)?")) {
                    const defaults = VibeCodeConfig.getDefaults();
                    delete defaults.promptHistory;
                    delete defaults.promptTemplate;
                    delete defaults.customPresets;
                    delete defaults.activeTemplate;
                    if (chrome && chrome.storage) await new Promise(r => chrome.storage.local.set(defaults, r));
                    this.rebuildPopup();
                }
            };
        }

        const btnCross = this.popup.querySelector('#btn-reset-cross-site');
        if (btnCross) {
            btnCross.onclick = async () => {
                if (confirm("This will clear ALL captured data from ALL sites and pages. Are you sure?")) {
                    console.log('🧹 Clearing Cross-Site Data...');
                    
                    // 1. Clear Local State
                    this.crossSiteStore = { sites: {} };
                    this.selectedPages = new Set();
                    this.selectedElements = [];
                    this.capturedLogs = [];
                    this.capturedNetwork = [];
                    this.capturedDynamicState = [];
                    this.recordedActions = [];
                    this.selectedText = '';
                    this.elementScreenshots = [];
                    
                    // 2. Remove all highlights
                    this.removeHighlight();

                    // 3. Clear Storage
                    if (chrome && chrome.storage) {
                        try {
                            await new Promise((resolve, reject) => {
                                chrome.storage.local.set({ 
                                    crossSiteStore: { sites: {} }, 
                                    selectedPages: [] 
                                }, () => {
                                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                                    else resolve();
                                });
                            });
                            console.log('✅ Storage cleared successfully');
                        } catch (err) {
                            console.error('❌ Failed to clear storage:', err);
                        }
                    }
                    
                    // 4. Update UI
                    this.updateCapturedDataViews();
                    this.showToast('All cross-site data cleared');
                    
                    // 5. If nothing selected, close the popup (optional but cleaner)
                    if (this.selectedElements.length === 0) {
                        setTimeout(() => this.closePopup(), 1000);
                    }
                }
            };
        }

        const otEl = this.popup.querySelector('#config-output-target');
        if (otEl) {
            otEl.addEventListener('change', () => this.updateOutputRowVisibility());
            this.updateOutputRowVisibility();
        }
    }

    async rebuildPopup() {
        if (!this.popup) return;

        const rect = this.popup.getBoundingClientRect();
        const state = {
            x: rect.left,
            y: rect.top,
            customPrompt: this.popup.querySelector('#vibecode-custom-prompt')?.value || '',
            activeTab: this.popup.querySelector('.vibecode-tab-btn.active')?.dataset.tabtarget || 'ide',
            settingsOpen: this.popup.querySelector('.vibecode-settings-panel')?.style.display !== 'none',
            checks: {}
        };
        this.popup.querySelectorAll('.vibecode-capture-checkbox').forEach(cb => {
            state.checks[cb.id] = cb.checked;
        });

        if (this.dragHandlers) { document.removeEventListener('mousemove', this.dragHandlers.move); document.removeEventListener('mouseup', this.dragHandlers.up); this.dragHandlers = null; }
        this.popup.remove();
        this.popup = null;

        const res = await new Promise(resolve => chrome.storage.local.get(null, resolve));
        this.enableMultiSelect = res.enableMultiSelect === true;
        this.recordActionsEnabled = res.recordActions !== false;

        await this.createPopup(state.x, state.y, res);

        if (this.popup) {
            const cp = this.popup.querySelector('#vibecode-custom-prompt');
            if (cp) cp.value = state.customPrompt;
            if (state.settingsOpen) {
                const sp = this.popup.querySelector('.vibecode-settings-panel');
                if (sp) sp.style.display = 'flex';
            }
            const tabBtn = this.popup.querySelector(`[data-tabtarget="${state.activeTab}"]`);
            if (tabBtn) tabBtn.click();

            Object.keys(state.checks).forEach(id => {
                const cb = this.popup.querySelector('#' + id);
                if (cb) cb.checked = state.checks[id];
            });
            // Also need to manually call updateElementsList just in case
            this.updateElementsList();
        }
    }

    closePopup() {
        if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
        if (this.dragHandlers) { document.removeEventListener('mousemove', this.dragHandlers.move); document.removeEventListener('mouseup', this.dragHandlers.up); this.dragHandlers = null; }
        if (this.popup) { this.popup.remove(); this.popup = null; }
        this.removeHighlight();
        this.selectedElements = [];
        this.hoveredElement = null;

        const autocompleteDropdown = document.getElementById('vibecode-autocomplete');
        if (autocompleteDropdown) autocompleteDropdown.style.display = 'none';
    }

    removeHighlight() {
        document.querySelectorAll('.vibecode-highlight, .vibecode-multi-highlight').forEach(el => {
            el.classList.remove('vibecode-highlight');
            el.classList.remove('vibecode-multi-highlight');
        });
    }

    getImportantCSS(el) {
        const styles = window.getComputedStyle(el);
        const important = ['display', 'flex-direction', 'justify-content', 'align-items', 'width', 'height', 'margin', 'padding', 'color', 'background', 'background-color', 'font-size', 'font-weight', 'border', 'border-radius', 'box-shadow', 'position', 'opacity', 'transform', 'filter'];
        let cssStr = '';
        important.forEach(prop => {
            const val = styles.getPropertyValue(prop);
            if (val && val !== 'none' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)' && val !== 'normal') {
                cssStr += `${prop}: ${val}; `;
            }
        });
        return cssStr.trim() || 'No explicit styles';
    }

    getJSContext(el) {
        const context = {};
        
        // 1. Framework Props/State
        for (const key in el) {
            // React
            if (key.startsWith('__reactProps') || key.startsWith('__reactFiber')) {
                context.react = { 
                    type: el[key]?.type?.name || el[key]?.type || 'component',
                    props: typeof el[key]?.props === 'object' ? { ...el[key].props } : 'unknown'
                };
                // Clean up props to avoid circular refs or huge objects
                if (context.react.props.children) context.react.props.children = '[children]';
            }
            // Vue
            if (key === '__vue__' || key === '__vue_app__') {
                context.vue = { version: key === '__vue__' ? '2.x' : '3.x' };
            }
        }

        // 2. Event Listeners (standard properties only)
        const events = [];
        const commonEvents = ['onclick', 'onchange', 'oninput', 'onsubmit', 'onmouseenter', 'onmouseleave', 'onkeydown'];
        commonEvents.forEach(evt => {
            if (el[evt]) events.push(evt.replace('on', ''));
        });
        if (events.length > 0) context.inlineEvents = events;

        // 3. Data attributes
        const dataAttrs = {};
        for (const attr of el.attributes) {
            if (attr.name.startsWith('data-')) {
                dataAttrs[attr.name] = attr.value;
            }
        }
        if (Object.keys(dataAttrs).length > 0) context.dataAttributes = dataAttrs;

        return Object.keys(context).length > 0 ? context : null;
    }

    getDynamicState(el) {
        const entries = [];
        const selector = this.getSelectorForElement(el, 'auto');
        
        const inputs = el.querySelectorAll('input, textarea, select');
        const list = el.tagName.toLowerCase().match(/input|textarea|select/) 
            ? [el, ...Array.from(inputs)] 
            : Array.from(inputs);
    
        if (list.length > 0) {
            const form = el.closest('form');
            if (form) {
                entries.push({ el: selector, key: '_form', value: { id: form.id || null, name: form.name || null } });
            }
    
            list.forEach(input => {
                const id = input.id || input.name || input.tagName.toLowerCase();
                let val = input.value;
                if (input.type === 'checkbox' || input.type === 'radio') val = input.checked;
                entries.push({ el: selector, key: id, value: val });
            });
        }
    
        if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
            entries.push({ el: selector, key: 'scroll', value: { top: el.scrollTop, left: el.scrollLeft } });
        }
    
        return entries;
    }

    async captureElementScreenshot(el) {
        if (typeof chrome === 'undefined' || !chrome.runtime) return;
        if (!this.popup) return;

        const rect = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        try {
            // 1. Add shutter effect class to popup
            this.popup.classList.add('vibecode-shutter-flash');
            
            // 2. Hide everything reliably
            const originalOpacity = this.popup.style.opacity;
            this.popup.style.opacity = '0';
            this.popup.style.pointerEvents = 'none';
            if (this.toast) this.toast.style.opacity = '0';

            // 3. Give the browser enough time to paint the "hidden" state
            // 100ms is the "golden" number for captureVisibleTab reliability
            await new Promise(r => setTimeout(r, 100));

            const response = await new Promise(resolve => chrome.runtime.sendMessage({ action: "captureTab" }, resolve));
            
            // 4. Restore visibility
            this.popup.style.opacity = originalOpacity;
            this.popup.style.pointerEvents = 'auto';
            if (this.toast) this.toast.style.opacity = '1';
            
            // Remove flash after a tiny bit
            setTimeout(() => this.popup.classList.remove('vibecode-shutter-flash'), 100);

            if (!response || !response.dataUrl) return;

            const img = new Image();
            img.src = response.dataUrl;
            await new Promise(r => img.onload = r);

            const canvas = document.createElement('canvas');
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr, 0, 0, rect.width * dpr, rect.height * dpr);
            
            const base64 = canvas.toDataURL('image/png');
            this.elementScreenshots.push({ id: Date.now(), base64: base64, tagName: el.tagName.toLowerCase() });
            this.updateCapturedDataViews();
        } catch (e) {
            console.error("Screenshot failed:", e);
            if (this.popup) {
                this.popup.style.opacity = '1';
                this.popup.style.pointerEvents = 'auto';
            }
        }
    }

    async persistToCrossSite() {
        if (!chrome || !chrome.storage) return;
        const res = await new Promise(resolve => chrome.storage.local.get(null, resolve));
        const url = window.location.href;
        const hostname = window.location.hostname || 'local-page';
        
        const siteData = {
            url: url,
            hostname: hostname,
            title: document.title,
            elements: this.selectedElements.map(el => ({
                html: (() => {
                    const clone = el.cloneNode(true);
                    clone.classList.remove('vibecode-highlight', 'vibecode-multi-highlight');
                    return clone.outerHTML;
                })(),
                css: this.getImportantCSS(el),
                selector: this.getSelectorForElement(el, res.selectorType || 'auto')
            })),
            logs: this.capturedLogs,
            network: this.capturedNetwork,
            dynamicState: this.capturedDynamicState,
            actions: this.recordedActions,
            selectedText: this.selectedText,
            screenshots: this.elementScreenshots.map(s => s.base64)
        };

        if (this.selectedElements.length > 0 || this.capturedLogs.length > 0 || this.capturedNetwork.length > 0 || this.recordedActions.length > 0 || this.selectedText) {
            this.crossSiteStore.sites[url] = siteData;
        } else {
            delete this.crossSiteStore.sites[url];
        }

        await new Promise(r => chrome.storage.local.set({ crossSiteStore: this.crossSiteStore }, r));
        if (this.popup) this.updateCapturedDataViews();
    }

    getSelectorForElement(el, type = 'auto') {
        if (!el || el.nodeType !== 1) return 'unknown';

        const getID = (e) => e.id ? `#${e.id}` : null;
        const getTestID = (e) => {
            const attr = ['data-testid', 'data-cy', 'data-qa', 'data-test'].find(a => e.hasAttribute(a));
            return attr ? `[${attr}="${e.getAttribute(attr)}"]` : null;
        };
        const getSemantic = (e) => {
            if (e.hasAttribute('aria-label')) return `${e.tagName.toLowerCase()}[aria-label="${e.getAttribute('aria-label')}"]`;
            if (e.hasAttribute('role')) return `${e.tagName.toLowerCase()}[role="${e.getAttribute('role')}"]`;
            if (e.hasAttribute('name')) return `${e.tagName.toLowerCase()}[name="${e.getAttribute('name')}"]`;
            if (e.hasAttribute('placeholder')) return `${e.tagName.toLowerCase()}[placeholder="${e.getAttribute('placeholder')}"]`;
            if (e.tagName === 'IMG' && e.hasAttribute('alt')) return `img[alt="${e.getAttribute('alt')}"]`;
            return null;
        };
        const getComponent = (e) => {
            // Try React
            for (const key in e) {
                if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
                    let fiber = e[key];
                    while (fiber) {
                        if (typeof fiber.type === 'function' && fiber.type.name) return `<${fiber.type.name} />`;
                        if (typeof fiber.type === 'string' && fiber.type === 'body') break;
                        fiber = fiber.return;
                    }
                }
            }
            // Try Vue
            if (e.__vue__ || e.__vue_app__) {
                const vm = e.__vue__ || e.__vue_app__;
                return `<${vm.$options?.name || 'VueComponent'} />`;
            }
            return null;
        };
        const getCSS = (e) => {
            if (e.id) return `#${e.id}`;
            const cleanClasses = Array.from(e.classList).filter(c => !c.includes('vibecode'));
            if (cleanClasses.length > 0) return `${e.tagName.toLowerCase()}.${cleanClasses.join('.')}`;
            return e.tagName.toLowerCase();
        };
        const getStrictCSS = (e) => {
            const path = [];
            let current = e;
            while (current && current.nodeType === 1) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                    selector += `#${current.id}`;
                    path.unshift(selector);
                    break;
                } else {
                    let sib = current, nth = 1;
                    while (sib = sib.previousElementSibling) {
                        if (sib.tagName === current.tagName) nth++;
                    }
                    if (nth > 1) selector += `:nth-of-type(${nth})`;
                }
                path.unshift(selector);
                current = current.parentElement;
            }
            return path.join(' > ');
        };
        const getXPath = (e) => {
            if (e.id) return `//*[@id="${e.id}"]`;
            let path = '';
            for (let node = e; node && node.nodeType === 1; node = node.parentNode) {
                let idx = 1;
                for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
                    if (sib.nodeType === 1 && sib.tagName === node.tagName) idx++;
                }
                let xname = node.tagName.toLowerCase();
                if (node.id) { path = `/*[@id="${node.id}"]` + path; break; }
                path = `/${xname}[${idx}]` + path;
            }
            return path || e.tagName.toLowerCase();
        };

        if (type === 'auto') {
            return getID(el) || getTestID(el) || getSemantic(el) || getComponent(el) || getCSS(el);
        }
        if (type === 'semantic') return getSemantic(el) || getCSS(el);
        if (type === 'data-testid') return getTestID(el) || getCSS(el);
        if (type === 'css-strict') return getStrictCSS(el);
        if (type === 'xpath') return getXPath(el);
        if (type === 'component') return getComponent(el) || getCSS(el);
        if (type === 'css') return getCSS(el);

        return getCSS(el);
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async buildPromptPayload() {
        const isChecked = (id) => {
            const el = this.popup ? this.popup.querySelector('#' + id) : null;
            if (el) return el.checked;
            // Fallback to config if popup element not found
            const configKey = el?.dataset?.configkey;
            if (configKey) return this.res[configKey] !== false && this.res[configKey] !== 'none';
            return true;
        };

        const config = this.res;
        const customInstructionEl = this.popup ? this.popup.querySelector('#vibecode-custom-prompt') : null;
        const customInstruction = customInstructionEl ? customInstructionEl.value.trim() : '';

        if (customInstruction && chrome && chrome.storage) {
            let history = this.promptHistory;
            if (!history.includes(customInstruction)) {
                history.unshift(customInstruction);
                if (history.length > 10) history = history.slice(0, 10);
                chrome.storage.local.set({ promptHistory: history });
            }
        }

        const instructionText = customInstruction || "make it look more premium, modern, and beautiful.";

        // 1. Gather all data first (Local + Cross-Site)
        let localElements = this.selectedElements || [];
        let localLogs = this.capturedLogs || [];
        let localNetwork = this.capturedNetwork || [];
        let localState = this.capturedDynamicState || [];
        let localScreens = this.elementScreenshots || [];
        let localActions = this.recordedActions || [];
        let localText = this.selectedText || "";

        let allHTML = "";
        let allCSS = "";
        let allScreens = [];
        let allLogs = [...localLogs];
        let allNetwork = [...localNetwork];
        let allState = [...localState];
        let allActions = [...localActions];
        let allText = localText ? [localText] : [];

        // Prepare local HTML/CSS
        localElements.forEach((el, i) => {
            const clone = el.cloneNode(true);
            clone.classList.remove('vibecode-highlight', 'vibecode-multi-highlight');
            allHTML += `<!-- Element ${i + 1} -->\n${clone.outerHTML}\n\n`;
            allCSS += `/* Element ${i + 1} */\n${this.getImportantCSS(el)}\n\n`;
        });
        localScreens.forEach((s, i) => {
            allScreens.push(`[Screenshot ${i + 1}]: ${s.base64}`);
        });

        // Add Cross-Site data if enabled
        if (config.enableCrossSiteCapture && this.crossSiteStore && this.crossSiteStore.sites) {
            this.selectedPages.forEach(url => {
                if (url === window.location.href) return;
                const data = this.crossSiteStore.sites[url];
                if (data) {
                    const pageTag = data.title || url.split('/').pop() || 'Remote';
                    if (data.elements) {
                        data.elements.forEach(e => {
                            allHTML += `<!-- From: ${pageTag} (${url}) -->\n${e.html}\n\n`;
                            allCSS += `/* From: ${pageTag} */\n${e.css}\n\n`;
                        });
                    }
                    if (data.logs) allLogs.push(...data.logs.map(l => ({ ...l, site: pageTag })));
                    if (data.network) allNetwork.push(...data.network.map(n => ({ ...n, site: pageTag })));
                    if (data.dynamicState) allState.push(...data.dynamicState.map(s => ({ ...s, site: pageTag })));
                    if (data.actions) allActions.push(...data.actions.map(a => ({ ...a, site: pageTag })));
                    if (data.selectedText) allText.push(data.selectedText);
                    if (data.screenshots) {
                        data.screenshots.forEach((s, i) => {
                            allScreens.push(`[Screenshot ${pageTag}-${i + 1}]: ${s}`);
                        });
                    }
                }
            });
        }

        let selType = config.selectorType || 'auto';
        let selString = 'Multiple Elements';
        if (localElements.length === 1) {
            selString = this.getSelectorForElement(localElements[0], selType);
        }

        const modules = {
            instruction: { 
                val: instructionText, 
                tpl: config.templateInstruction, 
                checked: true 
            },
            html: { 
                val: allHTML.trim(), 
                tpl: config.templateHTML, 
                checked: isChecked('header-check-captureHTML') && allHTML.trim().length > 0 
            },
            dynamic_state: { 
                val: allState.length > 0 ? JSON.stringify(allState, null, 2) : "", 
                tpl: config.templateDynamicState, 
                checked: isChecked('header-check-includeDynamicState') && allState.length > 0 
            },
            element_screenshots: { 
                val: allScreens.join('\n'), 
                tpl: config.templateElementScreenshots, 
                checked: isChecked('header-check-captureElementScreenshots') && allScreens.length > 0 
            },
            css: { 
                val: allCSS.trim(), 
                tpl: config.templateCSS, 
                checked: isChecked('header-check-captureCSS') && allCSS.trim().length > 0 
            },
            logs: { 
                val: allLogs.length > 0 ? JSON.stringify(allLogs, null, 2) : "", 
                tpl: config.templateLogs, 
                checked: isChecked('header-check-captureLogs') && allLogs.length > 0 
            },
            network: { 
                val: allNetwork.length > 0 ? JSON.stringify(allNetwork, null, 2) : "", 
                tpl: config.templateNetwork, 
                checked: isChecked('header-check-captureNetwork') && allNetwork.length > 0 
            },
            page_info: { 
                val: window.location.href, 
                tpl: config.templatePageInfo, 
                checked: isChecked('header-check-includePageInfo') 
            },
            browser_info: { 
                val: navigator.userAgent, 
                tpl: config.templateBrowserInfo, 
                checked: isChecked('header-check-includeBrowserInfo') 
            },
            actions: { 
                val: allActions.length > 0 ? JSON.stringify(allActions, null, 2) : "", 
                tpl: config.templateActions, 
                checked: isChecked('header-check-recordActions') && allActions.length > 0 
            },
            selected_text: { 
                val: allText.join('\n\n'), 
                tpl: config.templateSelectedText, 
                checked: isChecked('header-check-captureSelection') && allText.length > 0 
            },
            js_context: { 
                val: allState.filter(s => s.key === 'js_context').length > 0 ? JSON.stringify(allState.filter(s => s.key === 'js_context').map(s => ({ el: s.el, context: s.value, site: s.site })), null, 2) : "", 
                tpl: config.templateJSContext, 
                checked: isChecked('header-check-captureJSContext') && allState.some(s => s.key === 'js_context')
            },
            images: { 
                val: localElements.filter(el => el.tagName.toLowerCase() === 'img').map((img, i) => `[Image ${i + 1}]: ${img.src}`).join('\n'), 
                tpl: config.templateImages, 
                checked: isChecked('header-check-captureImages') && localElements.some(el => el.tagName.toLowerCase() === 'img')
            }
        };

        let prompt = config.mainTemplate || "{instruction}\n\n{html}";

        // Global replace selector
        prompt = prompt.replace(/{selector}/g, selString);

        Object.keys(modules).forEach(key => {
            const mod = modules[key];
            const placeholder = `{${key}}`;
            if (mod.checked && mod.val) {
                let content = mod.tpl.replace(placeholder, mod.val).replace(/{selector}/g, selString);
                prompt = prompt.replace(placeholder, content);
            } else {
                prompt = prompt.replace(placeholder, "");
            }
        });

        return prompt.trim();
    }

    async sendToAntigravity() {
        const prompt = await this.buildPromptPayload();
        if (!prompt) return;

        const config = this.res;
        
        const project = config.targetProject || 'antigravity';
        const chatType = config.chatType || 'same';
        const model = config.modelSelection || 'auto';
        const confirmSend = config.confirmBeforeSend === true || config.confirmBeforeSend === 'true';

        const onConfirm = async (finalPrompt) => {
            this.showToast('Routing capture...');
            
            if (config.outputTarget === 'api') {
                const webhookUrl = config.webhookUrl;
                if (!webhookUrl) { this.showToast('❌ Please specify a Webhook URL in settings.'); return; }
                try {
                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: finalPrompt, timestamp: new Date().toISOString(), metadata: { url: window.location.href, title: document.title } })
                    });
                    if (response.ok) this.showToast('🚀 Sent to API successfully!');
                    else this.showToast('❌ Failed to send to API.');
                } catch (e) { this.showToast('❌ API Error: ' + e.message); }
            } else if (config.outputTarget === 'mcp') {
                const mcpUrl = config.mcpUrl || 'http://localhost:3000';
                try {
                    const response = await fetch(mcpUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ method: "resource/update", params: { uri: "vibecode://current-capture", text: finalPrompt } })
                    });
                    if (response.ok) this.showToast('🚀 Sent to MCP Host!');
                    else this.showToast('❌ MCP Host returned an error.');
                } catch (e) { this.showToast('❌ Could not connect to MCP Host.'); }
            } else if (config.outputTarget === 'cli') {
                const cliCommand = config.cliCommand || 'pbcopy';
                if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: "runCli", command: cliCommand, prompt: finalPrompt }, (response) => {
                        if (response && response.success) this.showToast(`🚀 Executed: ${cliCommand}`);
                        else this.showToast(`❌ CLI Failed: ${response?.error || 'Unknown error'}`);
                    });
                }
            } else {
                // IDE or File (both go through bridge)
                const isFile = config.outputTarget === 'file';
                const outputTarget = config.outputTarget || 'ide';
                
                if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                        action: "sendToIDE",
                        payload: {
                            prompt: finalPrompt,
                            project: project,
                            chatType: chatType,
                            saveToFile: isFile,
                            outputTarget: outputTarget,
                            fileName: config.taskFileName
                        }
                    }, (response) => {
                        if (response && response.success) {
                            this.showToast(outputTarget === 'file' ? '📂 Saved to IDE file!' : '🚀 Sent to IDE Chat!');
                        } else {
                            this.showToast('❌ Failed to connect to IDE bridge.');
                        }
                    });
                }
            }
            this.closePopup();
        };

        if (confirmSend) {
            this.showConfirmModal(prompt, 'Confirm & Send', onConfirm);
        } else {
            onConfirm(prompt);
        }
    }

    showConfirmModal(prompt, btnText, onConfirm) {
        const overlay = document.createElement('div');
        overlay.id = 'vibecode-confirm-overlay';
        overlay.style = "position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(5px); z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:20px; font-family:system-ui,-apple-system,sans-serif;";
        
        const modal = document.createElement('div');
        modal.style = "background:#0f172a; border:1px solid rgba(255,255,255,0.1); border-radius:12px; width:100%; max-width:600px; display:flex; flex-direction:column; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); overflow:hidden;";
        
        modal.innerHTML = `
            <div style="padding:16px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:14px; color:#fff;">Review Generated Prompt</h3>
                <span id="confirm-close" style="cursor:pointer; color:#94a3b8; font-size:20px;">&times;</span>
            </div>
            <div style="padding:16px; flex:1;">
                <textarea id="confirm-textarea" style="width:100%; height:350px; background:rgba(0,0,0,0.3); color:#cbd5e1; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:12px; font-family:monospace; font-size:12px; resize:none; outline:none; scrollbar-width:thin;">${prompt}</textarea>
            </div>
            <div style="padding:12px 16px; background:rgba(255,255,255,0.02); display:flex; gap:8px; justify-content:flex-end;">
                <button id="confirm-cancel" style="padding:6px 16px; background:transparent; border:1px solid rgba(255,255,255,0.1); color:#94a3b8; border-radius:6px; cursor:pointer; font-size:12px;">Cancel</button>
                <button id="confirm-send" style="padding:6px 20px; background:linear-gradient(135deg, #3b82f6, #8b5cf6); border:none; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">${btnText}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        const close = () => overlay.remove();
        overlay.querySelector('#confirm-close').onclick = close;
        overlay.querySelector('#confirm-cancel').onclick = close;
        overlay.querySelector('#confirm-send').onclick = () => {
            const finalPrompt = overlay.querySelector('#confirm-textarea').value;
            onConfirm(finalPrompt);
            close();
        };
    }
}

new VibeCodeExtension();
