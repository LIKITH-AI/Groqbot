/**
 * chitchat — History & Conversation Management Module
 * Handles loading, grouping, switching, searching, renaming, and deleting conversations.
 */

class HistoryController {
    constructor() {
        this.conversations = [];
        this.activeConversationId = null;
        this.historyListEl = document.getElementById('history-list');
        this.searchInput = document.getElementById('history-search-input');
        this.clearSearchBtn = document.getElementById('clear-search-btn');
        this.currentChatTitleEl = document.getElementById('current-chat-title');
        this.editTitleBtn = document.getElementById('edit-title-btn');
        this.deleteChatBtn = document.getElementById('delete-current-chat-btn');
        this.clearAllBtn = document.getElementById('clear-all-history-btn');
        this.searchTimeout = null;

        this.initEventListeners();
    }

    initEventListeners() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                if (this.clearSearchBtn) {
                    this.clearSearchBtn.classList.toggle('hidden', !val);
                }
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.loadConversations(val);
                }, 250);
            });
        }

        if (this.clearSearchBtn) {
            this.clearSearchBtn.addEventListener('click', () => {
                this.searchInput.value = '';
                this.clearSearchBtn.classList.add('hidden');
                this.loadConversations();
            });
        }

        if (this.editTitleBtn) {
            this.editTitleBtn.addEventListener('click', () => this.startRenameTitle());
        }

        if (this.deleteChatBtn) {
            this.deleteChatBtn.addEventListener('click', () => this.deleteActiveConversation());
        }

        if (this.clearAllBtn) {
            this.clearAllBtn.addEventListener('click', () => this.clearAllConversations());
        }

        // Export Actions
        const exportMdBtn = document.getElementById('export-markdown-btn');
        const exportJsonBtn = document.getElementById('export-json-btn');
        const exportDropdownBtn = document.getElementById('export-dropdown-btn');
        const exportMenu = document.getElementById('export-menu');

        if (exportDropdownBtn && exportMenu) {
            exportDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exportMenu.classList.toggle('hidden');
            });
            document.addEventListener('click', () => {
                exportMenu.classList.add('hidden');
            });
        }

        if (exportMdBtn) {
            exportMdBtn.addEventListener('click', () => this.exportCurrentChat('markdown'));
        }
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => this.exportCurrentChat('json'));
        }
    }

    async loadConversations(query = '') {
        try {
            const url = query ? `/api/conversations?q=${encodeURIComponent(query)}` : '/api/conversations';
            const res = await fetch(url);
            const data = await res.json();
            this.conversations = data.conversations || [];
            this.renderHistoryList();
        } catch (err) {
            console.error('Failed to load history:', err);
            if (this.historyListEl) {
                this.historyListEl.innerHTML = `
                    <div class="history-empty-msg">Failed to load conversations.</div>
                `;
            }
        }
    }

    groupConversations(list) {
        const groups = {
            'Today': [],
            'Yesterday': [],
            'Previous 7 Days': [],
            'Older': []
        };

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

        list.forEach(item => {
            const itemDate = new Date(item.updated_at || item.created_at);
            if (itemDate >= startOfToday) {
                groups['Today'].push(item);
            } else if (itemDate >= startOfYesterday) {
                groups['Yesterday'].push(item);
            } else if (itemDate >= startOf7Days) {
                groups['Previous 7 Days'].push(item);
            } else {
                groups['Older'].push(item);
            }
        });

        return groups;
    }

    renderHistoryList() {
        if (!this.historyListEl) return;

        if (this.conversations.length === 0) {
            this.historyListEl.innerHTML = `
                <div class="history-empty-msg">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom:8px; opacity:0.6;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <div>No conversations yet</div>
                    <div style="font-size:0.75rem; margin-top:4px; opacity:0.7;">Start a new chat to begin!</div>
                </div>
            `;
            return;
        }

        const groups = this.groupConversations(this.conversations);
        let html = '';

        for (const [groupName, items] of Object.entries(groups)) {
            if (items.length === 0) continue;

            html += `<div class="history-group-title">${groupName}</div>`;
            items.forEach(c => {
                const isActive = c.id === this.activeConversationId;
                const safeTitle = escapeHtml(c.title || 'Untitled Chat');
                html += `
                    <div class="history-item ${isActive ? 'active' : ''}" data-id="${c.id}">
                        <div class="history-item-content">
                            <svg class="history-item-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            <span class="history-item-text" title="${safeTitle}">${safeTitle}</span>
                        </div>
                        <div class="history-item-actions">
                            <button class="history-item-action-btn rename-btn" data-id="${c.id}" title="Rename">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="history-item-action-btn delete-btn" data-id="${c.id}" title="Delete">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        this.historyListEl.innerHTML = html;

        // Attach click handlers
        this.historyListEl.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.history-item-actions')) return;
                const id = el.dataset.id;
                if (id && id !== this.activeConversationId) {
                    window.app.switchConversation(id);
                }
                // Close sidebar on mobile
                const sidebar = document.getElementById('sidebar');
                const backdrop = document.getElementById('sidebar-backdrop');
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    backdrop.classList.remove('active');
                }
            });
        });

        // Rename buttons
        this.historyListEl.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.promptRenameConversation(id);
            });
        });

        // Delete buttons
        this.historyListEl.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.confirmDeleteConversation(id);
            });
        });
    }

    setActiveConversation(id, title) {
        this.activeConversationId = id;
        if (this.currentChatTitleEl) {
            this.currentChatTitleEl.textContent = title || 'New Chat';
        }
        // Update active class in DOM
        if (this.historyListEl) {
            this.historyListEl.querySelectorAll('.history-item').forEach(el => {
                el.classList.toggle('active', el.dataset.id === id);
            });
        }
    }

    updateConversationTitleInList(id, newTitle) {
        const conv = this.conversations.find(c => c.id === id);
        if (conv) {
            conv.title = newTitle;
            this.renderHistoryList();
        }
        if (this.activeConversationId === id && this.currentChatTitleEl) {
            this.currentChatTitleEl.textContent = newTitle;
        }
    }

    async promptRenameConversation(id) {
        const conv = this.conversations.find(c => c.id === id);
        const currentTitle = conv ? conv.title : 'Chat';
        const newTitle = window.prompt('Rename conversation:', currentTitle);
        if (!newTitle || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;

        try {
            const res = await fetch(`/api/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() })
            });
            const data = await res.json();
            if (data.success) {
                this.updateConversationTitleInList(id, newTitle.trim());
                showToast('Conversation renamed.', 'success');
            } else {
                showToast(data.error || 'Failed to rename conversation.', 'error');
            }
        } catch (err) {
            console.error('Rename error:', err);
            showToast('Network error while renaming.', 'error');
        }
    }

    startRenameTitle() {
        if (!this.activeConversationId) return;
        this.promptRenameConversation(this.activeConversationId);
    }

    async confirmDeleteConversation(id) {
        if (!confirm('Are you sure you want to delete this conversation? This cannot be undone.')) {
            return;
        }

        try {
            const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                this.conversations = this.conversations.filter(c => c.id !== id);
                if (this.activeConversationId === id) {
                    window.app.startNewChat();
                } else {
                    this.renderHistoryList();
                }
                showToast('Conversation deleted.', 'info');
            } else {
                showToast(data.error || 'Failed to delete conversation.', 'error');
            }
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Network error while deleting.', 'error');
        }
    }

    deleteActiveConversation() {
        if (!this.activeConversationId) {
            showToast('No active conversation to delete.', 'info');
            return;
        }
        this.confirmDeleteConversation(this.activeConversationId);
    }

    async clearAllConversations() {
        if (this.conversations.length === 0) {
            showToast('No history to clear.', 'info');
            return;
        }

        if (!confirm('Are you sure you want to delete ALL conversation history? This cannot be undone.')) {
            return;
        }

        try {
            const res = await fetch('/api/conversations', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                this.conversations = [];
                window.app.startNewChat();
                showToast('All conversation history cleared.', 'info');
            } else {
                showToast(data.error || 'Failed to clear history.', 'error');
            }
        } catch (err) {
            console.error('Clear all error:', err);
            showToast('Network error while clearing history.', 'error');
        }
    }

    exportCurrentChat(format = 'markdown') {
        if (!this.activeConversationId) {
            showToast('No active conversation to export.', 'info');
            return;
        }
        window.location.href = `/api/conversations/${this.activeConversationId}/export?format=${format}`;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.historyController = new HistoryController();
