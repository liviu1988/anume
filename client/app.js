console.log('🚀 Admin Panel JavaScript v5.1 loaded successfully! Modern UI with tabs and user management!');
console.log('📋 Available functions: Tab navigation, user management, online tracking, admin accounts');
console.log('🔧 If buttons still don\'t work, try hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)');
console.log('⏰ Loaded at:', new Date().toLocaleTimeString());

// Global variables for user management
let currentUsers = [];
let filteredUsers = [];
let onlineUsers = [];
let adminUsers = [];
let currentTab = 'dashboard';
let currentPage = 1;
let totalPages = 1;
let usersPerPage = 20;
let sortField = 'username';
let sortDirection = 'asc';
let selectedUsers = new Set();

// Test function to verify JavaScript is working
window.testJS = function() {
    alert('✅ JavaScript v5.1 is working! Modern UI with tabs and user management.');
    console.log('✅ JavaScript test successful');
};

// Tab Management Functions
window.showTab = function(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.add('hidden'));

    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Show selected tab content
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.classList.remove('hidden');
    }

    // Add active class to selected tab
    const activeTab = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    currentTab = tabName;

    // Load data for specific tabs
    switch(tabName) {
        case 'users':
            refreshUserList();
            break;
        case 'vpnServers':
            refreshVpnServerList();
            break;
        case 'online':
            refreshOnlineUsers();
            break;
        case 'admins':
            refreshAdminList();
            break;
        case 'dashboard':
            updateDashboardStats();
            break;
        case 'backups':
            loadBackups();
            break;
        case 'content':
            loadContentManagement();
            break;
    }
};

// Modal Management Functions
window.showModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
};

// API Helper Functions
async function parseApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();

    if (!rawText) {
        return {};
    }

    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(rawText);
        } catch (error) {
            throw new Error(`Invalid JSON response from server (${response.status})`);
        }
    }

    try {
        return JSON.parse(rawText);
    } catch (error) {
        return {
            message: rawText
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 240) || `Unexpected server response (${response.status})`
        };
    }
}

