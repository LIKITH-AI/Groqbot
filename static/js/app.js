/**
 * chitchat — Main Application Engine
 * Integrates Groq LLM streaming, multimodal file/image attachments,
 * Markdown & syntax highlighting, theme switching, and settings.
 */

// Toast notification helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
        iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.25s ease-out';
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

class ChitChatApp {
    constructor() {
        this.currentConversationId = null;
        this.activeModel = 'llama-3.3-70b-versatile';
        this.queuedAttachments = [];
        this.isStreaming = false;
        this.abortController = null;
        this.apiKeyConfigured = false;

        // DOM elements
        this.messagesContainer = document.getElementById('messages-container');
        this.messagesList = document.getElementById('messages-list');
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.chatForm = document.getElementById('chat-form');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.scrollBottomBtn = document.getElementById('scroll-bottom-btn');

        // Attachments
        this.uploadFileBtn = document.getElementById('upload-file-btn');
        this.fileInput = document.getElementById('file-input');
        this.uploadImageBtn = document.getElementById('upload-image-btn');
        this.imageInput = document.getElementById('image-input');
        this.attachmentsDock = document.getElementById('attachments-dock');
        this.dockItems = document.getElementById('dock-items');
        this.attachmentCountEl = document.getElementById('attachment-count');
        this.clearAttachmentsBtn = document.getElementById('clear-attachments-btn');

        // Sidebar & UI
        this.sidebar = document.getElementById('sidebar');
        this.sidebarBackdrop = document.getElementById('sidebar-backdrop');
        this.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        this.closeSidebarBtn = document.getElementById('close-sidebar-btn');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        this.activeModelName = document.getElementById('active-model-name');

        // Modals & Banners
        this.settingsModal = document.getElementById('settings-modal');
        this.openSettingsBtn = document.getElementById('open-settings-btn');
        this.closeSettingsBtn = document.getElementById('close-settings-btn');
        this.cancelSettingsBtn = document.getElementById('cancel-settings-btn');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.settingsApiKey = document.getElementById('settings-api-key');
        this.toggleKeyVisBtn = document.getElementById('toggle-key-visibility-btn');
        this.keyStatusBadge = document.getElementById('key-status-badge');
        this.settingsTextModel = document.getElementById('settings-text-model');
        this.settingsVisionModel = document.getElementById('settings-vision-model');
        this.apiKeyBanner = document.getElementById('api-key-banner');
        this.bannerSettingsBtn = document.getElementById('banner-settings-btn');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.getElementById('status-text');

        this.initMarked();
        this.initTheme();
        this.initEventListeners();
        this.checkServerStatus();
        this.startNewChat();
    }

    initMarked() {
        // Configure Marked with Highlight.js
        const renderer = new marked.Renderer();
        
        // Custom code block renderer with copy button & language header
        renderer.code = function({ text, lang }) {
            const validLang = lang && hljs.getLanguage(lang) ? lang : '';
            let highlighted = '';
            try {
                highlighted = validLang 
                    ? hljs.highlight(text, { language: validLang, ignoreIllegals: true }).value 
                    : hljs.highlightAuto(text).value;
            } catch (e) {
                highlighted = escapeHtml(text);
            }

            const displayLang = validLang || 'code';
            const escapedCodeForAttr = escapeHtml(text);

            return `
                <div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-lang">${displayLang}</span>
                        <button type="button" class="copy-code-btn" data-code="${escapedCodeForAttr}">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span>Copy</span>
                        </button>
                    </div>
                    <pre><code class="hljs ${validLang}">${highlighted}</code></pre>
                </div>
            `;
        };

        marked.setOptions({
            renderer: renderer,
            breaks: true,
            gfm: true
        });
    }

    initTheme() {
        const savedTheme = localStorage.getItem('chitchat_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcons(savedTheme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('chitchat_theme', next);
        this.updateThemeIcons(next);

        // Update highlight.js theme link
        const hljsLink = document.getElementById('hljs-theme');
        if (hljsLink) {
            hljsLink.href = next === 'dark'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css';
        }
    }

    updateThemeIcons(theme) {
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');
        if (sunIcon && moonIcon) {
            if (theme === 'dark') {
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            } else {
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            }
        }
    }

    initEventListeners() {
        // Theme toggle
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }

        // Sidebar mobile controls
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.addEventListener('click', () => {
                this.sidebar.classList.add('open');
                this.sidebarBackdrop.classList.add('active');
            });
        }
        if (this.closeSidebarBtn) {
            this.closeSidebarBtn.addEventListener('click', () => {
                this.sidebar.classList.remove('open');
                this.sidebarBackdrop.classList.remove('active');
            });
        }
        if (this.sidebarBackdrop) {
            this.sidebarBackdrop.addEventListener('click', () => {
                this.sidebar.classList.remove('open');
                this.sidebarBackdrop.classList.remove('active');
            });
        }