function buildApiError(response, data) {
    const serverMessage = data?.message || data?.error;
    const fallback = response.statusText || 'API call failed';
    return new Error(`${serverMessage || fallback} (${response.status})`);
}

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken');
    const sessionToken = localStorage.getItem('sessionToken');
    const timeoutMs = options.timeoutMs || 20000;
    const controller = options.signal ? null : new AbortController();

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Session-Token': sessionToken
        }
    };

    const finalOptions = {
        ...defaultOptions,
        ...options,
        signal: options.signal || controller?.signal,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    delete finalOptions.timeoutMs;

    const timeoutId = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
        const response = await fetch(endpoint, finalOptions);
        const data = await parseApiResponse(response);

        if (!response.ok) {
            throw buildApiError(response, data);
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw error;
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

// User Management Functions
window.refreshUserList = async function(page = 1) {
    console.log('🔄 Refreshing user list...');
    const tbody = document.getElementById('userTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading users...
                </td>
            </tr>
        `;
    }

    try {
        // Get current filters
        const search = document.getElementById('userSearch')?.value || '';
        const status = document.getElementById('statusFilter')?.value || '';
        const subscription = document.getElementById('subscriptionFilter')?.value || '';

        const params = new URLSearchParams({
            page: page.toString(),
            limit: usersPerPage.toString()
        });

        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (subscription) params.append('subscriptionType', subscription);

        const response = await apiCall(`/api/users?${params.toString()}`);

        // Store data globally
        currentUsers = response.data.users;
        filteredUsers = [...currentUsers];
        currentPage = response.data.page;
        totalPages = response.data.totalPages;

        displayUsers(filteredUsers);
        updatePagination(response.data);
        updateUserCount(response.data.total, filteredUsers.length);

        // Update total users count in dashboard
        document.getElementById('totalUsers').textContent = response.data.total;

        // Clear selections
        selectedUsers.clear();
        updateBulkActions();

    } catch (error) {
        console.error('Error loading users:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                        Error loading users: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
};

window.refreshOnlineUsers = async function() {
    console.log('🔄 Refreshing online users...');
    const container = document.getElementById('onlineUsersList');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 16px;"></i>
                <p>Loading online users...</p>
            </div>
        `;
    }

    try {
        // Try WebSocket first for real-time data
        if (window.adminPanel && window.adminPanel.socket && window.adminPanel.socket.connected) {
            console.log('📡 Using WebSocket to get online users...');
            window.adminPanel.socket.emit('get-online-users', (response) => {
                console.log('📡 WebSocket response:', response);
                if (response && response.success) {
                    displayOnlineUsers(response.users);
                    updateOnlineCount(response.users.length);
                } else {
                    console.error('WebSocket error:', response?.message || 'Unknown error');
                    throw new Error(response?.message || 'Failed to get online users via WebSocket');
                }
            });
        } else {
            // Fallback to REST API with proper authentication
            console.log('📡 Using REST API to get online users...');
            const response = await apiCall('/api/users/online');
            displayOnlineUsers(response.data);
            updateOnlineCount(response.count);
        }
    } catch (error) {
        console.error('❌ Error loading online users:', error);
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--error-color);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 16px;"></i>
                    <p>Error loading online users: ${error.message}</p>
                    <button class="btn btn-primary btn-sm" onclick="refreshOnlineUsers()" style="margin-top: 16px;">
                        <i class="fas fa-retry"></i>
                        Try Again
                    </button>
                </div>
            `;
        }

        // Also update the count to 0 on error
        updateOnlineCount(0);
    }
};

window.refreshAdminList = async function() {
    console.log('🔄 Refreshing admin list...');
    const tbody = document.getElementById('adminTableBody');

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading admins...
                </td>
            </tr>
        `;
    }

    try {
        const response = await apiCall('/api/admins');
        displayAdmins(response.data);
    } catch (error) {
        console.error('Error loading admins:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                        Error loading admins: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
};

window.updateDashboardStats = async function() {
    console.log('📊 Updating dashboard stats...');

    try {
        // Load user stats
        const userStatsResponse = await apiCall('/api/users/stats');
        const userStats = userStatsResponse.data;

        // Load admin stats
        const adminStatsResponse = await apiCall('/api/admins/stats');
        const adminStats = adminStatsResponse.data;

        // Load chat stats for unreplied messages
        const chatStatsResponse = await apiCall('/api/chat/admin/stats');
        const chatStats = chatStatsResponse.stats;

        // Update dashboard
        document.getElementById('totalUsers').textContent = userStats.total || '0';
        document.getElementById('unrepliedMessages').textContent = chatStats.unreadMessages || '0';
        document.getElementById('adminCount').textContent = adminStats.active || '0';
        document.getElementById('serverStatus').textContent = 'Online';
    } catch (error) {
        console.error('Error updating dashboard stats:', error);
        // Set default values on error
        document.getElementById('totalUsers').textContent = '0';
        document.getElementById('unrepliedMessages').textContent = '0';
        document.getElementById('adminCount').textContent = '1';
        document.getElementById('serverStatus').textContent = 'Error';
    }
};

// Enhanced Notification System
window.showAlert = function(message, type = 'info', duration = 5000) {
    // Create notification container if it doesn't exist
    let notificationContainer = document.getElementById('notificationContainer');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notificationContainer';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(notificationContainer);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.style.cssText = `
        margin-bottom: 12px;
        pointer-events: auto;
        transform: translateX(100%);
        transition: all 0.3s ease;
        cursor: pointer;
        position: relative;
        padding-right: 40px;
    `;

    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
        <button style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: inherit; cursor: pointer; font-size: 16px;" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Add to container
    notificationContainer.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto remove
    const removeNotification = () => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };

    // Click to dismiss
    notification.addEventListener('click', removeNotification);

    // Auto remove after duration
    if (duration > 0) {
        setTimeout(removeNotification, duration);
    }

    return notification;
};

// Update version indicator when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const versionEl = document.getElementById('jsVersion');
    if (versionEl) {
        versionEl.textContent = 'JS: v5.1 ✅';
        versionEl.style.color = '#10b981';
    }

    // Initialize default tab
    showTab('dashboard');

    // Initialize chat after a delay to ensure it's ready
    setTimeout(() => {
        if (typeof initializeChat === 'function') {
            console.log('🔄 Auto-initializing chat...');

            // Check if admin token is available
            const token = localStorage.getItem('adminToken');
            if (token) {
                console.log('✅ Admin token available, initializing chat');
                initializeChat();
            } else {
                console.log('⏳ Admin token not yet available, will retry...');
                // Retry every 2 seconds until token is available
                const tokenCheckInterval = setInterval(() => {
                    const token = localStorage.getItem('adminToken');
                    if (token) {
                        console.log('✅ Admin token now available, initializing chat');
                        initializeChat();
                        clearInterval(tokenCheckInterval);
                    }
                }, 2000);

                // Stop trying after 30 seconds
                setTimeout(() => {
                    clearInterval(tokenCheckInterval);
                    console.log('⏰ Stopped waiting for admin token');
                }, 30000);
            }
        }

        // Add a manual test function to debug API calls
        window.testConversationsAPI = async function() {
            try {
                const token = localStorage.getItem('adminToken');
                console.log('🧪 Testing conversations API...');
                console.log('🧪 Token:', token ? 'Present' : 'Missing');

                const response = await fetch('/api/chat/admin/conversations?status=&_t=' + Date.now(), {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    }
                });

                console.log('🧪 Response status:', response.status);
                console.log('🧪 Response headers:', response.headers);

                const data = await parseApiResponse(response);
                console.log('🧪 Response data:', data);

                if (data.conversations) {
                    console.log('🧪 Number of conversations:', data.conversations.length);
                    data.conversations.forEach((conv, i) => {
                        console.log(`🧪 Conversation ${i + 1}:`, conv);
                    });
                }

                return data;
            } catch (error) {
                console.error('🧪 API test error:', error);
                return error;
            }
        };

        console.log('🧪 Test function added. Call window.testConversationsAPI() in console to test.');

        // Force load conversations on page load (aggressive approach)
        window.forceLoadConversations = function() {
            const token = localStorage.getItem('adminToken');
            if (token) {
                console.log('🚀 Force loading conversations on page load...');
                loadConversations('');
            }
        };

        // Try to load conversations every 5 seconds until successful
        const pageLoadInterval = setInterval(() => {
            const token = localStorage.getItem('adminToken');
            if (token) {
                console.log('🔄 Attempting to load conversations...');
                loadConversations('');

                // Check if loaded successfully after 2 seconds
                setTimeout(() => {
                    const conversationsList = document.getElementById('conversationsList');
                    if (conversationsList && !conversationsList.innerHTML.includes('Loading conversations')) {
                        console.log('✅ Conversations loaded successfully, stopping interval');
                        clearInterval(pageLoadInterval);
                    }
                }, 2000);
            }
        }, 5000);

        // Stop trying after 60 seconds
        setTimeout(() => {
            clearInterval(pageLoadInterval);
            console.log('⏰ Stopped page load conversation attempts');
        }, 60000);
    }, 2000);

    // Add smooth scrolling to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Add loading states to buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn') && !e.target.disabled) {
            const originalText = e.target.innerHTML;
            const hasIcon = originalText.includes('<i class="fas');

            // Add loading state for async operations
            if (e.target.onclick && e.target.onclick.toString().includes('async')) {
                e.target.innerHTML = hasIcon ?
                    '<i class="fas fa-spinner fa-spin"></i> Loading...' :
                    'Loading...';
                e.target.disabled = true;

                // Reset after 3 seconds (fallback)
                setTimeout(() => {
                    e.target.innerHTML = originalText;
                    e.target.disabled = false;
                }, 3000);
            }
        }
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('userSearch');
            if (searchInput && !searchInput.classList.contains('hidden')) {
                searchInput.focus();
            }
        }

        // Ctrl/Cmd + R to refresh current tab
        if ((e.ctrlKey || e.metaKey) && e.key === 'r' && currentTab !== 'dashboard') {
            e.preventDefault();
            switch(currentTab) {
                case 'users':
                    refreshUserList();
                    break;
                case 'online':
                    refreshOnlineUsers();
                    break;
                case 'admins':
                    refreshAdminList();
                    break;
            }
        }
    });

    // Add tooltips to buttons
    document.querySelectorAll('[title]').forEach(element => {
        element.addEventListener('mouseenter', function() {
            this.style.position = 'relative';
        });
    });
});

// Helper Functions
function displayUsers(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-users" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    No users found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
        const serverUrl = user.server_url || user.server || 'Unknown';
        const subscriptionType = user.subscription_type || user.subscription || 'Basic';
        const subscriptionStatus = user.subscription_status || user.status || 'active';
        const isOnline = user.is_online || false;

        return `
            <tr>
                <td>
                    <input type="checkbox" class="user-checkbox" value="${user.id}" onchange="toggleUserSelection(${user.id})">
                </td>
                <td>
                    <div class="user-info">
                        <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <h4>${user.username}</h4>
                            <p>ID: ${user.id}</p>
                            ${isOnline ? '<p style="color: var(--success-color);"><i class="fas fa-circle" style="font-size: 8px; margin-right: 4px;"></i>Online</p>' : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <span style="font-size: 14px;">${serverUrl}</span>
                </td>
                <td>
                    <span class="user-status ${subscriptionStatus === 'active' ? 'online' : 'offline'}">
                        ${subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1)}
                    </span>
                </td>
                <td>${lastLogin}</td>
                <td>
                    <span class="user-status ${subscriptionType === 'premium' ? 'online' : subscriptionType === 'trial' ? 'offline' : 'online'}" style="background: ${subscriptionType === 'premium' ? 'rgba(16, 185, 129, 0.1)' : subscriptionType === 'trial' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(148, 163, 184, 0.1)'};">
                        ${subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1)}
                    </span>
                </td>
                <td class="table-actions-cell">
                    <div class="table-actions">
                        <button class="btn btn-primary btn-sm" onclick="viewUserDetails('${user.id}')" title="View Details">
                            <i class="fas fa-eye"></i>
                            <span class="action-label">View</span>
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="toggleUserStatus(${user.id}, ${!user.is_active})" title="${user.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fas fa-${user.is_active ? 'ban' : 'check'}"></i>
                            <span class="action-label">${user.is_active ? 'Off' : 'On'}</span>
                        </button>
                        ${isOnline ? `
                            <button class="btn btn-danger btn-sm" onclick="disconnectUser('${user.id}')" title="Disconnect">
                                <i class="fas fa-sign-out-alt"></i>
                                <span class="action-label">Out</span>
                            </button>
                        ` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id}, '${user.username}')" title="Delete User" style="background-color: #dc2626;">
                            <i class="fas fa-trash"></i>
                            <span class="action-label">Del</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function displayOnlineUsers(users) {
    const container = document.getElementById('onlineUsersList');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-user-slash" style="font-size: 24px; margin-bottom: 16px;"></i>
                <p>No users currently online</p>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map(user => {
        const connectedTime = user.connectedAt ? new Date(user.connectedAt).toLocaleString() : 'Unknown';
        const serverUrl = user.serverUrl || user.server_url || 'Unknown';
        const ipAddress = user.ipAddress || user.last_ip || 'Unknown';
        const appVersion = user.appVersion || user.app_version || 'Unknown';

        return `
            <div class="user-card">
                <div class="user-header">
                    <div class="user-info">
                        <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <h4>${user.username}</h4>
                            <p><i class="fas fa-server" style="margin-right: 4px;"></i> ${serverUrl}</p>
                            <p><i class="fas fa-clock" style="margin-right: 4px;"></i> Connected: ${connectedTime}</p>
                            <p><i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i> IP: ${ipAddress}</p>
                            ${appVersion !== 'Unknown' ? `<p><i class="fas fa-mobile-alt" style="margin-right: 4px;"></i> App: ${appVersion}</p>` : ''}
                        </div>
                    </div>
                    <span class="user-status online">
                        <div class="status-dot"></div>
                        Online
                    </span>
                </div>
                <div class="user-actions">
                    <button class="btn btn-primary btn-sm" onclick="viewUserDetails('${user.userId || user.id}')">
                        <i class="fas fa-eye"></i>
                        View Details
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="disconnectUser('${user.userId || user.id}')">
                        <i class="fas fa-sign-out-alt"></i>
                        Disconnect
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateOnlineCount(count) {
    const onlineCountEl = document.getElementById('onlineCount');
    if (onlineCountEl) {
        onlineCountEl.textContent = count;
    }

    // Note: No longer updating dashboard onlineUsers stat since it's been replaced with unrepliedMessages
}

// Update unreplied messages count in dashboard
async function updateUnrepliedMessagesCount() {
    try {
        const chatStatsResponse = await apiCall('/api/chat/admin/stats');
        const chatStats = chatStatsResponse.stats;

        const unrepliedElement = document.getElementById('unrepliedMessages');
        if (unrepliedElement) {
            unrepliedElement.textContent = chatStats.unreadMessages || '0';
        }
    } catch (error) {
        console.error('Error updating unreplied messages count:', error);
    }
}

// Navigate to different sections from dashboard stat cards
window.navigateToSection = function(section) {
    console.log('🔄 Navigating to section:', section);

    switch(section) {
        case 'users':
            showTab('users');
            break;
        case 'chat':
            showTab('chat');
            break;
        case 'admins':
            showTab('admins');
            break;
        case 'config':
            showTab('config');
            break;
        default:
            console.warn('Unknown section:', section);
            break;
    }
}

function displayAdmins(admins) {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    if (admins.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-user-shield" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    No admins found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = admins.map(admin => `
        <tr>
            <td>${admin.username}</td>
            <td>
                <span class="user-status ${admin.role === 'super_admin' ? 'online' : 'offline'}">
                    ${admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </span>
            </td>
            <td>${admin.created_at ? new Date(admin.created_at).toLocaleDateString() : 'Unknown'}</td>
            <td>${admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Never'}</td>
            <td class="table-actions-cell">
                <div class="table-actions">
                    <button class="btn btn-warning btn-sm" onclick="window.changeAdminPassword('${admin.username}')" title="Change Password">
                        <i class="fas fa-key"></i>
                        <span class="action-label">Key</span>
                    </button>
                    ${admin.role !== 'super_admin' ? `
                        <button class="btn btn-danger btn-sm" onclick="window.deactivateAdmin(${admin.id})" title="Deactivate">
                            <i class="fas fa-ban"></i>
                            <span class="action-label">Off</span>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="window.deleteAdmin(${admin.id}, '${admin.username}')" title="Delete Admin" style="background: #dc2626;">
                            <i class="fas fa-trash"></i>
                            <span class="action-label">Del</span>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Admin Management Functions
window.showAddAdminModal = function() {
    showModal('addAdminModal');
};

window.createAdmin = async function() {
    const form = document.getElementById('addAdminForm');
    const formData = new FormData(form);

    const adminData = {
        username: formData.get('username'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    // Basic validation
    if (!adminData.username || adminData.username.length < 3) {
        alert('Username must be at least 3 characters long');
        return;
    }

    if (!adminData.password || adminData.password.length < 8) {
        alert('Password must be at least 8 characters long');
        return;
    }

    // Password strength validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
    if (!passwordRegex.test(adminData.password)) {
        alert('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        return;
    }

    console.log('Creating admin:', adminData);

    try {
        const response = await apiCall('/api/admins', {
            method: 'POST',
            body: JSON.stringify(adminData)
        });

        showAlert('Admin created successfully!', 'success');
        closeModal('addAdminModal');
        form.reset();

        // Refresh admin list if we're on the admins tab
        if (currentTab === 'admins') {
            refreshAdminList();
        }

        // Update dashboard stats
        updateDashboardStats();
    } catch (error) {
        console.error('Error creating admin:', error);
        showAlert(`Failed to create admin: ${error.message}`, 'error');
    }
};

window.changeAdminPassword = function(username) {
    showModal('changePasswordModal');
    // Store the username for the password change
    document.getElementById('changePasswordModal').dataset.username = username;
};

window.updatePassword = async function() {
    const modal = document.getElementById('changePasswordModal');
    const username = modal.dataset.username;

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        alert('New passwords do not match!');
        return;
    }

    console.log('Updating password for:', username);

    try {
        const response = await apiCall('/api/admins/password', {
            method: 'PATCH',
            body: JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword
            })
        });

        alert('Password updated successfully!');
        closeModal('changePasswordModal');

        // Clear form
        document.getElementById('changePasswordForm').reset();
    } catch (error) {
        console.error('Error updating password:', error);
        alert(`Failed to update password: ${error.message}`);
    }
};

// User Action Functions
window.viewUserDetails = async function(userId) {
    console.log('Viewing details for user:', userId);

    try {
        const response = await apiCall(`/api/users/${userId}`);
        const user = response.data;

        const userDetailsContent = document.getElementById('userDetailsContent');
        if (userDetailsContent) {
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';
            const createdAt = user.created_at ? new Date(user.created_at).toLocaleString() : 'Unknown';
            const activeSessions = user.sessions ? user.sessions.filter(s => s.status === 'active').length : 0;
            const totalSessions = user.sessions ? user.sessions.length : 0;

            userDetailsContent.innerHTML = `
                <div class="user-info" style="margin-bottom: 20px; display: flex; align-items: center; gap: 16px;">
                    <div class="user-avatar" style="width: 60px; height: 60px; font-size: 24px;">${user.username.charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <h3 style="margin: 0; color: var(--text-primary);">${user.username}</h3>
                        <p style="margin: 4px 0; color: var(--text-secondary);">User ID: ${user.id}</p>
                        <p style="margin: 4px 0; color: var(--text-secondary);">Server: ${user.server_url}</p>
                        <span class="user-status ${user.is_online ? 'online' : 'offline'}" style="margin-top: 8px;">
                            ${user.is_online ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>

                <div class="stats-grid" style="margin-bottom: 24px;">
                    <div class="stat-card">
                        <div class="stat-value" style="color: ${user.subscription_status === 'active' ? 'var(--success-color)' : 'var(--error-color)'};">
                            ${user.subscription_status ? user.subscription_status.charAt(0).toUpperCase() + user.subscription_status.slice(1) : 'Unknown'}
                        </div>
                        <div class="stat-label">Account Status</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: var(--primary-color);">
                            ${user.subscription_type ? user.subscription_type.charAt(0).toUpperCase() + user.subscription_type.slice(1) : 'Basic'}
                        </div>
                        <div class="stat-label">Subscription</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${activeSessions}</div>
                        <div class="stat-label">Active Sessions</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${user.total_connections || 0}</div>
                        <div class="stat-label">Total Connections</div>
                    </div>
                </div>

                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--text-primary); margin-bottom: 12px;">Account Information</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                        <div>
                            <strong>Last Login:</strong><br>
                            <span style="color: var(--text-secondary);">${lastLogin}</span>
                        </div>
                        <div>
                            <strong>Created:</strong><br>
                            <span style="color: var(--text-secondary);">${createdAt}</span>
                        </div>
                        <div>
                            <strong>Last IP:</strong><br>
                            <span style="color: var(--text-secondary);">${user.last_ip || 'Unknown'}</span>
                        </div>
                        <div>
                            <strong>App Version:</strong><br>
                            <span style="color: var(--text-secondary);">${user.app_version || 'Unknown'}</span>
                        </div>
                        ${user.expiry_date ? `
                        <div>
                            <strong>Subscription Expires:</strong><br>
                            <span style="color: var(--text-secondary);">${new Date(user.expiry_date).toLocaleDateString()}</span>
                        </div>
                        ` : ''}
                        <div>
                            <strong>Max Connections:</strong><br>
                            <span style="color: var(--text-secondary);">${user.max_connections || 1}</span>
                        </div>
                    </div>
                </div>

                ${user.sessions && user.sessions.length > 0 ? `
                <div>
                    <h4 style="color: var(--text-primary); margin-bottom: 12px;">Recent Sessions</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${user.sessions.map(session => `
                            <div class="user-card" style="margin-bottom: 12px; padding: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong>${session.connection_type || 'Unknown'}</strong>
                                        <span class="user-status ${session.status === 'active' ? 'online' : 'offline'}" style="margin-left: 8px;">
                                            ${session.status}
                                        </span>
                                    </div>
                                    <div style="text-align: right; font-size: 12px; color: var(--text-secondary);">
                                        <div>Started: ${new Date(session.started_at).toLocaleString()}</div>
                                        ${session.ended_at ? `<div>Ended: ${new Date(session.ended_at).toLocaleString()}</div>` : ''}
                                        <div>Duration: ${Math.floor(session.duration_seconds / 60)} minutes</div>
                                    </div>
                                </div>
                                ${session.ip_address ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">IP: ${session.ip_address}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            `;
        }

        showModal('userDetailsModal');
    } catch (error) {
        console.error('Error loading user details:', error);
        showAlert(`Failed to load user details: ${error.message}`, 'error');
    }
};

window.editUser = function(username) {
    console.log('Editing user:', username);
    alert('User editing functionality will be implemented with backend API');
};

// Pagination Functions
window.changePage = function(direction) {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        refreshUserList(newPage);
    }
};

function updatePagination(data) {
    const paginationInfo = document.getElementById('userPaginationInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (paginationInfo) {
        const start = (data.page - 1) * usersPerPage + 1;
        const end = Math.min(data.page * usersPerPage, data.total);
        paginationInfo.textContent = `Showing ${start}-${end} of ${data.total} users`;
    }

    if (prevBtn) {
        prevBtn.disabled = !data.hasPrev;
    }

    if (nextBtn) {
        nextBtn.disabled = !data.hasNext;
    }
}

function updateUserCount(total, filtered) {
    const userCount = document.getElementById('userCount');
    if (userCount) {
        if (filtered < total) {
            userCount.textContent = `Showing ${filtered} of ${total} users`;
        } else {
            userCount.textContent = `${total} users total`;
        }
    }
}

// Filtering Functions
window.filterUsers = function() {
    const search = document.getElementById('userSearch').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const subscription = document.getElementById('subscriptionFilter').value;

    // If filters changed, refresh from server
    refreshUserList(1);
};

window.clearFilters = function() {
    document.getElementById('userSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('subscriptionFilter').value = '';
    refreshUserList(1);
};

// Sorting Functions
window.sortUsers = function(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }

    // Sort current users array
    filteredUsers.sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';

        // Handle dates
        if (field === 'last_login') {
            aVal = new Date(aVal || 0);
            bVal = new Date(bVal || 0);
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    displayUsers(filteredUsers);
    updateSortIcons();
};

function updateSortIcons() {
    // Reset all sort icons
    document.querySelectorAll('th i.fas').forEach(icon => {
        if (icon.classList.contains('fa-sort') || icon.classList.contains('fa-sort-up') || icon.classList.contains('fa-sort-down')) {
            icon.className = 'fas fa-sort';
        }
    });

    // Update current sort field icon
    const currentHeader = document.querySelector(`th[onclick="sortUsers('${sortField}')"] i`);
    if (currentHeader) {
        currentHeader.className = `fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`;
    }
}

// Selection Functions
window.toggleSelectAll = function() {
    const selectAll = document.getElementById('selectAllUsers');
    const checkboxes = document.querySelectorAll('.user-checkbox');

    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
        const userId = parseInt(checkbox.value);
        if (selectAll.checked) {
            selectedUsers.add(userId);
        } else {
            selectedUsers.delete(userId);
        }
    });

    updateBulkActions();
};

window.toggleUserSelection = function(userId) {
    if (selectedUsers.has(userId)) {
        selectedUsers.delete(userId);
    } else {
        selectedUsers.add(userId);
    }

    updateBulkActions();
    updateSelectAllState();
};

function updateSelectAllState() {
    const selectAll = document.getElementById('selectAllUsers');
    const checkboxes = document.querySelectorAll('.user-checkbox');
    const checkedBoxes = document.querySelectorAll('.user-checkbox:checked');

    if (checkedBoxes.length === 0) {
        selectAll.indeterminate = false;
        selectAll.checked = false;
    } else if (checkedBoxes.length === checkboxes.length) {
        selectAll.indeterminate = false;
        selectAll.checked = true;
    } else {
        selectAll.indeterminate = true;
        selectAll.checked = false;
    }
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');

    if (selectedUsers.size > 0) {
        bulkActions.style.display = 'block';
        selectedCount.textContent = `${selectedUsers.size} user${selectedUsers.size > 1 ? 's' : ''} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

// Bulk Operations
window.bulkActivateUsers = async function() {
    if (selectedUsers.size === 0) return;

    if (!confirm(`Are you sure you want to activate ${selectedUsers.size} selected user${selectedUsers.size > 1 ? 's' : ''}?`)) {
        return;
    }

    try {
        const promises = Array.from(selectedUsers).map(userId =>
            apiCall(`/api/users/${userId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({
                    isActive: true,
                    reason: 'bulk_activation'
                })
            })
        );

        await Promise.all(promises);
        showAlert(`Successfully activated ${selectedUsers.size} users`, 'success');

        selectedUsers.clear();
        refreshUserList(currentPage);
    } catch (error) {
        console.error('Error activating users:', error);
        showAlert(`Failed to activate users: ${error.message}`, 'error');
    }
};

window.bulkDeactivateUsers = async function() {
    if (selectedUsers.size === 0) return;

    if (!confirm(`Are you sure you want to deactivate ${selectedUsers.size} selected user${selectedUsers.size > 1 ? 's' : ''}?`)) {
        return;
    }

    try {
        const promises = Array.from(selectedUsers).map(userId =>
            apiCall(`/api/users/${userId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({
                    isActive: false,
                    reason: 'bulk_deactivation'
                })
            })
        );

        await Promise.all(promises);
        showAlert(`Successfully deactivated ${selectedUsers.size} users`, 'success');

        selectedUsers.clear();
        refreshUserList(currentPage);
    } catch (error) {
        console.error('Error deactivating users:', error);
        showAlert(`Failed to deactivate users: ${error.message}`, 'error');
    }
};

window.bulkDisconnectUsers = async function() {
    if (selectedUsers.size === 0) return;

    if (!confirm(`Are you sure you want to disconnect ${selectedUsers.size} selected user${selectedUsers.size > 1 ? 's' : ''}?`)) {
        return;
    }

    try {
        const promises = Array.from(selectedUsers).map(userId =>
            apiCall(`/api/users/${userId}/disconnect`, {
                method: 'POST',
                body: JSON.stringify({
                    reason: 'bulk_disconnect'
                })
            })
        );

        await Promise.all(promises);
        showAlert(`Successfully disconnected ${selectedUsers.size} users`, 'success');

        selectedUsers.clear();
        refreshUserList(currentPage);
    } catch (error) {
        console.error('Error disconnecting users:', error);
        showAlert(`Failed to disconnect users: ${error.message}`, 'error');
    }
};

window.bulkDeleteUsers = async function() {
    if (selectedUsers.size === 0) return;

    // Get usernames for confirmation
    const usernames = Array.from(selectedUsers).map(userId => {
        const user = currentUsers.find(u => u.id === userId);
        return user ? user.username : `ID:${userId}`;
    });

    // Double confirmation for destructive action
    const firstConfirm = confirm(`⚠️ WARNING: This will permanently delete ${selectedUsers.size} selected user${selectedUsers.size > 1 ? 's' : ''} and all their data.\n\nUsers to delete:\n${usernames.join(', ')}\n\nThis action cannot be undone. Are you sure?`);
    if (!firstConfirm) return;

    const secondConfirm = confirm(`Please confirm again: Delete ${selectedUsers.size} user${selectedUsers.size > 1 ? 's' : ''} permanently?\n\nThis will remove for each user:\n• User account\n• All user sessions\n• All chat conversations and messages\n• All related data`);
    if (!secondConfirm) return;

    try {
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const userId of selectedUsers) {
            try {
                await apiCall(`/api/users/${userId}`, {
                    method: 'DELETE'
                });
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push(`User ID ${userId}: ${error.message}`);
            }
        }

        if (successCount > 0) {
            showAlert(`Successfully deleted ${successCount} user${successCount > 1 ? 's' : ''}`, 'success');
        }

        if (errorCount > 0) {
            showAlert(`Failed to delete ${errorCount} user${errorCount > 1 ? 's' : ''}:\n${errors.join('\n')}`, 'error');
        }

        // Refresh the user list and clear selections
        refreshUserList();
        selectedUsers.clear();
        updateBulkActions();

    } catch (error) {
        console.error('Error deleting users:', error);
        showAlert(`Failed to delete users: ${error.message}`, 'error');
    }
};

// Toggle user status function
window.toggleUserStatus = async function(userId, activate) {
    try {
        const response = await apiCall(`/api/users/${userId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                isActive: activate,
                reason: activate ? 'admin_activation' : 'admin_deactivation'
            })
        });

        showAlert(`User ${activate ? 'activated' : 'deactivated'} successfully`, 'success');
        refreshUserList(currentPage);
    } catch (error) {
        console.error('Error toggling user status:', error);
        showAlert(`Failed to ${activate ? 'activate' : 'deactivate'} user: ${error.message}`, 'error');
    }
};

// Export functionality
window.exportUserList = async function() {
    try {
        const response = await apiCall('/api/users?limit=1000'); // Get all users for export
        const users = response.data.users;

        // Create CSV content
        const headers = ['ID', 'Username', 'Server URL', 'Status', 'Subscription Type', 'Last Login', 'Created At', 'Is Online'];
        const csvContent = [
            headers.join(','),
            ...users.map(user => [
                user.id,
                user.username,
                user.server_url || '',
                user.subscription_status || '',
                user.subscription_type || '',
                user.last_login || '',
                user.created_at || '',
                user.is_online ? 'Yes' : 'No'
            ].map(field => `"${field}"`).join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showAlert('User list exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting users:', error);
        showAlert(`Failed to export users: ${error.message}`, 'error');
    }
};

// Admin Management Functions
window.deactivateAdmin = async function(adminId) {
    if (confirm('Are you sure you want to deactivate this admin account?')) {
        try {
            const response = await apiCall(`/api/admins/${adminId}/deactivate`, {
                method: 'PATCH'
            });

            showAlert('Admin account deactivated successfully!', 'success');
            refreshAdminList();
        } catch (error) {
            console.error('Error deactivating admin:', error);
            showAlert(`Failed to deactivate admin: ${error.message}`, 'error');
        }
    }
};

window.deleteAdmin = async function(adminId, username) {
    console.log('deleteAdmin called with:', adminId, username);

    // Double confirmation for delete action
    if (confirm(`Are you sure you want to DELETE admin account "${username}"?\n\nThis action cannot be undone!`)) {
        const confirmText = prompt(`This will permanently delete the admin account "${username}" and all associated data.\n\nType "DELETE" to confirm:`);
        if (confirmText === 'DELETE') {
            try {
                console.log('Attempting to delete admin:', adminId);
                const response = await apiCall(`/api/admins/${adminId}`, {
                    method: 'DELETE'
                });

                console.log('Delete response:', response);
                showAlert(`Admin account "${username}" deleted successfully!`, 'success');
                refreshAdminList();

                // Update dashboard stats
                if (typeof updateDashboardStats === 'function') {
                    updateDashboardStats();
                }
            } catch (error) {
                console.error('Error deleting admin:', error);
                showAlert(`Failed to delete admin: ${error.message}`, 'error');
            }
        } else if (confirmText !== null) {
            showAlert('Deletion cancelled - you must type "DELETE" exactly to confirm', 'warning');
        }
    }
};

// View admin profile
window.viewAdminProfile = async function() {
    try {
        const response = await apiCall('/api/admins/profile');
        const profile = response.data;

        const profileModal = document.createElement('div');
        profileModal.className = 'modal show';
        profileModal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-user-circle"></i>
                        Admin Profile
                    </h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${profile.username}</div>
                            <div class="stat-label">Username</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${profile.role === 'super_admin' ? 'Super Admin' : 'Admin'}</div>
                            <div class="stat-label">Role</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${profile.activeSessions || 0}</div>
                            <div class="stat-label">Active Sessions</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${profile.last_login ? new Date(profile.last_login).toLocaleDateString() : 'Never'}</div>
                            <div class="stat-label">Last Login</div>
                        </div>
                    </div>
                    <div style="margin-top: 20px;">
                        <h4 style="color: var(--text-primary); margin-bottom: 12px;">Account Information</h4>
                        <p><strong>Created:</strong> ${new Date(profile.created_at).toLocaleString()}</p>
                        <p><strong>Status:</strong> ${profile.is_active ? 'Active' : 'Inactive'}</p>
                        ${profile.email ? `<p><strong>Email:</strong> ${profile.email}</p>` : ''}
                        ${profile.full_name ? `<p><strong>Full Name:</strong> ${profile.full_name}</p>` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    <button class="btn btn-primary" onclick="changeAdminPassword('${profile.username}'); this.closest('.modal').remove();">
                        <i class="fas fa-key"></i>
                        Change Password
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(profileModal);
        document.body.style.overflow = 'hidden';
    } catch (error) {
        console.error('Error loading admin profile:', error);
        showAlert(`Failed to load profile: ${error.message}`, 'error');
    }
};

window.disconnectUser = async function(userId) {
    if (confirm(`Are you sure you want to disconnect this user?`)) {
        try {
            // Try WebSocket first for real-time disconnection
            if (window.adminPanel && window.adminPanel.socket && window.adminPanel.socket.connected) {
                window.adminPanel.socket.emit('admin-disconnect-user', {
                    userId: parseInt(userId),
                    reason: 'admin_disconnect'
                });
            } else {
                // Fallback to REST API
                const response = await apiCall(`/api/users/${userId}/disconnect`, {
                    method: 'POST',
                    body: JSON.stringify({
                        reason: 'admin_disconnect'
                    })
                });

                showAlert(`User disconnected successfully. ${response.data.disconnectedSessions} sessions ended.`, 'success');

                // Refresh the current view
                if (currentTab === 'users') {
                    refreshUserList();
                } else if (currentTab === 'online') {
                    refreshOnlineUsers();
                }
            }
        } catch (error) {
            console.error('Error disconnecting user:', error);
            showAlert(`Failed to disconnect user: ${error.message}`, 'error');
        }
    }
};

// Delete user function
window.deleteUser = async function(userId, username) {
    // Double confirmation for destructive action
    const firstConfirm = confirm(`⚠️ WARNING: This will permanently delete user "${username}" and all their data.\n\nThis action cannot be undone. Are you sure?`);
    if (!firstConfirm) return;

    const secondConfirm = confirm(`Please confirm again: Delete user "${username}" permanently?\n\nThis will remove:\n• User account\n• All user sessions\n• All chat conversations and messages\n• All related data`);
    if (!secondConfirm) return;

    try {
        const response = await apiCall(`/api/users/${userId}`, {
            method: 'DELETE'
        });

        showAlert(`User "${username}" deleted successfully`, 'success');

        // Refresh the user list
        refreshUserList();

        // Clear any selections
        selectedUsers.clear();
        updateBulkActions();

    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert(`Failed to delete user: ${error.message}`, 'error');
    }
};

class AdminPanel {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.socket = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSocket();
        
        if (this.token) {
            this.verifyToken();
        } else {
            this.showLogin();
        }
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Config form
        document.getElementById('configForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateConfig();
        });

        // Modal close on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
                document.body.style.overflow = 'auto';
            }
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.modal.show');
                if (openModal) {
                    openModal.classList.remove('show');
                    document.body.style.overflow = 'auto';
                }
            }
        });
    }

    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);

            // Authenticate admin socket if logged in
            if (this.token) {
                this.socket.emit('authenticate', {
                    token: this.token,
                    userType: 'admin'
                });
                this.socket.emit('subscribe-config-updates');

                // Start periodic activity updates to keep admin session alive
                this.startAdminActivityUpdates();
            }
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
            // Stop activity updates when disconnected
            this.stopAdminActivityUpdates();
        });

        this.socket.on('authenticated', (data) => {
            if (data.success) {
                console.log('Socket authenticated successfully');
            } else {
                console.warn('Socket authentication failed:', data.message);
            }
        });

        this.socket.on('config-updated', (config) => {
            this.showAlert('configAlert', 'Configuration updated remotely!', 'success');
            this.populateConfigForm(config);
            this.loadStatus();
        });

        // Handle admin activity acknowledgments
        this.socket.on('admin-activity-acknowledged', (data) => {
            console.log('✅ Admin activity acknowledged by server:', data);
        });

        this.socket.on('app-status-update', (status) => {
            this.updateAppStatus(status);
        });

        // Real-time user connection events
        this.socket.on('user-connected', (data) => {
            console.log('👤 User connected:', data);
            // showAlert(`User ${data.username} connected from ${data.serverUrl}`, 'info'); // Disabled notification

            // Always refresh online users when someone connects
            refreshOnlineUsers();

            // Update dashboard stats
            updateDashboardStats();
        });

        this.socket.on('user-disconnected', (data) => {
            console.log('👤 User disconnected:', data);
            // showAlert(`User ${data.username} disconnected`, 'info'); // Disabled notification

            // Always refresh online users when someone disconnects
            refreshOnlineUsers();

            // Update dashboard stats
            updateDashboardStats();
        });

        this.socket.on('user-disconnect-success', (data) => {
            showAlert(`User disconnected successfully`, 'success');

            // Refresh current view
            if (currentTab === 'users') {
                refreshUserList();
            } else if (currentTab === 'online') {
                refreshOnlineUsers();
            }
        });

        this.socket.on('user-disconnect-error', (data) => {
            showAlert(`Failed to disconnect user: ${data.message}`, 'error');
        });

        // Handle ping/pong for heartbeat
        this.socket.on('ping', (data) => {
            console.log('🏓 Admin panel received ping from server:', data);
            // Respond immediately with pong
            this.socket.emit('pong', {
                timestamp: new Date().toISOString(),
                received_at: data?.timestamp,
                client_type: 'admin'
            });
            console.log('🏓 Admin panel sent pong response');
        });

        // Handle force logout after full restore
        this.socket.on('force-logout', (data) => {
            console.log('🔄 Force logout received:', data);
            showAlert(data.reason || 'You have been logged out', 'warning');

            // Clear token and logout
            this.token = null;
            localStorage.removeItem('adminToken');

            // Redirect to login page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;

        const text = statusEl.querySelector('span:last-child');

        if (connected) {
            statusEl.className = 'status-indicator online';
            if (text) text.textContent = 'Connected';
        } else {
            statusEl.className = 'status-indicator offline';
            if (text) text.textContent = 'Disconnected';
        }
    }

    async login() {
        const form = document.getElementById('loginForm');
        const formData = new FormData(form);

        try {
            this.setLoading('loginForm', true);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            const data = await parseApiResponse(response);

            if (response.ok && data.success) {
                this.token = data.token;
                localStorage.setItem('adminToken', this.token);
                localStorage.setItem('sessionToken', data.sessionToken);
                this.showAdmin();
                this.socket.emit('subscribe-config-updates');
                this.showAlert('loginAlert', 'Login successful!', 'success');
            } else {
                this.showAlert('loginAlert', data.message || 'Login failed', 'error');
            }
        } catch (error) {
            this.showAlert('loginAlert', 'Network error: ' + error.message, 'error');
        } finally {
            this.setLoading('loginForm', false);
        }
    }

    async verifyToken() {
        try {
            const response = await fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.showAdmin();
                this.socket.emit('subscribe-config-updates');
            } else {
                this.logout();
            }
        } catch (error) {
            this.logout();
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                this.populateConfigForm(data.config);
                this.showAlert('configAlert', 'Configuration loaded successfully!', 'success');
            } else {
                this.showAlert('configAlert', data.message || 'Failed to load configuration', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        }
    }

    async updateConfig() {
        const form = document.getElementById('configForm');
        const formData = new FormData(form);
        
        try {
            this.setLoading('configForm', true);
            
            const response = await fetch('/api/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    apiUrl: formData.get('apiUrl'),
                    activationApiUrl: formData.get('activationApiUrl'),
                    isActive: formData.get('isActive') === 'true'
                })
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                this.showAlert('configAlert', 'Configuration updated successfully!', 'success');
                this.loadStatus();
            } else {
                this.showAlert('configAlert', data.message || 'Failed to update configuration', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        } finally {
            this.setLoading('configForm', false);
        }
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/config/status', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                this.updateStatusDisplay(data.status);
            }
        } catch (error) {
            console.error('Failed to load status:', error);
        }
    }

    async createBackup() {
        try {
            const response = await fetch('/api/config/backup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                this.showAlert('configAlert', `Backup created: ${data.backupFileName}`, 'success');
                this.loadStatus();
                this.loadBackups(); // Refresh backup list
            } else {
                this.showAlert('configAlert', data.message || 'Failed to create backup', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        }
    }

    async loadBackups() {
        try {
            const response = await fetch('/api/config/backups', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                this.displayBackups(data.backups);
                window.showAlert(`Found ${data.count} backup(s)`, 'success');
            } else {
                window.showAlert(data.message || 'Failed to load backups', 'error');
            }
        } catch (error) {
            window.showAlert('Network error: ' + error.message, 'error');
        }
    }

    displayBackups(backups) {
        const backupsList = document.getElementById('backupsList');

        if (backups.length === 0) {
            backupsList.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No backups available</p>';
            return;
        }

        // Sort backups by timestamp (newest first) - use parsedDate from server
        const sortedBackups = [...backups].sort((a, b) => {
            const dateA = new Date(a.parsedDate || a.timestamp);
            const dateB = new Date(b.parsedDate || b.timestamp);
            return dateB - dateA; // Newest first
        });

        let html = '<div style="max-height: 500px; overflow-y: auto;">';
        sortedBackups.forEach((backup, index) => {
            const date = new Date(backup.parsedDate || backup.timestamp).toLocaleString();
            const serialNumber = sortedBackups.length - index; // Serial number: oldest = 1, newest = highest number

            // Get backup information
            const info = backup.info || {};
            const backupType = info.type || backup.backupType || 'unknown';
            const hasDatabase = info.hasDatabase || false;
            const hasConfiguration = info.hasConfiguration || false;
            const statistics = info.statistics || {};

            // Determine backup type display
            let typeDisplay = '';
            let typeColor = '#666';
            if (backupType === 'full') {
                typeDisplay = '🎯 Full Backup';
                typeColor = '#28a745';
            } else if (backupType === 'config-only') {
                typeDisplay = '⚙️ Config Only';
                typeColor = '#ffc107';
            } else if (backupType === 'corrupted') {
                typeDisplay = '❌ Corrupted';
                typeColor = '#dc3545';
            } else {
                typeDisplay = '❓ Unknown';
                typeColor = '#6c757d';
            }

            // Build statistics display
            let statsHtml = '';
            if (statistics.totalUsers !== undefined) {
                statsHtml += `
                    <div class="backup-stats" style="margin-top: 8px; font-size: 12px; color: #666;">
                        <span style="margin-right: 12px;">👥 ${statistics.totalUsers} users</span>
                        <span style="margin-right: 12px;">👤 ${statistics.totalAdmins} admins</span>
                        <span style="margin-right: 12px;">💬 ${statistics.totalChatMessages} messages</span>
                        <span style="margin-right: 12px;">🔒 ${statistics.totalVpnServers} VPN servers</span>
                        <span>${info.fileSizeFormatted || 'Unknown size'}</span>
                    </div>
                `;
            }

            // Build restore options
            let restoreOptionsHtml = '';
            if (backupType === 'full') {
                restoreOptionsHtml = `
                    <div class="restore-options" style="margin-top: 8px;">
                        <button class="btn btn-success btn-sm" onclick="restoreBackup('${backup.filename}', true, true)" title="Restore everything">
                            🔄 Full Restore
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="restoreBackup('${backup.filename}', false, true)" title="Restore configuration only">
                            ⚙️ Config Only
                        </button>
                        <button class="btn btn-info btn-sm" onclick="restoreBackup('${backup.filename}', true, false)" title="Restore database only">
                            🗄️ Database Only
                        </button>
                    </div>
                `;
            } else {
                restoreOptionsHtml = `
                    <div class="restore-options" style="margin-top: 8px;">
                        <button class="btn btn-primary btn-sm" onclick="restoreBackup('${backup.filename}', false, true)">
                            🔄 Restore Config
                        </button>
                    </div>
                `;
            }

            html += `
                <div class="backup-item" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 12px; background: #f9f9f9;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
                        <div class="backup-info" style="flex: 1; min-width: 300px;">
                            <div class="backup-header" style="display: flex; align-items: center; margin-bottom: 6px;">
                                <span style="color: #667eea; font-weight: bold; margin-right: 8px; font-size: 14px;">#${serialNumber}</span>
                                <span style="color: ${typeColor}; font-weight: bold; margin-right: 12px;">${typeDisplay}</span>
                                <span style="color: #333; font-size: 13px;">${backup.filename}</span>
                            </div>
                            <div class="backup-date" style="color: #666; font-size: 12px; margin-bottom: 4px;">
                                📅 Created: ${date}
                            </div>
                            ${info.description ? `<div style="color: #666; font-size: 12px; margin-bottom: 4px;">📝 ${info.description}</div>` : ''}
                            ${statsHtml}
                            ${restoreOptionsHtml}
                        </div>
                        <div class="backup-actions" style="display: flex; flex-direction: column; gap: 6px;">
                            <button class="btn btn-secondary btn-sm" onclick="downloadBackup('${backup.filename}')" title="Download backup file">
                                💾 Download
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="deleteBackup('${backup.filename}')" title="Delete backup">
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        backupsList.innerHTML = html;
    }

    async restoreBackup(backupFileName, restoreDatabase = true, restoreConfiguration = true) {
        // Build confirmation message based on what will be restored
        let confirmMessage = `Are you sure you want to restore from backup: ${backupFileName}?\n\n`;
        let restoreItems = [];

        if (restoreDatabase && restoreConfiguration) {
            confirmMessage += "This will restore EVERYTHING:\n• All database data (users, admins, chat, VPN servers)\n• Configuration settings\n\n⚠️ This will overwrite ALL current data!";
            restoreItems = ['database', 'configuration'];
        } else if (restoreDatabase) {
            confirmMessage += "This will restore DATABASE ONLY:\n• Users, admins, chat conversations, VPN servers\n• Current configuration will be preserved\n\n⚠️ This will overwrite all database data!";
            restoreItems = ['database'];
        } else if (restoreConfiguration) {
            confirmMessage += "This will restore CONFIGURATION ONLY:\n• API settings and configuration\n• Database data will be preserved\n\n⚠️ This will overwrite current configuration!";
            restoreItems = ['configuration'];
        } else {
            window.showAlert('No restore options selected', 'error');
            return;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            window.showAlert(`🔄 Restoring ${restoreItems.join(' and ')} from backup...`, 'info');

            const response = await fetch(`/api/config/restore/${backupFileName}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    restoreDatabase,
                    restoreConfiguration
                })
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                const restoredItems = data.restoredItems || [];
                const backupType = data.backupType || 'unknown';
                const forceLogout = data.forceLogout || false;

                let successMessage = `✅ Successfully restored ${restoredItems.join(' and ')} from backup!\n\n`;
                successMessage += `📁 Backup: ${backupFileName}\n`;
                successMessage += `📊 Type: ${backupType}\n`;
                successMessage += `🔄 Restored: ${restoredItems.join(', ')}`;

                if (forceLogout) {
                    successMessage += `\n\n🔄 You will be logged out automatically for security reasons.`;
                }

                window.showAlert(successMessage, 'success');

                // Handle force logout for full restores
                if (forceLogout) {
                    setTimeout(() => {
                        this.token = null;
                        localStorage.removeItem('adminToken');
                        window.location.reload();
                    }, 3000); // Give user time to read the success message
                    return; // Don't continue with other reload operations
                }

                // Reload relevant data based on what was restored
                if (restoredItems.includes('configuration')) {
                    this.loadConfig(); // Reload current config
                    this.loadStatus(); // Reload status
                }

                if (restoredItems.includes('database')) {
                    // Refresh any database-related displays
                    this.refreshOnlineUsers();
                    this.updateDashboardStats();
                }

                // Reload backups list to show any new backups created during restore
                setTimeout(() => {
                    this.loadBackups();
                }, 1000);

            } else if (response.status === 401) {
                // Handle authentication errors specifically for full restores
                if (restoreDatabase) {
                    window.showAlert(`🔐 Session expired during full restore. The restore may have completed successfully, but you need to log in again to verify.`, 'warning');
                    setTimeout(() => {
                        this.logout();
                    }, 4000); // Give user time to read the message
                } else {
                    window.showAlert(`🔐 Session expired. Please log in again.`, 'error');
                    this.logout();
                }
            } else {
                window.showAlert(`❌ Restore failed: ${data.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            window.showAlert(`❌ Network error during restore: ${error.message}`, 'error');
        }
    }

    async downloadBackup(backupFileName) {
        try {
            const response = await fetch(`/api/config/backups`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                // Create download link
                const link = document.createElement('a');
                link.href = `/backups/${backupFileName}`;
                link.download = backupFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                window.showAlert(`📥 Downloading: ${backupFileName}`, 'success');
            } else {
                window.showAlert('❌ Failed to download backup', 'error');
            }
        } catch (error) {
            window.showAlert(`❌ Network error: ${error.message}`, 'error');
        }
    }

    async deleteBackup(backupFileName) {
        if (!confirm(`⚠️ Are you sure you want to DELETE this backup?\n\n📁 ${backupFileName}\n\n❌ This action cannot be undone!`)) {
            return;
        }

        try {
            const response = await fetch(`/api/config/backups/${backupFileName}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await parseApiResponse(response);

            if (response.ok) {
                window.showAlert(`🗑️ Backup deleted: ${backupFileName}`, 'success');
                this.loadBackups(); // Reload backups list
            } else {
                window.showAlert(`❌ Failed to delete backup: ${data.message || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            window.showAlert(`❌ Network error: ${error.message}`, 'error');
        }
    }

    async uploadBackup() {
        const fileInput = document.getElementById('backupFileInput');
        const file = fileInput.files[0];

        if (!file) {
            window.showAlert('Please select a backup file', 'error');
            return;
        }

        if (!file.name.endsWith('.json')) {
            window.showAlert('Please select a valid JSON backup file', 'error');
            return;
        }

        try {
            // Read file content
            const fileContent = await file.text();
            const backupConfig = JSON.parse(fileContent);

            // Validate it looks like a config
            if (!backupConfig.apiUrl || !backupConfig.username) {
                throw new Error('Invalid backup file format');
            }

            // Confirm restore
            if (!confirm(`Are you sure you want to restore from uploaded file: ${file.name}?\n\nThis will overwrite the current configuration.`)) {
                return;
            }

            // Update configuration with backup data
            const response = await fetch('/api/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(backupConfig)
            });

            const data = await response.json();

            if (response.ok) {
                window.showAlert(`Configuration restored from uploaded file: ${file.name}`, 'success');
                this.loadConfig(); // Reload current config
                this.loadStatus(); // Reload status
                fileInput.value = ''; // Clear file input
            } else {
                window.showAlert(data.message || 'Failed to restore from uploaded file', 'error');
            }
        } catch (error) {
            window.showAlert('Error processing backup file: ' + error.message, 'error');
        }
    }

    async resetConfig() {
        if (!confirm('Are you sure you want to reset configuration to default? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch('/api/config/reset', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.populateConfigForm(data.config);
                this.showAlert('configAlert', 'Configuration reset to default successfully!', 'success');
                this.loadStatus();
            } else {
                this.showAlert('configAlert', data.message || 'Failed to reset configuration', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        }
    }

    populateConfigForm(config) {
        document.getElementById('apiUrl').value = config.apiUrl || '';
        document.getElementById('activationApiUrl').value = config.activationApiUrl || 'https://www.xtream.ro/appactivation';
        document.getElementById('isActive').value = config.isActive ? 'true' : 'false';
    }

    updateStatusDisplay(status) {
        document.getElementById('configStatus').textContent = status.exists ? 'Active' : 'Not Found';
        document.getElementById('lastUpdated').textContent = status.lastUpdated ?
            new Date(status.lastUpdated).toLocaleString() : 'Never';
        document.getElementById('backupCount').textContent = `${status.backupCount} backups`;
    }

    updateAppStatus(status) {
        document.getElementById('appStatus').textContent = status.status || 'Unknown';
    }

    showLogin() {
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('adminPanel').classList.add('hidden');

        // Hide admin profile section
        const profileSection = document.getElementById('adminProfileSection');
        if (profileSection) {
            profileSection.classList.add('hidden');
            profileSection.style.display = 'none';
        }
    }

    showAdmin() {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('adminPanel').classList.remove('hidden');

        // Show admin profile section
        const profileSection = document.getElementById('adminProfileSection');
        if (profileSection) {
            profileSection.classList.remove('hidden');
            profileSection.style.display = 'flex';
        }

        // Initialize with dashboard tab
        showTab('dashboard');

        // Load initial data
        this.loadConfig();
        this.loadStatus();
        this.loadBackups();
        updateDashboardStats();
    }

    async reloadConfig() {
        try {
            const response = await fetch('/api/config/reload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.populateConfigForm(data.config);
                this.showAlert('configAlert', 'Configuration reloaded successfully!', 'success');
                this.loadStatus();
            } else {
                this.showAlert('configAlert', data.message || 'Failed to reload configuration', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        }
    }

    async testConnection() {
        try {
            this.showAlert('configAlert', 'Testing connections...', 'info');

            const response = await fetch('/api/config/test-connection', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                const results = data.results;
                let message = 'Connection Test Results:\n';

                if (results.apiUrl) {
                    message += `• API URL: ${results.apiUrl.status.toUpperCase()} - ${results.apiUrl.message}\n`;
                }

                if (results.activationApiUrl) {
                    message += `• Activation API: ${results.activationApiUrl.status.toUpperCase()} - ${results.activationApiUrl.message}`;
                }

                // Determine overall status
                const hasErrors = (results.apiUrl && results.apiUrl.status === 'error') ||
                                (results.activationApiUrl && results.activationApiUrl.status === 'error');
                const alertType = hasErrors ? 'error' : 'success';

                this.showAlert('configAlert', message, alertType);
            } else {
                this.showAlert('configAlert', data.message || 'Failed to test connection', 'error');
            }
        } catch (error) {
            this.showAlert('configAlert', 'Network error: ' + error.message, 'error');
        }
    }

    async viewLogs() {
        try {
            // Create logs modal if it doesn't exist
            if (!document.getElementById('logsModal')) {
                this.createLogsModal();
            }

            // Show the modal
            document.getElementById('logsModal').style.display = 'block';

            // Load log files list
            await this.loadLogFiles();
        } catch (error) {
            this.showAlert('configAlert', 'Failed to open logs viewer: ' + error.message, 'error');
        }
    }

    async logout() {
        try {
            // Stop activity updates
            this.stopAdminActivityUpdates();

            // Call logout API to revoke session
            const sessionToken = localStorage.getItem('sessionToken');
            if (sessionToken) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'X-Session-Token': sessionToken,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            // Clear local storage regardless of API call result
            localStorage.removeItem('adminToken');
            localStorage.removeItem('sessionToken');
            this.token = null;
            this.showLogin();
            this.showAlert('loginAlert', 'Logged out successfully', 'success');
        }
    }

    startAdminActivityUpdates() {
        // Stop any existing interval
        this.stopAdminActivityUpdates();

        // Send activity update every 2 minutes to keep session alive
        this.activityInterval = setInterval(() => {
            if (this.socket && this.socket.connected && this.token) {
                this.socket.emit('admin-activity', {
                    timestamp: new Date().toISOString(),
                    action: 'heartbeat'
                });
                console.log('💓 Sent admin activity heartbeat');
            }
        }, 120000); // 2 minutes

        console.log('✅ Started admin activity updates');
    }

    stopAdminActivityUpdates() {
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
            this.activityInterval = null;
            console.log('🛑 Stopped admin activity updates');
        }
    }

    createLogsModal() {
        const modalHtml = `
            <div id="logsModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>📋 Log Viewer</h2>
                        <span class="close" onclick="document.getElementById('logsModal').style.display='none'">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="logs-controls">
                            <select id="logFileSelect" onchange="window.adminPanel.loadLogContent()">
                                <option value="">Select a log file...</option>
                            </select>
                            <button onclick="window.adminPanel.refreshLogFiles()" class="btn btn-small">Refresh</button>
                            <button onclick="window.adminPanel.clearCurrentLog()" class="btn btn-small btn-danger">Clear Log</button>
                        </div>
                        <div class="logs-search">
                            <input type="text" id="logSearchInput" placeholder="Search logs..." />
                            <button onclick="window.adminPanel.searchLogs()" class="btn btn-small">Search</button>
                        </div>
                        <div id="logContent" class="log-content">
                            <p>Select a log file to view its contents.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async loadLogFiles() {
        try {
            const response = await fetch('/api/logs', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                const select = document.getElementById('logFileSelect');
                select.innerHTML = '<option value="">Select a log file...</option>';

                data.files.forEach(file => {
                    const option = document.createElement('option');
                    option.value = file.name;
                    option.textContent = `${file.name} (${this.formatFileSize(file.size)}) - ${new Date(file.modified).toLocaleString()}`;
                    select.appendChild(option);
                });
            } else {
                document.getElementById('logContent').innerHTML = `<p class="error">Failed to load log files: ${data.message}</p>`;
            }
        } catch (error) {
            document.getElementById('logContent').innerHTML = `<p class="error">Network error: ${error.message}</p>`;
        }
    }

    async loadLogContent() {
        const filename = document.getElementById('logFileSelect').value;
        if (!filename) {
            document.getElementById('logContent').innerHTML = '<p>Select a log file to view its contents.</p>';
            return;
        }

        try {
            const response = await fetch(`/api/logs/${filename}?lines=200`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                let content = `<div class="log-info">File: ${data.filename} | Total Lines: ${data.totalLines} | Showing: ${data.returnedLines} lines</div>`;
                content += '<div class="log-lines">';

                data.lines.forEach(line => {
                    if (line.parsed) {
                        const levelClass = line.level ? `log-${line.level.toLowerCase()}` : '';
                        content += `<div class="log-line ${levelClass}">
                            <span class="log-timestamp">${line.timestamp || ''}</span>
                            <span class="log-level">[${line.level || 'INFO'}]</span>
                            <span class="log-message">${this.escapeHtml(line.message || line.raw)}</span>
                        </div>`;
                    } else {
                        content += `<div class="log-line"><span class="log-raw">${this.escapeHtml(line.raw)}</span></div>`;
                    }
                });

                content += '</div>';
                document.getElementById('logContent').innerHTML = content;

                // Scroll to bottom
                const logContent = document.getElementById('logContent');
                logContent.scrollTop = logContent.scrollHeight;
            } else {
                document.getElementById('logContent').innerHTML = `<p class="error">Failed to load log content: ${data.message}</p>`;
            }
        } catch (error) {
            document.getElementById('logContent').innerHTML = `<p class="error">Network error: ${error.message}</p>`;
        }
    }

    async refreshLogFiles() {
        await this.loadLogFiles();
        this.showAlert('configAlert', 'Log files refreshed', 'success');
    }

    async clearCurrentLog() {
        const filename = document.getElementById('logFileSelect').value;
        if (!filename) {
            alert('Please select a log file first');
            return;
        }

        if (!confirm(`Are you sure you want to clear the log file "${filename}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/logs/${filename}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                this.showAlert('configAlert', `Log file "${filename}" cleared successfully`, 'success');
                await this.loadLogContent(); // Refresh the content
            } else {
                alert(`Failed to clear log file: ${data.message}`);
            }
        } catch (error) {
            alert(`Network error: ${error.message}`);
        }
    }

    async searchLogs() {
        const query = document.getElementById('logSearchInput').value.trim();
        const filename = document.getElementById('logFileSelect').value;

        if (!query) {
            alert('Please enter a search query');
            return;
        }

        try {
            const response = await fetch('/api/logs/search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    filename: filename || undefined,
                    maxResults: 100
                })
            });

            const data = await response.json();

            if (response.ok) {
                let content = `<div class="log-info">Search Results for "${query}" | Found: ${data.totalResults} matches</div>`;
                content += '<div class="log-lines">';

                data.results.forEach(result => {
                    content += `<div class="log-line log-search-result">
                        <span class="log-file">[${result.filename}:${result.lineNumber}]</span>
                        <span class="log-content">${this.escapeHtml(result.content)}</span>
                    </div>`;
                });

                content += '</div>';
                document.getElementById('logContent').innerHTML = content;
            } else {
                document.getElementById('logContent').innerHTML = `<p class="error">Search failed: ${data.message}</p>`;
            }
        } catch (error) {
            document.getElementById('logContent').innerHTML = `<p class="error">Network error: ${error.message}</p>`;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(containerId, message, type) {
        const container = document.getElementById(containerId);
        container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }

    setLoading(formId, loading) {
        const form = document.getElementById(formId);
        if (loading) {
            form.classList.add('loading');
        } else {
            form.classList.remove('loading');
        }
    }
}

// Global functions for button clicks
function loadConfig() {
    console.log('loadConfig button clicked');
    if (window.adminPanel && window.adminPanel.reloadConfig) {
        window.adminPanel.reloadConfig();
    } else {
        console.error('adminPanel.reloadConfig not found');
        alert('Error: reloadConfig function not available');
    }
}

function createBackup() {
    console.log('createBackup button clicked');
    if (window.adminPanel && window.adminPanel.createBackup) {
        window.adminPanel.createBackup();
    } else {
        console.error('adminPanel.createBackup not found');
        alert('Error: createBackup function not available');
    }
}

function loadBackups() {
    console.log('loadBackups button clicked');
    if (window.adminPanel && window.adminPanel.loadBackups) {
        window.adminPanel.loadBackups();
    } else {
        console.error('adminPanel.loadBackups not found');
        alert('Error: loadBackups function not available');
    }
}

function restoreBackup(backupFileName, restoreDatabase = true, restoreConfiguration = true) {
    console.log('restoreBackup button clicked:', backupFileName, { restoreDatabase, restoreConfiguration });
    if (window.adminPanel && window.adminPanel.restoreBackup) {
        window.adminPanel.restoreBackup(backupFileName, restoreDatabase, restoreConfiguration);
    } else {
        console.error('adminPanel.restoreBackup not found');
        alert('Error: restoreBackup function not available');
    }
}

function downloadBackup(backupFileName) {
    console.log('downloadBackup button clicked:', backupFileName);
    if (window.adminPanel && window.adminPanel.downloadBackup) {
        window.adminPanel.downloadBackup(backupFileName);
    } else {
        console.error('adminPanel.downloadBackup not found');
        alert('Error: downloadBackup function not available');
    }
}

function deleteBackup(backupFileName) {
    console.log('deleteBackup button clicked:', backupFileName);
    if (window.adminPanel && window.adminPanel.deleteBackup) {
        window.adminPanel.deleteBackup(backupFileName);
    } else {
        console.error('adminPanel.deleteBackup not found');
        alert('Error: deleteBackup function not available');
    }
}

function uploadBackup() {
    console.log('uploadBackup button clicked');
    if (window.adminPanel && window.adminPanel.uploadBackup) {
        window.adminPanel.uploadBackup();
    } else {
        console.error('adminPanel.uploadBackup not found');
        alert('Error: uploadBackup function not available');
    }
}

function resetConfig() {
    console.log('resetConfig button clicked');
    if (window.adminPanel && window.adminPanel.resetToDefault) {
        window.adminPanel.resetToDefault();
    } else {
        console.error('adminPanel.resetToDefault not found');
        alert('Error: resetToDefault function not available');
    }
}

// Quick Actions Functions - Made more robust
window.testConnection = async function() {
    console.log('🔗 testConnection button clicked');

    // Show immediate feedback
    const button = event?.target?.closest('button');
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        button.disabled = true;

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 5000);
    }

    try {
        console.log('Testing connection...');
        showAlert('Testing connections...', 'info');

        const token = localStorage.getItem('adminToken');
        console.log('Using token:', token ? 'Token exists' : 'No token');

        const response = await fetch('/api/config/test-connection', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok) {
            const { results, summary } = data;
            let message = `Connection Test Results: ${summary.successful}/${summary.total} successful`;

            // Add details for each test
            if (results.apiUrl) {
                message += `\n• API URL: ${results.apiUrl.status} - ${results.apiUrl.message}`;
            }
            if (results.activationApiUrl) {
                message += `\n• Activation API: ${results.activationApiUrl.status} - ${results.activationApiUrl.message}`;
            }

            const alertType = data.success ? 'success' : summary.successful > 0 ? 'warning' : 'error';
            showAlert(message, alertType, 8000); // Show for 8 seconds
        } else {
            showAlert(`Connection test failed: ${data.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        showAlert(`Connection test failed: ${error.message}`, 'error');
    }
};

window.viewLogs = async function() {
    console.log('📋 viewLogs button clicked');
    try {
        showAlert('Loading system logs...', 'info');

        const token = localStorage.getItem('adminToken');
        if (!token) {
            showAlert('Authentication required to view logs', 'error');
            return;
        }

        // Fetch logs data with authentication
        const response = await fetch('/api/logs', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Logs data:', data);

        // Create and show logs modal
        showLogsModal(data);
        showAlert('System logs loaded successfully', 'success');

    } catch (error) {
        console.error('Error loading logs:', error);
        showAlert(`Failed to load logs: ${error.message}`, 'error');
    }
};

// Show logs in a modal
function showLogsModal(logsData) {
    const modal = document.getElementById('logsModal');
    const logsContent = document.getElementById('logsContent');

    if (!modal || !logsContent) {
        console.error('Logs modal elements not found');
        return;
    }

    // Clear previous content
    logsContent.innerHTML = '';

    if (!logsData.files || logsData.files.length === 0) {
        logsContent.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fas fa-file-alt" style="font-size: 48px; margin-bottom: 16px; display: block;"></i>
                <h3>No Log Files Found</h3>
                <p>No log files are available to display.</p>
            </div>
        `;
    } else {
        // Create logs interface
        logsContent.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h3 style="color: var(--text-primary); margin-bottom: 16px;">
                    <i class="fas fa-file-alt" style="margin-right: 8px;"></i>
                    System Log Files (${logsData.files.length})
                </h3>
                <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                    <select id="logFileSelect" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--dark-surface); color: var(--text-primary);">
                        <option value="">Select a log file...</option>
                        ${logsData.files.map(file => `
                            <option value="${file.name}">${file.name} (${(file.size / 1024).toFixed(1)} KB)</option>
                        `).join('')}
                    </select>
                    <button class="btn btn-primary btn-sm" onclick="loadSelectedLogFile()">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="refreshLogsList()">
                        <i class="fas fa-sync"></i>
                        Refresh
                    </button>
                </div>
            </div>

            <div id="logFileContent" style="background: var(--dark-surface-light); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; max-height: 400px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4;">
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    <i class="fas fa-arrow-up" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Select a log file above to view its contents
                </div>
            </div>

            <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                <div style="color: var(--text-secondary); font-size: 14px;">
                    <i class="fas fa-info-circle" style="margin-right: 4px;"></i>
                    Showing most recent log files first
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-warning btn-sm" onclick="downloadCurrentLog()" id="downloadLogBtn" disabled>
                        <i class="fas fa-download"></i>
                        Download
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="closeModal('logsModal')">
                        <i class="fas fa-times"></i>
                        Close
                    </button>
                </div>
            </div>
        `;
    }

    // Show the modal
    showModal('logsModal');
}

// Load selected log file content
window.loadSelectedLogFile = async function() {
    const select = document.getElementById('logFileSelect');
    const contentDiv = document.getElementById('logFileContent');
    const downloadBtn = document.getElementById('downloadLogBtn');

    if (!select.value) {
        showAlert('Please select a log file first', 'warning');
        return;
    }

    try {
        contentDiv.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                Loading log file: ${select.value}
            </div>
        `;

        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/logs/${select.value}?lines=500`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Display log content
        if (data.lines && data.lines.length > 0) {
            const logLines = data.lines.map(line => {
                if (line.parsed) {
                    const levelColor = {
                        'error': '#ef4444',
                        'warn': '#f59e0b',
                        'info': '#3b82f6',
                        'debug': '#6b7280'
                    }[line.level] || '#6b7280';

                    return `
                        <div style="margin-bottom: 4px; padding: 4px 8px; border-left: 3px solid ${levelColor}; background: rgba(${levelColor.replace('#', '')}, 0.1);">
                            <span style="color: var(--text-muted); font-size: 11px;">[${line.timestamp}]</span>
                            <span style="color: ${levelColor}; font-weight: bold; margin: 0 8px;">${line.level.toUpperCase()}</span>
                            <span style="color: var(--text-primary);">${line.message}</span>
                        </div>
                    `;
                } else {
                    return `
                        <div style="margin-bottom: 2px; padding: 2px 8px; color: var(--text-secondary);">
                            ${line.raw}
                        </div>
                    `;
                }
            }).join('');

            contentDiv.innerHTML = `
                <div style="margin-bottom: 12px; padding: 8px; background: var(--dark-surface); border-radius: 4px; font-size: 11px; color: var(--text-secondary);">
                    <strong>${data.filename}</strong> - Showing ${data.returnedLines} of ${data.totalLines} lines
                    ${data.totalLines > data.returnedLines ? ' (showing most recent)' : ''}
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${logLines}
                </div>
            `;

            downloadBtn.disabled = false;
        } else {
            contentDiv.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                    <i class="fas fa-file" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Log file is empty
                </div>
            `;
            downloadBtn.disabled = true;
        }

    } catch (error) {
        console.error('Error loading log file:', error);
        contentDiv.innerHTML = `
            <div style="text-align: center; color: var(--error-color); padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                <strong>Error loading log file</strong><br>
                ${error.message}
            </div>
        `;
        downloadBtn.disabled = true;
        showAlert(`Failed to load log file: ${error.message}`, 'error');
    }
};

// Refresh logs list
window.refreshLogsList = async function() {
    try {
        showAlert('Refreshing logs list...', 'info');
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/logs', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        showLogsModal(data);
        showAlert('Logs list refreshed', 'success');

    } catch (error) {
        console.error('Error refreshing logs:', error);
        showAlert(`Failed to refresh logs: ${error.message}`, 'error');
    }
};

// Download current log file
window.downloadCurrentLog = async function() {
    const select = document.getElementById('logFileSelect');

    if (!select.value) {
        showAlert('Please select a log file first', 'warning');
        return;
    }

    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/logs/${select.value}?lines=10000`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Create downloadable content
        const logContent = data.lines.map(line => line.raw).join('\n');
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);

        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = select.value;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showAlert(`Log file "${select.value}" downloaded successfully`, 'success');

    } catch (error) {
        console.error('Error downloading log file:', error);
        showAlert(`Failed to download log file: ${error.message}`, 'error');
    }
};

window.createBackup = async function() {
    console.log('💾 createBackup button clicked');

    // Show immediate feedback
    const button = event?.target?.closest('button');
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        button.disabled = true;

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 5000);
    }

    try {
        showAlert('Creating backup...', 'info');

        const token = localStorage.getItem('adminToken');
        console.log('Creating backup with token:', token ? 'Token exists' : 'No token');

        const response = await fetch('/api/config/backup', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Backup response status:', response.status);
        const data = await response.json();
        console.log('Backup response data:', data);

        if (response.ok) {
            showAlert(`Backup created successfully: ${data.backupFileName}`, 'success');
        } else {
            showAlert(`Backup failed: ${data.message || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showAlert(`Backup failed: ${error.message}`, 'error');
    }
};

// Create full backup function
window.createFullBackup = async function() {
    console.log('💾 createFullBackup button clicked');

    // Show immediate feedback
    const button = event?.target?.closest('button');
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        button.disabled = true;

        // Restore button after operation
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 3000);
    }

    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            showAlert('Please login first', 'error');
            return;
        }

        const response = await apiCall('/api/config/backup', {
            method: 'POST'
        });

        showAlert('✅ Full backup created successfully!', 'success');

        // Refresh backup list
        if (typeof loadBackups === 'function') {
            loadBackups();
        }

    } catch (error) {
        console.error('❌ Error creating full backup:', error);
        showAlert(`Failed to create backup: ${error.message}`, 'error');
    }
};

// Create config-only backup function
window.createConfigBackup = async function() {
    console.log('⚙️ createConfigBackup button clicked');

    // Show immediate feedback
    const button = event?.target?.closest('button');
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        button.disabled = true;

        // Restore button after operation
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 3000);
    }

    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            showAlert('Please login first', 'error');
            return;
        }

        const response = await apiCall('/api/config/backup-config-only', {
            method: 'POST'
        });

        showAlert('✅ Configuration backup created successfully!', 'success');

        // Refresh backup list
        if (typeof loadBackups === 'function') {
            loadBackups();
        }

    } catch (error) {
        console.error('❌ Error creating config backup:', error);
        showAlert(`Failed to create config backup: ${error.message}`, 'error');
    }
};

window.logout = async function() {
    console.log('🚪 logout button clicked');

    if (!confirm('Are you sure you want to logout?')) {
        return;
    }

    // Show immediate feedback
    const button = event?.target?.closest('button');
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
        button.disabled = true;
    }

    try {
        const token = localStorage.getItem('adminToken');
        const sessionToken = localStorage.getItem('sessionToken');

        console.log('Logging out with token:', token ? 'Token exists' : 'No token');

        if (token) {
            try {
                const response = await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Session-Token': sessionToken,
                        'Content-Type': 'application/json'
                    }
                });
                console.log('Logout API response:', response.status);
            } catch (error) {
                console.error('Error during logout API call:', error);
            }
        }

        // Clear local storage
        localStorage.removeItem('adminToken');
        localStorage.removeItem('sessionToken');

        showAlert('Logged out successfully', 'success');

        // Reload page to show login
        setTimeout(() => {
            window.location.reload();
        }, 1000);

    } catch (error) {
        console.error('Error during logout:', error);
        showAlert(`Logout failed: ${error.message}`, 'error');

        // Still try to reload on error
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }
};

// Ensure functions are globally accessible for onclick handlers
console.log('🔧 Setting up global function access...');

// Quick Actions
if (typeof window.testConnection !== 'function') {
    console.error('❌ testConnection not found!');
} else {
    console.log('✅ testConnection ready');
}

if (typeof window.viewLogs !== 'function') {
    console.error('❌ viewLogs not found!');
} else {
    console.log('✅ viewLogs ready');
}

if (typeof window.createBackup !== 'function') {
    console.error('❌ createBackup not found!');
} else {
    console.log('✅ createBackup ready');
}

if (typeof window.logout !== 'function') {
    console.error('❌ logout not found!');
} else {
    console.log('✅ logout ready');
}

// Admin Management
if (typeof window.deleteAdmin !== 'function') {
    console.error('❌ deleteAdmin not found!');
} else {
    console.log('✅ deleteAdmin ready');
}

// Initialize the admin panel when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing AdminPanel');
    window.adminPanel = new AdminPanel();
    console.log('AdminPanel initialized:', window.adminPanel);
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.adminPanel)));

    // Ensure all functions are globally accessible
    console.log('Ensuring global function access...');
    console.log('testConnection available:', typeof window.testConnection);
    console.log('viewLogs available:', typeof window.viewLogs);
    console.log('createBackup available:', typeof window.createBackup);
    console.log('logout available:', typeof window.logout);
    console.log('deleteAdmin available:', typeof window.deleteAdmin);

    // Set up OVPN file upload functionality
    setupOvpnFileUpload();
    window.initializeVpnServerFilterToggle();
});

// ===== CHAT FUNCTIONALITY =====

// Global chat variables
let currentConversations = [];
let selectedConversationId = null;
let currentMessages = [];
let typingTimeout = null;
let chatSocket = null;

// Make variables globally accessible for debugging
window.currentConversations = currentConversations;
window.selectedConversationId = selectedConversationId;
window.selectConversation = selectConversation;

// Initialize chat when tab is shown
function initializeChat() {
    console.log('🔄 Initializing chat...');
    console.log('🔄 Function called from:', new Error().stack);

    // Check if we have authentication token
    const token = localStorage.getItem('adminToken');
    if (!token) {
        console.error('❌ No admin token found, cannot initialize chat');
        return;
    }
    console.log('✅ Admin token found');

    // Connect to WebSocket if not already connected
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        console.log('🔌 Connecting to chat socket...');
        connectChatSocket();
    } else {
        console.log('✅ Chat socket already connected');
    }

    // Load conversations immediately and set up auto-refresh
    const loadConversationsNow = () => {
        const statusFilter = document.getElementById('chatStatusFilter');
        const currentStatus = statusFilter ? statusFilter.value : '';
        console.log('📋 Status filter element:', statusFilter);
        console.log('📋 Current status value:', currentStatus);
        console.log('📋 Loading conversations with status:', currentStatus);
        loadConversations(currentStatus);
    };

    // Load immediately
    loadConversationsNow();

    // Set up auto-refresh until conversations are loaded
    const autoRefreshInterval = setInterval(() => {
        const conversationsList = document.getElementById('conversationsList');
        if (conversationsList && conversationsList.innerHTML.includes('Loading conversations')) {
            console.log('🔄 Auto-refreshing conversations...');
            loadConversationsNow();
        } else {
            console.log('✅ Conversations loaded, stopping auto-refresh');
            clearInterval(autoRefreshInterval);
        }
    }, 3000);

    // Stop auto-refresh after 30 seconds
    setTimeout(() => {
        clearInterval(autoRefreshInterval);
        console.log('⏰ Stopped auto-refresh after 30 seconds');
    }, 30000);

    // Also load after a short delay as fallback
    setTimeout(() => {
        loadConversationsNow();
    }, 100);

    // Load chat statistics
    loadChatStats();
}

// Track if chat socket listeners are already set up to prevent duplicates
let chatSocketListenersSetup = false;

// Connect to WebSocket for real-time chat
function connectChatSocket() {
    const socket = window.adminPanel?.socket;
    if (!socket) {
        console.warn('Main socket not available, cannot initialize chat socket');
        // Retry after a short delay
        setTimeout(connectChatSocket, 1000);
        return;
    }

    chatSocket = socket; // Use the existing socket connection

    // Remove existing chat event listeners to prevent duplicates
    if (chatSocketListenersSetup) {
        console.log('🔄 Removing existing chat event listeners to prevent duplicates...');
        socket.off('new-user-message');
        socket.off('new-chat-message');
        socket.off('user-typing');
        socket.off('messages-read');
        // Note: We don't remove 'connect', 'disconnect', or 'ping' as they're handled by the main socket
    }

    // Add connection monitoring (only if not already set up)
    if (!chatSocketListenersSetup) {
        socket.on('connect', () => {
            console.log('✅ Chat socket connected');
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Chat socket disconnected:', reason);
            // Auto-reconnect after a delay
            setTimeout(() => {
                if (window.adminPanel?.socket) {
                    connectChatSocket();
                }
            }, 2000);
        });

        // Handle ping/pong for heartbeat
        socket.on('ping', (data) => {
            console.log('🏓 Chat socket received ping from server:', data);
            // Respond immediately with pong
            socket.emit('pong', {
                timestamp: new Date().toISOString(),
                received_at: data?.timestamp,
                client_type: 'admin_chat'
            });
            console.log('🏓 Chat socket sent pong response');
        });
    }

    // Join admin room for chat notifications
    socket.emit('authenticate', {
        token: localStorage.getItem('adminToken'),
        userType: 'admin'
    });

    // Listen for new user messages
    socket.on('new-user-message', (data) => {
        console.log('📨 New user message received:', data);
        handleNewUserMessage(data);
    });

    // Listen for new chat messages in current conversation
    socket.on('new-chat-message', (data) => {
        console.log('💬 New chat message:', data);

        // Only add message to chat if it's not from the current admin
        // (to prevent duplicates since admin messages are added immediately when sent)
        if (data.conversationId === selectedConversationId) {
            const currentAdminId = getCurrentAdminId();
            const isFromCurrentAdmin = data.senderType === 'admin' && data.senderId === currentAdminId;

            if (!isFromCurrentAdmin) {
                addMessageToChat(data);
            } else {
                console.log('🔄 Skipping duplicate message from current admin');
            }
        }
        updateConversationInList(data.conversationId);
    });

    // Listen for typing indicators
    socket.on('user-typing', (data) => {
        if (data.conversationId === selectedConversationId && data.senderType === 'user') {
            showTypingIndicator(data.isTyping, data.senderName);
        }
    });

    // Listen for messages marked as read
    socket.on('messages-read', (data) => {
        if (data.conversationId === selectedConversationId) {
            markMessagesAsRead(data.messageIds);
        }
    });

    // Mark that chat socket listeners are now set up
    chatSocketListenersSetup = true;
    console.log('✅ Chat socket connected and listeners set up');
}

// Load conversations list
async function loadConversations(status = 'open') {
    try {
        console.log(`🔄 Loading conversations with status: ${status}`);

        const token = localStorage.getItem('adminToken');
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`/api/chat/admin/conversations?status=${status}&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to load conversations: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Conversations loaded:', data);
        console.log('✅ Number of conversations:', data.conversations ? data.conversations.length : 0);

        currentConversations = data.conversations || [];
        window.currentConversations = currentConversations; // Update global reference
        console.log('✅ Current conversations array:', currentConversations);
        renderConversationsList();

        // Update chat statistics
        updateChatStatsFromConversations();

        // Auto-select first conversation if none is selected and conversations exist
        if (!selectedConversationId && currentConversations.length > 0) {
            const firstConversation = currentConversations[0]; // Just select the first conversation
            if (firstConversation) {
                console.log('🎯 Auto-selecting first conversation:', firstConversation.id);
                selectConversation(firstConversation.id);
            }
        }

    } catch (error) {
        console.error('❌ Error loading conversations:', error);
        showChatError('Failed to load conversations: ' + error.message);
    }
}

// Render conversations list in sidebar
function renderConversationsList() {
    console.log('🎨 Rendering conversations list...');
    console.log('🎨 Current conversations:', currentConversations);
    console.log('🎨 Number of conversations:', currentConversations.length);

    const container = document.getElementById('conversationsList');
    console.log('🎨 Container element:', container);

    // Show all conversations (removed filtering to ensure all conversations are visible)
    const filteredConversations = currentConversations;

    if (filteredConversations.length === 0) {
        console.log('🎨 No conversations to display');
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-inbox"></i>
                No conversations found
            </div>
        `;
        return;
    }

    const conversationsHTML = filteredConversations.map(conv => {
        const lastMessageDate = conv.lastMessageAt ? new Date(conv.lastMessageAt) : new Date();
        const timeAgo = formatTimeAgo(lastMessageDate);
        const unreadCount = conv.unreadCount || 0;

        return `
            <div class="conversation-item ${conv.id === selectedConversationId ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}"
                 onclick="selectConversation(${conv.id})">
                <div class="conversation-header">
                    <span class="conversation-user">${conv.user.username}</span>
                    <span class="conversation-time">${timeAgo}</span>
                </div>
                <div class="conversation-preview">
                    ${conv.lastMessage ? conv.lastMessage.message : 'No messages yet'}
                </div>
                <div class="conversation-meta">
                    <span class="conversation-status ${conv.status}">${conv.status}</span>
                    ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = conversationsHTML;
}

// Select a conversation
async function selectConversation(conversationId) {
    selectedConversationId = conversationId;
    window.selectedConversationId = selectedConversationId; // Update global reference

    // Update UI
    renderConversationsList(); // Re-render to show active state

    // Show chat area
    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatArea').classList.remove('hidden');

    // Load conversation details
    const conversation = currentConversations.find(c => c.id === conversationId);
    if (conversation) {
        updateChatHeader(conversation);
    }

    // Join conversation room via WebSocket
    if (chatSocket) {
        chatSocket.emit('join-chat', {
            conversationId: conversationId,
            userType: 'admin',
            userId: getCurrentAdminId()
        });
    }

    // Load messages
    await loadMessages(conversationId);

    // Mark messages as read
    markConversationAsRead(conversationId);
}

// Update chat header with conversation info
function updateChatHeader(conversation) {
    document.getElementById('chatUserName').textContent = conversation.user.username;
    document.getElementById('chatUserStatus').textContent = conversation.user.subscriptionStatus;
    document.getElementById('chatConversationSubject').textContent = conversation.subject;
    document.getElementById('conversationStatus').value = conversation.status;
}

// Load messages for a conversation
async function loadMessages(conversationId) {
    try {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '<div class="messages-loading"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';

        const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load messages');
        }

        const data = await response.json();
        currentMessages = data.messages;

        renderMessages();
        scrollToBottom();

    } catch (error) {
        console.error('Error loading messages:', error);
        showChatError('Failed to load messages');
    }
}

// Render messages in chat area
function renderMessages() {
    const container = document.getElementById('messagesContainer');

    if (currentMessages.length === 0) {
        container.innerHTML = `
            <div class="messages-loading">
                <i class="fas fa-comment-slash"></i>
                No messages in this conversation
            </div>
        `;
        return;
    }

    const messagesHTML = currentMessages.map(message => {
        const messageDate = message.createdAt ? new Date(message.createdAt) : new Date();
        const timeAgo = formatTimeAgo(messageDate);
        const senderName = message.sender ? message.sender.username : 'Unknown';

        return `
            <div class="message ${message.senderType}" data-message-id="${message.id}">
                <div class="message-avatar">
                    <i class="fas fa-${message.senderType === 'user' ? 'user' : 'user-shield'}"></i>
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        ${escapeHtml(message.message)}
                    </div>
                    <div class="message-meta">
                        <span>${senderName}</span>
                        <span>•</span>
                        <span>${timeAgo}</span>
                        ${message.status === 'read' ? '<i class="fas fa-check-double" title="Read"></i>' : '<i class="fas fa-check" title="Sent"></i>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = messagesHTML;
}

// Send a message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message || !selectedConversationId) {
        return;
    }

    if (message.length > 5000) {
        showChatError('Message too long (max 5000 characters)');
        return;
    }

    try {
        // Disable send button
        const sendBtn = document.getElementById('sendMessageBtn');
        sendBtn.disabled = true;

        // Send via WebSocket for real-time delivery
        if (chatSocket) {
            const messageData = {
                conversationId: selectedConversationId,
                message: message,
                senderType: 'admin',
                senderId: getCurrentAdminId()
            };

            chatSocket.emit('send-chat-message', messageData);

            // Add message to chat immediately for better UX
            const tempMessage = {
                id: Date.now(), // Temporary ID
                conversationId: selectedConversationId,
                message: message,
                senderType: 'admin',
                senderId: getCurrentAdminId(),
                sender: { username: 'Admin' },
                createdAt: new Date().toISOString(),
                status: 'sent'
            };
            addMessageToChat(tempMessage);

            // Clear input immediately for better UX
            input.value = '';
            updateCharacterCount();

            // Re-enable send button
            sendBtn.disabled = false;

            // Update conversation in list
            updateConversationInList(selectedConversationId);
        } else {
            // Fallback to REST API if WebSocket is not available
            const response = await fetch(`/api/chat/admin/conversations/${selectedConversationId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            // Clear input
            input.value = '';
            updateCharacterCount();

            // Re-enable send button
            sendBtn.disabled = false;

            // Update conversation in list
            updateConversationInList(selectedConversationId);
        }

    } catch (error) {
        console.error('Error sending message:', error);
        showChatError('Failed to send message');

        // Re-enable send button
        document.getElementById('sendMessageBtn').disabled = false;
    }
}

// Handle message input keydown
function handleMessageKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Handle typing indicator
function handleTyping() {
    const input = document.getElementById('messageInput');
    updateCharacterCount();

    // Update send button state
    const sendBtn = document.getElementById('sendMessageBtn');
    sendBtn.disabled = input.value.trim().length === 0;

    // Send typing indicator
    if (chatSocket && selectedConversationId) {
        chatSocket.emit('typing-start', {
            conversationId: selectedConversationId,
            senderType: 'admin',
            senderId: getCurrentAdminId(),
            senderName: getCurrentAdminUsername()
        });

        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }

        // Stop typing after 2 seconds of inactivity
        typingTimeout = setTimeout(() => {
            chatSocket.emit('typing-stop', {
                conversationId: selectedConversationId,
                senderType: 'admin',
                senderId: getCurrentAdminId()
            });
        }, 2000);
    }
}

// Update character count
function updateCharacterCount() {
    const input = document.getElementById('messageInput');
    const counter = document.getElementById('messageCharCount');
    if (counter) {
        counter.textContent = input.value.length;

        // Change color if approaching limit
        if (input.value.length > 4500) {
            counter.style.color = 'var(--error-color)';
        } else if (input.value.length > 4000) {
            counter.style.color = 'var(--warning-color)';
        } else {
            counter.style.color = 'var(--text-muted)';
        }
    }
}

// Show typing indicator
function showTypingIndicator(isTyping, senderName) {
    const indicator = document.getElementById('typingIndicator');
    const text = document.getElementById('typingText');

    if (isTyping) {
        text.textContent = `${senderName} is typing...`;
        indicator.classList.remove('hidden');
        scrollToBottom();
    } else {
        indicator.classList.add('hidden');
    }
}

// Add new message to chat
function addMessageToChat(messageData) {
    currentMessages.push(messageData);
    renderMessages();
    scrollToBottom();
}

// Mark messages as read
function markMessagesAsRead(messageIds) {
    messageIds.forEach(messageId => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusIcon = messageElement.querySelector('.message-meta i');
            if (statusIcon) {
                statusIcon.className = 'fas fa-check-double';
                statusIcon.title = 'Read';
            }
        }
    });
}

// Mark conversation as read
async function markConversationAsRead(conversationId) {
    try {
        if (chatSocket) {
            chatSocket.emit('mark-messages-read', {
                conversationId: conversationId,
                readerType: 'admin',
                readerId: getCurrentAdminId()
            });
        }

        // Update conversation in list to remove unread indicator
        const conversation = currentConversations.find(c => c.id === conversationId);
        if (conversation) {
            conversation.unreadCount = 0;
            renderConversationsList();
            updateChatStatsFromConversations(); // Update stats after marking as read
            updateUnrepliedMessagesCount(); // Update dashboard unreplied messages count
        }

    } catch (error) {
        console.error('Error marking conversation as read:', error);
    }
}

// Update conversation status
async function updateConversationStatus() {
    const statusSelect = document.getElementById('conversationStatus');
    const newStatus = statusSelect.value;

    if (!selectedConversationId) return;

    try {
        const response = await fetch(`/api/chat/admin/conversations/${selectedConversationId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update conversation status');
        }

        // Update conversation in list
        const conversation = currentConversations.find(c => c.id === selectedConversationId);
        if (conversation) {
            conversation.status = newStatus;
            renderConversationsList();
        }

        showChatSuccess(`Conversation marked as ${newStatus}`);

    } catch (error) {
        console.error('Error updating conversation status:', error);
        showChatError('Failed to update conversation status');

        // Revert select value
        const conversation = currentConversations.find(c => c.id === selectedConversationId);
        if (conversation) {
            statusSelect.value = conversation.status;
        }
    }
}

// Filter conversations by status
function filterConversations() {
    const statusFilter = document.getElementById('chatStatusFilter');
    const status = statusFilter.value;
    loadConversations(status);
}

// Search conversations
function searchConversations() {
    const searchInput = document.getElementById('chatSearchInput');
    const query = searchInput.value.toLowerCase();

    if (!query) {
        renderConversationsList();
        return;
    }

    const filteredConversations = currentConversations.filter(conv =>
        conv.user.username.toLowerCase().includes(query) ||
        conv.subject.toLowerCase().includes(query) ||
        (conv.lastMessage && conv.lastMessage.message.toLowerCase().includes(query))
    );

    // Temporarily update conversations for rendering
    const originalConversations = currentConversations;
    currentConversations = filteredConversations;
    renderConversationsList();
    currentConversations = originalConversations;
}

// Refresh chat
function refreshChat() {
    console.log('🔄 Refreshing chat...');

    if (selectedConversationId) {
        loadMessages(selectedConversationId);
    }

    // Use current filter value
    const statusFilter = document.getElementById('chatStatusFilter');
    const currentStatus = statusFilter ? statusFilter.value : '';
    loadConversations(currentStatus);
}

// Update conversation in list after new message
function updateConversationInList(conversationId) {
    // Reload conversations to get updated data
    loadConversations(document.getElementById('chatStatusFilter').value);
}

// Update chat statistics from current conversations data
function updateChatStatsFromConversations() {
    if (!currentConversations) return;

    const totalConversations = currentConversations.length;
    const openConversations = currentConversations.filter(c => c.status === 'open').length;
    const unreadMessages = currentConversations.reduce((total, c) => total + (c.unreadCount || 0), 0);

    document.getElementById('totalConversations').textContent = totalConversations;
    document.getElementById('openConversations').textContent = openConversations;
    document.getElementById('unreadMessages').textContent = unreadMessages;

    // Update unread badge in tab
    const badge = document.getElementById('chatUnreadBadge');
    if (unreadMessages > 0) {
        badge.textContent = unreadMessages;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    console.log('📊 Updated chat stats:', { totalConversations, openConversations, unreadMessages });
}

// Load chat statistics
async function loadChatStats() {
    try {
        const response = await fetch('/api/chat/admin/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const stats = data.stats;

            document.getElementById('totalConversations').textContent = stats.totalConversations;
            document.getElementById('openConversations').textContent = stats.openConversations;
            document.getElementById('unreadMessages').textContent = stats.unreadMessages;

            // Update unread badge in tab
            const badge = document.getElementById('chatUnreadBadge');
            if (stats.unreadMessages > 0) {
                badge.textContent = stats.unreadMessages;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } else {
            console.error('Failed to load chat stats:', response.status);
            // Fallback to calculating from current conversations
            const totalConversations = currentConversations.length;
            const openConversations = currentConversations.filter(c => c.status === 'open').length;
            const unreadMessages = currentConversations.reduce((total, c) => total + (c.unreadCount || 0), 0);

            document.getElementById('totalConversations').textContent = totalConversations;
            document.getElementById('openConversations').textContent = openConversations;
            document.getElementById('unreadMessages').textContent = unreadMessages;

            // Update unread badge in tab
            const badge = document.getElementById('chatUnreadBadge');
            if (unreadMessages > 0) {
                badge.textContent = unreadMessages;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('Error loading chat stats:', error);
        // Fallback to calculating from current conversations
        const totalConversations = currentConversations.length;
        const openConversations = currentConversations.filter(c => c.status === 'open').length;
        const unreadMessages = currentConversations.reduce((total, c) => total + (c.unreadCount || 0), 0);

        document.getElementById('totalConversations').textContent = totalConversations;
        document.getElementById('openConversations').textContent = openConversations;
        document.getElementById('unreadMessages').textContent = unreadMessages;

        // Update unread badge in tab
        const badge = document.getElementById('chatUnreadBadge');
        if (unreadMessages > 0) {
            badge.textContent = unreadMessages;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// Handle new user message notification
function handleNewUserMessage(data) {
    // Update unread count
    loadChatStats();

    // Update dashboard unreplied messages count
    updateUnrepliedMessagesCount();

    // If conversation is not currently selected, show notification
    if (data.conversationId !== selectedConversationId) {
        showChatNotification(`New message from ${data.conversation.user.username}`);
    }

    // Reload conversations to update list
    loadConversations(document.getElementById('chatStatusFilter').value);
}

// Utility functions
function getCurrentAdminId() {
    // This should be stored when admin logs in
    return parseInt(localStorage.getItem('adminId')) || 1;
}

function getCurrentAdminUsername() {
    return localStorage.getItem('adminUsername') || 'Admin';
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

function formatTimeAgo(date) {
    // Handle invalid dates
    if (!date || isNaN(date.getTime())) {
        return 'Unknown';
    }

    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showChatError(message) {
    // You can implement a toast notification system here
    console.error('Chat Error:', message);
    alert('Error: ' + message);
}

function showChatSuccess(message) {
    // You can implement a toast notification system here
    console.log('Chat Success:', message);
}

function showChatNotification(message) {
    // You can implement a notification system here
    console.log('Chat Notification:', message);
}

// Add chat to the tab initialization
const originalShowTab = window.showTab;
window.showTab = function(tabName) {
    originalShowTab(tabName);

    if (tabName === 'chat') {
        console.log('🔄 Chat tab selected, force loading conversations...');

        // Check if admin token exists before initializing
        const token = localStorage.getItem('adminToken');
        if (!token) {
            console.error('❌ No admin token found when switching to chat tab');
            return;
        }

        // Force load conversations immediately when chat tab is clicked
        setTimeout(() => {
            console.log('🔄 Force loading conversations from showTab...');
            loadConversations(''); // Load all conversations

            // Also initialize chat features
            initializeChat();
        }, 100);
    }
};

// ===== VPN SERVER MANAGEMENT FUNCTIONS =====

let vpnServers = [];
let filteredVpnServers = [];
let showOnlyCustomVpnServers = false;

function toBooleanValue(value, fallback = false) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === null || value === undefined) return false;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;

    return fallback;
}

function isCustomVpnServer(server) {
    return toBooleanValue(server?.is_custom, false);
}

function updateVpnServerFilterStatus() {
    const status = document.getElementById('serverFilterStatus');
    if (!status) return;

    const customCount = vpnServers.filter(isCustomVpnServer).length;
    status.textContent = showOnlyCustomVpnServers
        ? `App visibility: custom only (${customCount}/${vpnServers.length})`
        : `App visibility: all servers (${vpnServers.length})`;
}

window.initializeVpnServerFilterToggle = function() {
    const toggle = document.getElementById('showOnlyCustomServersToggle');
    if (!toggle || toggle.dataset.bound === 'true') return;

    toggle.dataset.bound = 'true';
    toggle.addEventListener('change', () => {
        window.toggleCustomServersFilter();
    });
};

function updateVpnServerCount() {
    const serverCount = document.getElementById('serverCount');
    if (!serverCount) return;

    const customCount = vpnServers.filter(isCustomVpnServer).length;
    serverCount.textContent = showOnlyCustomVpnServers
        ? `${filteredVpnServers.length} shown - ${customCount} custom - ${vpnServers.length} total`
        : `${filteredVpnServers.length} shown - ${vpnServers.length} total`;
}

// Refresh VPN server list
window.refreshVpnServerList = async function() {
    console.log('🔄 Refreshing VPN server list...');
    const tbody = document.getElementById('vpnServerTableBody');
    window.initializeVpnServerFilterToggle();

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading VPN servers...
                </td>
            </tr>
        `;
    }

    try {
        // Load filter first so the admin list mirrors app visibility.
        await loadVpnServerFilterSetting();
        const serverResponse = await apiCall('/api/vpn-servers?limit=1000');

        vpnServers = serverResponse.data || [];
        updateServerCountryFilter();
        filterVpnServers();
        updateVpnServerFilterStatus();
    } catch (error) {
        console.error('Error loading VPN servers:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                        Error loading VPN servers: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
};

// Display VPN servers in table
function displayVpnServers(servers) {
    const tbody = document.getElementById('vpnServerTableBody');
    if (!tbody) return;

    if (servers.length === 0) {
        const customCount = vpnServers.filter(isCustomVpnServer).length;
        const hasFilters =
            Boolean(document.getElementById('serverSearch')?.value) ||
            Boolean(document.getElementById('serverStatusFilter')?.value) ||
            Boolean(document.getElementById('serverCountryFilter')?.value);
        const emptyTitle = vpnServers.length === 0
            ? 'No VPN servers found'
            : showOnlyCustomVpnServers && customCount === 0
                ? 'No custom VPN servers yet'
                : 'No servers match these filters';
        const emptyHint = vpnServers.length === 0
            ? 'Add a server to make VPN locations available.'
            : showOnlyCustomVpnServers && customCount === 0
                ? 'Turn off "Show Only Custom Servers" or add a custom server.'
                : hasFilters
                    ? 'Clear filters or change the search terms.'
                    : 'Try refreshing the server list.';
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted);">
                    <i class="fas fa-server" style="margin-right: 8px;"></i>
                    <div style="font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">${emptyTitle}</div>
                    <div style="font-size: 13px;">${emptyHint}</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = servers.map(server => {
        const rawLoad = Number(server.server_load);
        const load = Number.isFinite(rawLoad) ? Math.max(0, Math.min(100, rawLoad)) : 0;
        const loadColor = load > 80 ? 'var(--error-color)' : load > 60 ? 'var(--warning-color)' : 'var(--success-color)';
        const serverId = Number.isFinite(Number(server.id)) ? Number(server.id) : 0;
        const serverName = String(server.name || 'Unnamed VPN server');
        const onclickName = escapeHtml(serverName.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
        const countryLong = escapeHtml(server.country_long || server.country_short || 'Unknown');
        const countryShort = escapeHtml(server.country_short || '--');
        const isActive = toBooleanValue(server.is_active, false);

        return `
        <tr>
            <td>
                <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                    ${server.is_featured ? '<i class="fas fa-star" style="color: #ffc107; font-size: 14px;" title="Featured Server"></i>' : ''}
                    ${escapeHtml(serverName)}
                </div>
                ${server.location ? `<div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(server.location)}</div>` : ''}
            </td>
            <td style="font-family: monospace; color: var(--text-secondary);">${escapeHtml(server.hostname || '-')}</td>
            <td style="font-family: monospace; color: var(--text-secondary);">${escapeHtml(server.ip || '-')}:${server.port || '-'}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${countryLong}</span>
                    <span style="font-size: 12px; color: var(--text-muted);">(${countryShort})</span>
                </div>
            </td>
            <td>
                <span style="text-transform: uppercase; font-weight: 500; color: var(--accent-color);">${escapeHtml(server.protocol || 'udp')}</span>
            </td>
            <td>
                <span class="user-status ${isActive ? 'online' : 'offline'}">
                    <i class="fas fa-circle" style="font-size: 8px;"></i>
                    ${isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 40px; height: 6px; background: var(--dark-surface-light); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${load}%; height: 100%; background: ${loadColor}; transition: width 0.3s ease;"></div>
                    </div>
                    <span style="font-size: 12px; color: var(--text-muted);">${load.toFixed(1)}%</span>
                </div>
            </td>
            <td class="table-actions-cell">
                <div class="table-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editVpnServer(${serverId})" title="Edit Server">
                        <i class="fas fa-edit"></i>
                        <span class="action-label">Edit</span>
                    </button>
                    <button class="btn ${isActive ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleVpnServerStatus(${serverId})" title="${isActive ? 'Deactivate' : 'Activate'} Server">
                        <i class="fas fa-${isActive ? 'pause' : 'play'}"></i>
                        <span class="action-label">${isActive ? 'Off' : 'On'}</span>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteVpnServer(${serverId}, '${onclickName}')" title="Delete Server">
                        <i class="fas fa-trash"></i>
                        <span class="action-label">Del</span>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

// Update country filter dropdown
function updateServerCountryFilter() {
    const countryFilter = document.getElementById('serverCountryFilter');
    if (!countryFilter) return;

    const countries = [...new Set(vpnServers.map(server => server.country_short).filter(Boolean))].sort();

    // Keep the "All Countries" option and add countries
    countryFilter.innerHTML = '<option value="">All Countries</option>' +
        countries.map(country => {
            const countryName = vpnServers.find(s => s.country_short === country)?.country_long || country;
            return `<option value="${escapeHtml(country)}">${escapeHtml(countryName)} (${escapeHtml(country)})</option>`;
        }).join('');
}

// Filter VPN servers
window.filterVpnServers = function() {
    const searchTerm = document.getElementById('serverSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('serverStatusFilter')?.value || '';
    const countryFilter = document.getElementById('serverCountryFilter')?.value || '';

    filteredVpnServers = vpnServers.filter(server => {
        const matchesCustom = !showOnlyCustomVpnServers || isCustomVpnServer(server);
        const serverName = String(server.name || '').toLowerCase();
        const serverHostname = String(server.hostname || '').toLowerCase();
        const serverIp = String(server.ip || '');
        const serverCountry = String(server.country_short || '');
        const matchesSearch = !searchTerm ||
            serverName.includes(searchTerm) ||
            serverHostname.includes(searchTerm) ||
            serverIp.includes(searchTerm);

        const matchesStatus = !statusFilter || String(toBooleanValue(server.is_active, false)) === statusFilter;
        const matchesCountry = !countryFilter || serverCountry === countryFilter;

        return matchesSearch && matchesStatus && matchesCountry && matchesCustom;
    });

    displayVpnServers(filteredVpnServers);
    updateVpnServerCount();
    updateVpnServerFilterStatus();
};

// Clear VPN server filters
window.clearVpnServerFilters = function() {
    document.getElementById('serverSearch').value = '';
    document.getElementById('serverStatusFilter').value = '';
    document.getElementById('serverCountryFilter').value = '';
    filterVpnServers();
};

// Show add VPN server modal
window.showAddVpnServerModal = function() {
    document.getElementById('vpnServerModalTitle').textContent = 'Add VPN Server';
    document.getElementById('vpnServerSaveText').textContent = 'Save Server';
    document.getElementById('vpnServerForm').reset();
    document.getElementById('vpnServerId').value = '';
    document.getElementById('serverPort').value = '1194';
    document.getElementById('serverProtocol').value = 'udp';
    document.getElementById('serverSpeed').value = '0';
    document.getElementById('serverMaxConnections').value = '100';
    document.getElementById('serverIsActive').checked = true;
    document.getElementById('serverIsFeatured').checked = true; // New servers are featured by default
    showModal('vpnServerModal');
};

// Edit VPN server
window.editVpnServer = async function(serverId) {
    try {
        const response = await apiCall(`/api/vpn-servers/${serverId}`);
        const server = response.data;

        document.getElementById('vpnServerModalTitle').textContent = 'Edit VPN Server';
        document.getElementById('vpnServerSaveText').textContent = 'Update Server';

        // Populate form fields
        document.getElementById('vpnServerId').value = server.id;
        document.getElementById('serverName').value = server.name;
        document.getElementById('serverHostname').value = server.hostname;
        document.getElementById('serverIp').value = server.ip;
        document.getElementById('serverPort').value = server.port;
        document.getElementById('serverProtocol').value = server.protocol;
        document.getElementById('serverCountryLong').value = server.country_long;
        document.getElementById('serverCountryShort').value = server.country_short;
        document.getElementById('serverLocation').value = server.location || '';
        document.getElementById('serverUsername').value = server.username || '';
        document.getElementById('serverPassword').value = ''; // Don't populate password for security
        document.getElementById('serverSpeed').value = server.speed;
        document.getElementById('serverMaxConnections').value = server.max_connections;

        // Decode Base64 OpenVPN configuration for editing
        try {
            document.getElementById('serverConfig').value = atob(server.openvpn_config_base64);
            console.log('✅ OpenVPN configuration Base64 decoded successfully for editing');
        } catch (error) {
            console.error('❌ Error decoding OpenVPN configuration:', error);
            document.getElementById('serverConfig').value = server.openvpn_config_base64; // Fallback to raw data
        }

        document.getElementById('serverDescription').value = server.description || '';
        document.getElementById('serverIsActive').checked = server.is_active;
        document.getElementById('serverIsFeatured').checked = server.is_featured;

        showModal('vpnServerModal');
    } catch (error) {
        console.error('Error loading VPN server for edit:', error);
        alert('Error loading server details: ' + error.message);
    }
};

// Save VPN server (create or update)
window.saveVpnServer = async function() {
    const form = document.getElementById('vpnServerForm');
    const formData = new FormData(form);
    const serverId = document.getElementById('vpnServerId').value;

    // Convert FormData to object
    const serverData = {};
    for (let [key, value] of formData.entries()) {
        if (key === 'is_active') {
            serverData[key] = document.getElementById('serverIsActive').checked;
        } else if (key === 'is_featured') {
            serverData[key] = document.getElementById('serverIsFeatured').checked;
        } else if (key === 'port' || key === 'speed' || key === 'max_connections') {
            serverData[key] = parseInt(value) || (key === 'port' ? 1194 : key === 'max_connections' ? 100 : 0);
        } else if (value.trim()) {
            serverData[key] = value.trim();
        }
    }

    // Validate required fields (only name, country code, and OpenVPN config are required)
    if (!serverData.name || !serverData.country_short || !serverData.openvpn_config_base64) {
        alert('Please fill in all required fields:\n- Server Name\n- Country Code\n- OpenVPN Configuration');
        return;
    }

    // Base64 encode the OpenVPN configuration
    try {
        serverData.openvpn_config_base64 = btoa(serverData.openvpn_config_base64);
        console.log('✅ OpenVPN configuration Base64 encoded successfully');
    } catch (error) {
        console.error('❌ Error encoding OpenVPN configuration:', error);
        alert('Error encoding OpenVPN configuration. Please check the configuration format.');
        return;
    }

    try {
        let response;
        if (serverId) {
            // Update existing server
            response = await apiCall(`/api/vpn-servers/${serverId}`, {
                method: 'PUT',
                body: JSON.stringify(serverData)
            });
        } else {
            // Create new server
            response = await apiCall('/api/vpn-servers', {
                method: 'POST',
                body: JSON.stringify(serverData)
            });
        }

        console.log('✅ VPN server saved successfully:', response);
        closeModal('vpnServerModal');
        refreshVpnServerList();

        // Show success message
        showAlert('success', response.message || `VPN server ${serverId ? 'updated' : 'created'} successfully!`);
    } catch (error) {
        console.error('Error saving VPN server:', error);
        showAlert('error', 'Error saving VPN server: ' + error.message);
    }
};

// Toggle VPN server status
window.toggleVpnServerStatus = async function(serverId) {
    try {
        const response = await apiCall(`/api/vpn-servers/${serverId}/toggle`, {
            method: 'PATCH'
        });

        console.log('✅ VPN server status toggled:', response);
        refreshVpnServerList();
        showAlert('success', response.message);
    } catch (error) {
        console.error('Error toggling VPN server status:', error);
        showAlert('error', 'Error toggling server status: ' + error.message);
    }
};

// Delete VPN server
window.deleteVpnServer = async function(serverId, serverName) {
    if (!confirm(`Are you sure you want to delete the VPN server "${serverName}"?\n\nThis action cannot be undone and will immediately remove the server from all client applications.`)) {
        return;
    }

    try {
        const response = await apiCall(`/api/vpn-servers/${serverId}`, {
            method: 'DELETE'
        });

        console.log('✅ VPN server deleted:', response);
        refreshVpnServerList();
        showAlert('success', response.message || 'VPN server deleted successfully!');
    } catch (error) {
        console.error('Error deleting VPN server:', error);
        showAlert('error', 'Error deleting VPN server: ' + error.message);
    }
};

// Load VPN server filter setting
window.loadVpnServerFilterSetting = async function() {
    try {
        window.initializeVpnServerFilterToggle();
        const response = await apiCall('/api/vpn-servers/settings/filter');
        const showOnlyCustom = response.data?.showOnlyCustomServers;
        showOnlyCustomVpnServers = toBooleanValue(showOnlyCustom, false);

        const toggle = document.getElementById('showOnlyCustomServersToggle');
        if (toggle) {
            toggle.checked = showOnlyCustomVpnServers;
            toggle.disabled = false;
        }

        updateVpnServerFilterStatus();
        console.log('✅ VPN server filter setting loaded:', showOnlyCustomVpnServers);
    } catch (error) {
        console.error('Error loading VPN server filter setting:', error);
        // Default to false if there's an error
        showOnlyCustomVpnServers = false;
        const toggle = document.getElementById('showOnlyCustomServersToggle');
        if (toggle) {
            toggle.checked = false;
        }
        updateVpnServerFilterStatus();
    }
};

// Toggle custom servers filter
window.toggleCustomServersFilter = async function() {
    const toggle = document.getElementById('showOnlyCustomServersToggle');
    if (!toggle) return;

    window.initializeVpnServerFilterToggle();
    const showOnlyCustom = toggle.checked;
    const previousValue = showOnlyCustomVpnServers;
    showOnlyCustomVpnServers = showOnlyCustom;
    toggle.disabled = true;
    const status = document.getElementById('serverFilterStatus');
    if (status) {
        status.textContent = `Saving visibility: ${showOnlyCustom ? 'custom only' : 'all servers'}...`;
    }
    filterVpnServers();

    try {
        console.log('🔄 Updating VPN server filter setting:', showOnlyCustom);

        const response = await apiCall('/api/vpn-servers/settings/filter', {
            method: 'PUT',
            body: JSON.stringify({
                showOnlyCustomServers: showOnlyCustom
            })
        });

        console.log('✅ VPN server filter setting updated:', response);
        showOnlyCustomVpnServers = toBooleanValue(response.data?.showOnlyCustomServers, showOnlyCustom);
        toggle.checked = showOnlyCustomVpnServers;

        // Show success message and update admin table immediately too.
        showAlert('success', `Filter updated: ${showOnlyCustomVpnServers ? 'Showing only custom servers' : 'Showing all servers'}`);
        filterVpnServers();

    } catch (error) {
        console.error('Error updating VPN server filter setting:', error);
        showAlert('error', 'Error updating filter setting: ' + error.message);

        // Revert the toggle on error
        showOnlyCustomVpnServers = previousValue;
        toggle.checked = showOnlyCustomVpnServers;
        filterVpnServers();
    } finally {
        toggle.disabled = false;
        updateVpnServerFilterStatus();
    }
};

// Helper function to show alerts
function showAlert(type, message) {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'}"></i>
        ${message}
    `;

    // Insert at top of VPN servers tab
    const vpnServersTab = document.getElementById('vpnServersTab');
    if (vpnServersTab) {
        vpnServersTab.insertBefore(alert, vpnServersTab.firstChild);

        // Remove alert after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// OVPN File Upload and Parsing Functionality
function setupOvpnFileUpload() {
    const fileInput = document.getElementById('ovpnFileInput');
    const uploadBtn = document.getElementById('uploadOvpnBtn');
    const clearBtn = document.getElementById('clearOvpnBtn');
    const fileName = document.getElementById('ovpnFileName');
    const configTextarea = document.getElementById('serverConfig');
    const urlInput = document.getElementById('ovpnUrlInput');
    const downloadBtn = document.getElementById('downloadOvpnBtn');

    if (!fileInput || !uploadBtn || !clearBtn || !fileName || !configTextarea) {
        console.warn('⚠️ OVPN upload elements not found, skipping setup');
        return;
    }

    console.log('🔧 Setting up OVPN file upload and URL download functionality');

    // Upload button click handler
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change handler
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleOvpnFileUpload(file);
        }
    });

    // Clear button click handler
    clearBtn.addEventListener('click', () => {
        clearOvpnFile();
    });

    // URL download functionality
    if (urlInput && downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                handleOvpnUrlDownload(url);
            } else {
                alert('Please enter a valid URL');
            }
        });

        // Allow Enter key to trigger download
        urlInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                downloadBtn.click();
            }
        });
    }
}

function handleOvpnFileUpload(file) {
    console.log('📁 Processing OVPN file:', file.name);

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.ovpn') && !file.name.toLowerCase().endsWith('.conf')) {
        alert('Please select a valid .ovpn or .conf file');
        return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
        alert('File size too large. Please select a file smaller than 1MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const ovpnContent = e.target.result;
            parseOvpnFile(ovpnContent, file.name);
        } catch (error) {
            console.error('❌ Error reading OVPN file:', error);
            alert('Error reading file. Please try again.');
        }
    };
    reader.readAsText(file);
}

async function handleOvpnUrlDownload(url) {
    console.log('🌐 Downloading OVPN file from URL:', url);

    // Validate URL format
    try {
        new URL(url);
    } catch (error) {
        alert('Please enter a valid URL');
        return;
    }

    // Show loading state
    const downloadBtn = document.getElementById('downloadOvpnBtn');
    const originalText = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i>Downloading...';
    downloadBtn.disabled = true;

    try {
        showNotification('Downloading OVPN file...', 'info');

        // Make request to backend to download the file
        const response = await fetch('/api/download-ovpn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ url: url })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to download OVPN file');
        }

        const data = await response.json();

        if (data.success && data.content) {
            console.log('✅ OVPN file downloaded successfully');

            // Extract filename from URL
            const urlObj = new URL(url);
            const filename = urlObj.pathname.split('/').pop() || 'downloaded.ovpn';

            // Parse the downloaded content
            parseOvpnFile(data.content, filename);

            showNotification('OVPN file downloaded and parsed successfully!', 'success');

            // Clear the URL input
            document.getElementById('ovpnUrlInput').value = '';

        } else {
            throw new Error(data.message || 'Invalid response from server');
        }

    } catch (error) {
        console.error('❌ Error downloading OVPN file:', error);
        showNotification(`Error downloading OVPN file: ${error.message}`, 'error');
        alert(`Error downloading OVPN file: ${error.message}`);
    } finally {
        // Restore button state
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
}

function parseOvpnFile(content, fileName) {
    console.log('🔍 Parsing OVPN file content...');

    try {
        // Parse the OVPN configuration
        const parsedData = parseOvpnConfiguration(content);

        // Auto-populate form fields
        populateFormFromOvpn(parsedData, content);

        // Update UI
        document.getElementById('ovpnFileName').textContent = `📁 ${fileName}`;
        document.getElementById('ovpnFileName').style.display = 'inline';
        document.getElementById('clearOvpnBtn').style.display = 'inline-block';

        console.log('✅ OVPN file parsed and form populated successfully');

        // Show success message
        showNotification('OVPN file uploaded and parsed successfully!', 'success');

    } catch (error) {
        console.error('❌ Error parsing OVPN file:', error);
        alert(`Error parsing OVPN file: ${error.message}`);
    }
}

function parseOvpnConfiguration(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const config = {};

    for (const line of lines) {
        // Parse remote server
        if (line.startsWith('remote ')) {
            const parts = line.split(' ');
            config.hostname = parts[1];
            config.port = parts[2] ? parseInt(parts[2]) : 1194;
        }

        // Parse protocol
        if (line.startsWith('proto ')) {
            config.protocol = line.split(' ')[1].toUpperCase();
        }

        // Parse device type
        if (line.startsWith('dev ')) {
            config.device = line.split(' ')[1];
        }

        // Parse cipher
        if (line.startsWith('cipher ')) {
            config.cipher = line.split(' ')[1];
        }

        // Parse authentication
        if (line.startsWith('auth ')) {
            config.auth = line.split(' ')[1];
        }

        // Parse compression
        if (line.includes('comp-lzo') || line.includes('compress')) {
            config.compression = true;
        }

        // Parse verb level
        if (line.startsWith('verb ')) {
            config.verbosity = parseInt(line.split(' ')[1]);
        }
    }

    // Validate required fields
    if (!config.hostname) {
        throw new Error('No remote server found in OVPN file');
    }

    return config;
}

function populateFormFromOvpn(parsedData, fullContent) {
    // Auto-populate server name if not set
    const serverNameField = document.getElementById('serverName');
    if (serverNameField && !serverNameField.value) {
        serverNameField.value = parsedData.hostname || 'Imported Server';
    }

    // Auto-populate hostname
    const hostnameField = document.getElementById('serverHostname');
    if (hostnameField && parsedData.hostname) {
        hostnameField.value = parsedData.hostname;
    }

    // Auto-populate port
    const portField = document.getElementById('serverPort');
    if (portField && parsedData.port) {
        portField.value = parsedData.port;
    }

    // Auto-populate protocol
    const protocolField = document.getElementById('serverProtocol');
    if (protocolField && parsedData.protocol) {
        protocolField.value = parsedData.protocol;
    }

    // Set the full configuration content
    const configField = document.getElementById('serverConfig');
    if (configField) {
        configField.value = fullContent;
    }

    // Try to extract country from hostname
    const countryField = document.getElementById('serverCountry');
    if (countryField && parsedData.hostname && !countryField.value) {
        const extractedCountry = extractCountryFromHostname(parsedData.hostname);
        if (extractedCountry) {
            countryField.value = extractedCountry;
        }
    }

    console.log('📝 Form populated with parsed data:', parsedData);
}

function extractCountryFromHostname(hostname) {
    // Common country code patterns in VPN hostnames
    const countryPatterns = {
        'us': 'US', 'usa': 'US', 'united-states': 'US',
        'uk': 'GB', 'gb': 'GB', 'britain': 'GB', 'england': 'GB',
        'de': 'DE', 'germany': 'DE', 'deutschland': 'DE',
        'fr': 'FR', 'france': 'FR',
        'nl': 'NL', 'netherlands': 'NL', 'holland': 'NL',
        'ca': 'CA', 'canada': 'CA',
        'au': 'AU', 'australia': 'AU',
        'jp': 'JP', 'japan': 'JP',
        'sg': 'SG', 'singapore': 'SG',
        'hk': 'HK', 'hongkong': 'HK', 'hong-kong': 'HK',
        'in': 'IN', 'india': 'IN',
        'br': 'BR', 'brazil': 'BR',
        'mx': 'MX', 'mexico': 'MX',
        'es': 'ES', 'spain': 'ES',
        'it': 'IT', 'italy': 'IT',
        'se': 'SE', 'sweden': 'SE',
        'no': 'NO', 'norway': 'NO',
        'dk': 'DK', 'denmark': 'DK',
        'fi': 'FI', 'finland': 'FI',
        'ch': 'CH', 'switzerland': 'CH',
        'at': 'AT', 'austria': 'AT',
        'be': 'BE', 'belgium': 'BE',
        'pl': 'PL', 'poland': 'PL',
        'cz': 'CZ', 'czech': 'CZ',
        'ru': 'RU', 'russia': 'RU',
        'tr': 'TR', 'turkey': 'TR',
        'il': 'IL', 'israel': 'IL',
        'ae': 'AE', 'uae': 'AE', 'emirates': 'AE',
        'za': 'ZA', 'south-africa': 'ZA',
        'kr': 'KR', 'korea': 'KR', 'south-korea': 'KR',
        'tw': 'TW', 'taiwan': 'TW',
        'th': 'TH', 'thailand': 'TH',
        'my': 'MY', 'malaysia': 'MY',
        'id': 'ID', 'indonesia': 'ID',
        'ph': 'PH', 'philippines': 'PH',
        'vn': 'VN', 'vietnam': 'VN'
    };

    const lowerHostname = hostname.toLowerCase();

    for (const [pattern, countryCode] of Object.entries(countryPatterns)) {
        if (lowerHostname.includes(pattern)) {
            return countryCode;
        }
    }

    return null;
}

function clearOvpnFile() {
    // Clear file input
    document.getElementById('ovpnFileInput').value = '';

    // Hide UI elements
    document.getElementById('ovpnFileName').style.display = 'none';
    document.getElementById('clearOvpnBtn').style.display = 'none';

    // Clear configuration textarea
    document.getElementById('serverConfig').value = '';

    console.log('🗑️ OVPN file cleared');
    showNotification('OVPN file cleared', 'info');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} alert-dismissible fade show`;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// ===== CONTENT MANAGEMENT FUNCTIONS =====

// Load content management data
async function loadContentManagement() {
    try {
        showAlert('Loading content...', 'info');

        const response = await apiCall('/api/content/admin/all');
        const contents = response.data;

        // Update content previews
        contents.forEach(content => {
            updateContentPreview(content.content_key, content);
        });

        clearAlert('contentAlert');
        showAlert('Content loaded successfully!', 'success');
    } catch (error) {
        console.error('Error loading content:', error);
        showAlert(`Failed to load content: ${error.message}`, 'error');
    }
}

// Update content preview in the main interface
function updateContentPreview(key, content) {
    const previewElement = document.getElementById(`${key.replace('_', '')}Preview`);
    const metaElement = document.getElementById(`${key.replace('_', '')}Meta`);

    if (previewElement) {
        // Truncate content for preview
        const truncatedContent = content.content.length > 200
            ? content.content.substring(0, 200) + '...'
            : content.content;

        previewElement.innerHTML = `<div>${truncatedContent}</div>`;
        previewElement.classList.remove('loading');
    }

    if (metaElement) {
        const updatedAt = new Date(content.updatedAt).toLocaleString();
        const updatedBy = content.updatedBy ? ` by ${content.updatedBy.username}` : '';
        metaElement.innerHTML = `<small class="text-muted">Last updated: ${updatedAt}${updatedBy} (v${content.version})</small>`;
    }
}

// Edit content
window.editContent = function(contentKey) {
    showModal('contentEditModal');

    // Set modal title
    const titles = {
        'about_anume': 'Edit About Anume',
        'privacy_policy': 'Edit Privacy Policy'
    };
    document.getElementById('contentEditModalTitle').textContent = titles[contentKey] || 'Edit Content';

    // Load current content
    loadContentForEdit(contentKey);
};

// Load content for editing
async function loadContentForEdit(contentKey) {
    try {
        const response = await apiCall(`/api/content/${contentKey}`);
        const content = response.data;

        // Populate form
        document.getElementById('contentKey').value = contentKey;
        document.getElementById('contentTitle').value = content.title;
        document.getElementById('contentType').value = content.content_type;
        document.getElementById('contentText').value = content.content;

        // Update character count
        updateCharacterCount();

        // Update content type class
        updateContentTypeClass(content.content_type);

    } catch (error) {
        console.error('Error loading content for edit:', error);
        showAlert(`Failed to load content: ${error.message}`, 'error');
    }
}

// Save content
window.saveContent = async function() {
    try {
        const form = document.getElementById('contentEditForm');
        const formData = new FormData(form);

        const contentKey = formData.get('contentKey');
        const title = formData.get('title').trim();
        const content = formData.get('content').trim();
        const contentType = formData.get('content_type');

        // Validation
        if (!title || !content) {
            showAlert('Title and content are required!', 'error');
            return;
        }

        if (title.length > 255) {
            showAlert('Title must be 255 characters or less!', 'error');
            return;
        }

        if (content.length > 50000) {
            showAlert('Content must be 50,000 characters or less!', 'error');
            return;
        }

        // Show enhanced confirmation dialog
        const contentName = contentKey.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        const confirmMessage = `⚠️ CONTENT UPDATE CONFIRMATION\n\n` +
            `You are about to update "${contentName}" content.\n\n` +
            `This action will:\n` +
            `• Immediately update content in all connected mobile apps\n` +
            `• Clear cached content on user devices\n` +
            `• Cannot be undone\n\n` +
            `Are you sure you want to proceed?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        showAlert('Saving content...', 'info');

        const response = await apiCall(`/api/content/${contentKey}`, {
            method: 'PUT',
            body: JSON.stringify({
                title: title,
                content: content,
                content_type: contentType
            })
        });

        showAlert('Content saved successfully!', 'success');
        closeModal('contentEditModal');

        // Refresh content list
        loadContentManagement();

    } catch (error) {
        console.error('Error saving content:', error);
        showAlert(`Failed to save content: ${error.message}`, 'error');
    }
};

// Preview content
window.previewContent = function() {
    const contentText = document.getElementById('contentText').value;
    const contentType = document.getElementById('contentType').value;
    const previewArea = document.getElementById('contentPreviewArea');

    if (!contentText.trim()) {
        previewArea.innerHTML = '<div class="text-muted">No content to preview...</div>';
        return;
    }

    switch (contentType) {
        case 'html':
            previewArea.innerHTML = contentText;
            previewArea.className = 'content-preview-box html-preview';
            break;
        case 'markdown':
            // Simple markdown preview (basic implementation)
            let htmlContent = contentText
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^\* (.*$)/gim, '<li>$1</li>')
                .replace(/\n/g, '<br>');

            previewArea.innerHTML = htmlContent;
            previewArea.className = 'content-preview-box html-preview';
            break;
        default:
            previewArea.textContent = contentText;
            previewArea.className = 'content-preview-box';
    }
};

// Update character count
function updateCharacterCount() {
    const contentText = document.getElementById('contentText');
    const charCount = document.getElementById('contentCharCount');

    if (contentText && charCount) {
        const count = contentText.value.length;
        charCount.textContent = count.toLocaleString();

        // Change color based on character count
        if (count > 45000) {
            charCount.style.color = 'var(--error-color)';
        } else if (count > 40000) {
            charCount.style.color = 'var(--warning-color)';
        } else {
            charCount.style.color = 'var(--text-muted)';
        }
    }
}

// Update content type class
function updateContentTypeClass(contentType) {
    const form = document.getElementById('contentEditForm');
    if (form) {
        form.className = `content-type-${contentType}`;
    }
}

// Refresh content list
window.refreshContentList = function() {
    loadContentManagement();
};

// Event listeners for content editing
document.addEventListener('DOMContentLoaded', function() {
    // Character count update
    const contentText = document.getElementById('contentText');
    if (contentText) {
        contentText.addEventListener('input', updateCharacterCount);
    }

    // Content type change
    const contentType = document.getElementById('contentType');
    if (contentType) {
        contentType.addEventListener('change', function() {
            updateContentTypeClass(this.value);
        });
    }
});

// Listen for real-time content updates
if (typeof socket !== 'undefined') {
    socket.on('content-updated', function(data) {
        console.log('Content updated:', data);

        // Update preview if we're on the content tab
        if (currentTab === 'content') {
            updateContentPreview(data.key, {
                content: data.content,
                updatedAt: data.updated_at,
                version: data.version,
                updatedBy: { username: 'Admin' } // Simplified for real-time updates
            });
        }

        // Show notification
        showAlert(`Content "${data.key.replace('_', ' ')}" has been updated!`, 'info');
    });
}