        // New Chat
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => this.startNewChat());
        }

        // Settings Modal
        if (this.openSettingsBtn) {
            this.openSettingsBtn.addEventListener('click', () => this.openSettings());
        }
        if (this.bannerSettingsBtn) {
            this.bannerSettingsBtn.addEventListener('click', () => this.openSettings());
        }
        if (this.closeSettingsBtn) {
            this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
        if (this.cancelSettingsBtn) {
            this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        if (this.toggleKeyVisBtn) {
            this.toggleKeyVisBtn.addEventListener('click', () => {
                const isPassword = this.settingsApiKey.type === 'password';
                this.settingsApiKey.type = isPassword ? 'text' : 'password';
            });
        }

        // Chat Form Submission & Textarea Auto-resize
        if (this.chatForm) {
            this.chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (this.isStreaming) {
                    this.stopStreaming();
                } else {
                    this.handleSendMessage();
                }
            });
        }

        if (this.userInput) {
            this.userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!this.isStreaming) {
                        this.handleSendMessage();
                    }
                }
            });

            this.userInput.addEventListener('input', () => {
                this.userInput.style.height = 'auto';
                this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';
            });
        }

        // File & Image Upload Handlers
        if (this.uploadFileBtn && this.fileInput) {
            this.uploadFileBtn.addEventListener('click', () => this.fileInput.click());
            this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e.target.files));
        }

        if (this.uploadImageBtn && this.imageInput) {
            this.uploadImageBtn.addEventListener('click', () => this.imageInput.click());
            this.imageInput.addEventListener('change', (e) => this.handleFileSelection(e.target.files));
        }

        if (this.clearAttachmentsBtn) {
            this.clearAttachmentsBtn.addEventListener('click', () => this.clearAllAttachments());
        }

        // Drag and Drop Uploads
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.handleFileSelection(e.dataTransfer.files);
            }
        });

        // Scroll to bottom floating button
        if (this.messagesContainer && this.scrollBottomBtn) {
            this.messagesContainer.addEventListener('scroll', () => {
                const diff = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop - this.messagesContainer.clientHeight;
                this.scrollBottomBtn.classList.toggle('hidden', diff <= 120);
            });
            this.scrollBottomBtn.addEventListener('click', () => this.scrollToBottom(true));
        }

        // Global Copy Code Delegation
        document.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.copy-code-btn');
            if (copyBtn) {
                const code = copyBtn.dataset.code;
                if (code) {
                    navigator.clipboard.writeText(code).then(() => {
                        const span = copyBtn.querySelector('span');
                        if (span) span.textContent = 'Copied!';
                        setTimeout(() => { if (span) span.textContent = 'Copy'; }, 2000);
                        showToast('Code copied to clipboard.', 'success');
                    });
                }
            }
        });

        // Welcome Suggestion Chips
        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                if (prompt) {
                    this.userInput.value = prompt;
                    this.userInput.style.height = 'auto';
                    this.handleSendMessage();
                }
            });
        });

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'n')) {
                e.preventDefault();
                this.startNewChat();
            } else if (e.key === 'Escape') {
                this.closeSettings();
                if (window.audioController) {
                    window.audioController.cancelRecording();
                }
            }
        });
    }

    async checkServerStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            this.apiKeyConfigured = data.api_key_configured;

            if (this.statusDot) {
                this.statusDot.className = `status-dot ${this.apiKeyConfigured ? 'online' : 'offline'}`;
            }
            if (this.statusText) {
                this.statusText.textContent = this.apiKeyConfigured ? 'Groq Connected' : 'Groq Key Missing';
            }

            if (this.apiKeyBanner) {
                this.apiKeyBanner.classList.toggle('hidden', this.apiKeyConfigured);
            }

            if (this.activeModelName) {
                this.activeModel = data.default_text_model || 'llama-3.3-70b-versatile';
                this.activeModelName.textContent = this.formatModelName(this.activeModel);
            }

            if (this.keyStatusBadge) {
                this.keyStatusBadge.className = `key-status-badge ${this.apiKeyConfigured ? 'active' : 'missing'}`;
                this.keyStatusBadge.textContent = this.apiKeyConfigured 
                    ? `Active (${data.masked_key || 'Configured'})` 
                    : 'Not Configured';
            }

            if (this.settingsTextModel && data.default_text_model) {
                this.settingsTextModel.value = data.default_text_model;
            }
            if (this.settingsVisionModel && data.default_vision_model) {
                this.settingsVisionModel.value = data.default_vision_model;
            }

            // Load conversations in sidebar
            if (window.historyController) {
                window.historyController.loadConversations();
            }

        } catch (err) {
            console.error('Server status check failed:', err);
            if (this.statusText) this.statusText.textContent = 'Server Offline';
        }
    }

    formatModelName(modelId) {
        if (modelId.includes('70b')) return 'Llama 3.3 70B';
        if (modelId.includes('8b')) return 'Llama 3.1 8B';
        if (modelId.includes('11b')) return 'Llama 3.2 Vision';
        if (modelId.includes('mixtral')) return 'Mixtral 8x7B';
        return modelId;
    }

    startNewChat() {
        // Abort any ongoing stream
        if (this.isStreaming) {
            this.stopStreaming();
        }

        // Generate a fresh unique ID
        this.currentConversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        this.messagesList.innerHTML = '';
        this.welcomeScreen.classList.remove('hidden');
        this.clearAllAttachments();

        if (window.historyController) {
            window.historyController.setActiveConversation(this.currentConversationId, 'New Chat');
        }

        if (this.userInput) {
            this.userInput.value = '';
            this.userInput.style.height = 'auto';
            this.userInput.focus();
        }
    }

    async switchConversation(convId) {
        if (this.isStreaming) {
            this.stopStreaming();
        }

        try {
            const res = await fetch(`/api/conversations/${convId}`);
            const data = await res.json();
            if (!data.conversation) {
                showToast('Conversation could not be found.', 'error');
                return;
            }

            this.currentConversationId = convId;
            const conv = data.conversation;
            const messages = data.messages || [];

            if (window.historyController) {
                window.historyController.setActiveConversation(conv.id, conv.title);
            }

            this.messagesList.innerHTML = '';

            if (messages.length === 0) {
                this.welcomeScreen.classList.remove('hidden');
            } else {
                this.welcomeScreen.classList.add('hidden');
                messages.forEach(msg => {
                    this.appendMessageToDOM(msg.role, msg.content, msg.attachments, msg.id, false);
                });
                this.scrollToBottom(false);
            }

            if (this.userInput) {
                this.userInput.focus();
            }
        } catch (err) {
            console.error('Error switching conversation:', err);
            showToast('Failed to load conversation messages.', 'error');
        }
    }

    async handleFileSelection(files) {
        if (!files || files.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        showToast('Uploading and parsing files...', 'info');

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.attachments && data.attachments.length > 0) {
                data.attachments.forEach(att => {
                    if (att.type === 'error') {
                        showToast(`Failed to parse ${att.filename}: ${att.error}`, 'error');
                    } else {
                        this.queuedAttachments.push(att);
                    }
                });

                this.renderAttachmentsDock();
                showToast(`Attached ${data.attachments.length} file(s).`, 'success');
            } else {
                showToast('No valid files were uploaded.', 'error');
            }
        } catch (err) {
            console.error('Upload error:', err);
            showToast('Error uploading files.', 'error');
        }

        // Reset file inputs
        if (this.fileInput) this.fileInput.value = '';
        if (this.imageInput) this.imageInput.value = '';
    }

    renderAttachmentsDock() {
        if (!this.attachmentsDock || !this.dockItems) return;

        if (this.queuedAttachments.length === 0) {
            this.attachmentsDock.classList.add('hidden');
            return;
        }

        this.attachmentsDock.classList.remove('hidden');
        if (this.attachmentCountEl) {
            this.attachmentCountEl.textContent = this.queuedAttachments.length;
        }

        let html = '';
        this.queuedAttachments.forEach((att, idx) => {
            const safeName = escapeHtml(att.filename || 'file');
            if (att.type === 'image') {
                html += `
                    <div class="dock-item">
                        <img src="${att.data_url}" class="dock-item-img" alt="preview">
                        <span class="dock-item-name" title="${safeName}">${safeName}</span>
                        <button type="button" class="dock-item-remove" data-idx="${idx}">×</button>
                    </div>
                `;
            } else {
                html += `
                    <div class="dock-item">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        <span class="dock-item-name" title="${safeName}">${safeName}</span>
                        <button type="button" class="dock-item-remove" data-idx="${idx}">×</button>
                    </div>
                `;
            }
        });

        this.dockItems.innerHTML = html;

        // Removal buttons
        this.dockItems.querySelectorAll('.dock-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx, 10);
                this.queuedAttachments.splice(idx, 1);
                this.renderAttachmentsDock();
            });
        });
    }

    clearAllAttachments() {
        this.queuedAttachments = [];
        this.renderAttachmentsDock();
    }

    async handleSendMessage() {
        const text = this.userInput ? this.userInput.value.trim() : '';
        const attachments = [...this.queuedAttachments];

        if (!text && attachments.length === 0) return;

        if (!this.apiKeyConfigured) {
            this.openSettings();
            showToast('Please configure your Groq API key first.', 'error');
            return;
        }

        // Hide welcome screen
        this.welcomeScreen.classList.add('hidden');

        // Reset input & clear dock
        if (this.userInput) {
            this.userInput.value = '';
            this.userInput.style.height = 'auto';
        }
        this.clearAllAttachments();

        // Append User Message to UI
        this.appendMessageToDOM('user', text, attachments, null, true);

        // Prepare Assistant message container with streaming cursor
        const botMsgEl = this.createBotMessagePlaceholder();
        const contentEl = botMsgEl.querySelector('.message-bubble-content');
        const cursorEl = botMsgEl.querySelector('.streaming-cursor');

        this.setStreamingState(true);
        this.abortController = new AbortController();

        let assistantAccumulatedText = '';

        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: this.currentConversationId,
                    message: text,
                    attachments: attachments,
                    model: this.activeModel
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to reach server.`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep last partial line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const event = JSON.parse(jsonStr);

                            if (event.type === 'chunk') {
                                assistantAccumulatedText += event.content;
                                // Real-time render Markdown
                                contentEl.innerHTML = DOMPurify.sanitize(marked.parse(assistantAccumulatedText));
                                this.scrollToBottom(true);

                            } else if (event.type === 'title') {
                                if (window.historyController) {
                                    window.historyController.updateConversationTitleInList(this.currentConversationId, event.title);
                                }

                            } else if (event.type === 'done') {
                                botMsgEl.dataset.msgId = event.message_id || '';
                                const actionsEl = botMsgEl.querySelector('.message-actions');
                                if (actionsEl) {
                                    this.attachMessageActions(actionsEl, event.message_id, assistantAccumulatedText);
                                }

                            } else if (event.type === 'error') {
                                assistantAccumulatedText += `\n\n> ⚠️ **Error:** ${event.error}`;
                                contentEl.innerHTML = DOMPurify.sanitize(marked.parse(assistantAccumulatedText));
                                showToast(event.error, 'error');
                            }
                        } catch (e) {
                            console.warn('Error parsing SSE event:', e);
                        }
                    }
                }
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                assistantAccumulatedText += ' *(Generation stopped by user)*';
                contentEl.innerHTML = DOMPurify.sanitize(marked.parse(assistantAccumulatedText));
            } else {
                console.error('Stream error:', err);
                assistantAccumulatedText += `\n\n> ⚠️ **Connection Error:** ${err.message}`;
                contentEl.innerHTML = DOMPurify.sanitize(marked.parse(assistantAccumulatedText));
                showToast('Streaming interrupted.', 'error');
            }
        } finally {
            if (cursorEl) cursorEl.remove();
            this.setStreamingState(false);
            this.scrollToBottom(true);
            // Refresh conversation history in sidebar
            if (window.historyController) {
                window.historyController.loadConversations();
            }
        }
    }

    stopStreaming() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.setStreamingState(false);
    }

    setStreamingState(isStreaming) {
        this.isStreaming = isStreaming;
        if (this.sendBtn) {
            const sendIcon = this.sendBtn.querySelector('.send-icon');
            const stopIcon = this.sendBtn.querySelector('.stop-icon');
            if (isStreaming) {
                this.sendBtn.classList.add('stop-state');
                this.sendBtn.title = 'Stop generating';
                if (sendIcon) sendIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.remove('hidden');
            } else {
                this.sendBtn.classList.remove('stop-state');
                this.sendBtn.title = 'Send message';
                if (sendIcon) sendIcon.classList.remove('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
            }
        }
    }

    appendMessageToDOM(role, content, attachments = [], msgId = null, shouldScroll = true) {
        const row = document.createElement('div');
        row.className = `message-row ${role}`;
        if (msgId) row.dataset.msgId = msgId;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = role === 'user' ? '👤' : '🤖';

        const bubbleWrap = document.createElement('div');
        bubbleWrap.className = 'message-bubble-wrap';

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.innerHTML = `<span class="sender-name">${role === 'user' ? 'You' : 'chitchat'}</span>`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        // Render Attachments
        if (attachments && attachments.length > 0) {
            const attWrap = document.createElement('div');
            attWrap.className = 'message-attachments';
            attachments.forEach(att => {
                if (att.type === 'image' && att.data_url) {
                    const img = document.createElement('img');
                    img.src = att.data_url;
                    img.className = 'msg-attachment-img';
                    img.alt = att.filename || 'Uploaded image';
                    img.addEventListener('click', () => window.open(att.data_url, '_blank'));
                    attWrap.appendChild(img);
                } else {
                    const fileChip = document.createElement('div');
                    fileChip.className = 'msg-attachment-file';
                    fileChip.innerHTML = `
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        <span>${escapeHtml(att.filename || 'Document')}</span>
                    `;
                    attWrap.appendChild(fileChip);
                }
            });
            bubble.appendChild(attWrap);
        }

        // Render Content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-bubble-content';
        contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(content || ''));
        bubble.appendChild(contentDiv);

        bubbleWrap.appendChild(meta);
        bubbleWrap.appendChild(bubble);

        // Action buttons under assistant message
        if (role === 'assistant') {
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            this.attachMessageActions(actions, msgId, content);
            bubbleWrap.appendChild(actions);
        }

        row.appendChild(avatar);
        row.appendChild(bubbleWrap);

        this.messagesList.appendChild(row);

        if (shouldScroll) {
            this.scrollToBottom(true);
        }

        return row;
    }

    createBotMessagePlaceholder() {
        const row = document.createElement('div');
        row.className = 'message-row bot';

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '🤖';

        const bubbleWrap = document.createElement('div');
        bubbleWrap.className = 'message-bubble-wrap';

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.innerHTML = `<span class="sender-name">chitchat</span>`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-bubble-content';

        const cursor = document.createElement('span');
        cursor.className = 'streaming-cursor';

        bubble.appendChild(contentDiv);
        bubble.appendChild(cursor);

        const actions = document.createElement('div');
        actions.className = 'message-actions';

        bubbleWrap.appendChild(meta);
        bubbleWrap.appendChild(bubble);
        bubbleWrap.appendChild(actions);

        row.appendChild(avatar);
        row.appendChild(bubbleWrap);

        this.messagesList.appendChild(row);
        this.scrollToBottom(true);
        return row;
    }

    attachMessageActions(actionsEl, msgId, content) {
        actionsEl.innerHTML = `
            <button type="button" class="msg-action-btn copy-msg-btn" title="Copy response">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy</span>
            </button>
            <button type="button" class="msg-action-btn speaker-btn" data-msg-id="${msgId || ''}" title="Read aloud">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                <span>Read</span>
            </button>
        `;

        const copyBtn = actionsEl.querySelector('.copy-msg-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content).then(() => {
                    const span = copyBtn.querySelector('span');
                    if (span) span.textContent = 'Copied!';
                    setTimeout(() => { if (span) span.textContent = 'Copy'; }, 2000);
                    showToast('Response copied to clipboard.', 'success');
                });
            });
        }

        const speakerBtn = actionsEl.querySelector('.speaker-btn');
        if (speakerBtn && window.audioController) {
            speakerBtn.addEventListener('click', () => {
                window.audioController.speakMessage(msgId || 'temp', content);
            });
        }
    }

    scrollToBottom(smooth = true) {
        if (!this.messagesContainer) return;
        this.messagesContainer.scrollTo({
            top: this.messagesContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    openSettings() {
        if (this.settingsModal) {
            this.settingsModal.classList.remove('hidden');
            if (this.settingsApiKey) {
                this.settingsApiKey.focus();
            }
        }
    }

    closeSettings() {
        if (this.settingsModal) {
            this.settingsModal.classList.add('hidden');
        }
    }

    async saveSettings() {
        const apiKey = this.settingsApiKey ? this.settingsApiKey.value.trim() : '';
        const textModel = this.settingsTextModel ? this.settingsTextModel.value : '';
        const visionModel = this.settingsVisionModel ? this.settingsVisionModel.value : '';

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groq_api_key: apiKey,
                    default_text_model: textModel,
                    default_vision_model: visionModel
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast('Settings saved successfully.', 'success');
                this.closeSettings();
                this.checkServerStatus();
            } else {
                showToast(data.error || 'Failed to save settings.', 'error');
            }
        } catch (err) {
            console.error('Settings save error:', err);
            showToast('Error saving settings.', 'error');
        }
    }
}

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChitChatApp();
});
