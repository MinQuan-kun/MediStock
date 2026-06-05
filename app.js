// Diagnostic global error handler to show exact error to user
window.onerror = function(message, source, lineno, colno, error) {
    const errorMsg = `Hệ thống phát hiện lỗi: ${message} (Dòng: ${lineno})`;
    console.error(errorMsg, error);
    showToast(errorMsg, "danger");
    return false;
};

// State management
let state = {
    medicines: [],
    imports: [],
    exports: []
};

// Global User State
let currentUser = null;

// Global Chart instance
let quarterlyChart = null;

// Barcode Scanner State
let html5Qrcode = null;
let activeScanTargetId = null; 
let currentScanMode = 'camera'; 
let simulatedScanTimeout = null;

// Mock Accounts
const mockUsers = {
    "admin": { password: "admin123", role: "admin", fullName: "Quản trị viên" },
    "duocsi": { password: "ds123", role: "pharmacist", fullName: "Dược sĩ lâm sàng" }
};

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    try {
        const todayStr = "2026-06-05";
        
        // Set headers date
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateFormatted = new Date(todayStr).toLocaleDateString('vi-VN', options);
        document.getElementById("header-date").textContent = dateFormatted;
        
        // Set default values for date inputs
        document.getElementById("import-date").value = todayStr;
        document.getElementById("export-date").value = todayStr;
        
        // Restore sidebar collapse state
        try {
            const isCollapsed = localStorage.getItem("medistock_sidebar_collapsed");
            if (isCollapsed === "true") {
                const appContainer = document.getElementById("app-main-layout");
                if (appContainer) appContainer.classList.add("sidebar-collapsed");
            }
        } catch (e) {}
        
        // Load state from localStorage (guarded)
        loadState();
        
        // Check Authentication (guarded)
        checkAuth();
        
        // Setup login listener
        setupLoginListener();
        
        // Setup Sidebar Menu Navigation
        setupNavigation();
        
        // Setup Form Listeners
        setupFormListeners();
    } catch (err) {
        console.error("Lỗi khởi tạo ứng dụng:", err);
        showToast("Lỗi khởi tạo ứng dụng: " + err.message, "danger");
    }
});

// Authentication checks
function checkAuth() {
    let savedUser = null;
    try {
        savedUser = sessionStorage.getItem("medistock_user");
    } catch (e) {
        console.warn("SessionStorage access blocked, using in-memory session:", e);
    }
    
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            showMainLayout();
        } catch (e) {
            try { sessionStorage.removeItem("medistock_user"); } catch(err){}
            showLoginLayout();
        }
    } else {
        showLoginLayout();
    }
}

function showLoginLayout() {
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("app-main-layout").classList.add("hidden");
    if (window.lucide) lucide.createIcons();
}

function showMainLayout() {
    try {
        // Toggle layouts
        document.getElementById("login-overlay").classList.add("hidden");
        document.getElementById("app-main-layout").classList.remove("hidden");
        
        // Update user profile card in sidebar
        const nameEl = document.getElementById("user-full-name");
        const roleBadge = document.getElementById("user-role-badge");
        
        if (nameEl && currentUser) nameEl.textContent = currentUser.fullName;
        
        if (roleBadge && currentUser) {
            roleBadge.textContent = currentUser.role === 'admin' ? 'Admin' : 'Dược sĩ';
            if (currentUser.role === 'admin') {
                roleBadge.style.backgroundColor = 'var(--primary)';
            } else {
                roleBadge.style.backgroundColor = 'var(--purple)';
            }
        }

        // Role-based UI visibility
        applyRolePermissions();
        
        // Refresh UI
        switchTab('dashboard');
        refreshUI();
    } catch (err) {
        console.error("Lỗi khi chuyển giao diện:", err);
        showToast("Có lỗi xảy ra khi tải giao diện chính!", "danger");
    }
}

function applyRolePermissions() {
    const dangerCard = document.getElementById("settings-danger-card");
    if (dangerCard && currentUser) {
        if (currentUser.role === 'admin') {
            dangerCard.classList.remove("hidden");
        } else {
            dangerCard.classList.add("hidden");
        }
    }
}

function setupLoginListener() {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;
    
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        try {
            const username = document.getElementById("login-username").value.trim().toLowerCase();
            const password = document.getElementById("login-password").value;
            
            const user = mockUsers[username];
            if (user && user.password === password) {
                currentUser = {
                    username: username,
                    role: user.role,
                    fullName: user.fullName
                };
                
                try {
                    sessionStorage.setItem("medistock_user", JSON.stringify(currentUser));
                } catch (err) {
                    console.warn("Cannot save session to sessionStorage:", err);
                }
                
                loginForm.reset();
                showMainLayout();
                showToast(`Chào mừng ${currentUser.fullName} đã đăng nhập thành công!`, "success");
            } else {
                showToast("Tài khoản hoặc mật khẩu không đúng!", "danger");
            }
        } catch (err) {
            console.error("Lỗi đăng nhập:", err);
            showToast("Lỗi trong quá trình đăng nhập: " + err.message, "danger");
        }
    });
}

function logout() {
    closeScanner();
    currentUser = null;
    try {
        sessionStorage.removeItem("medistock_user");
    } catch (e) {}
    showLoginLayout();
    showToast("Đã đăng xuất khỏi hệ thống.", "info");
}

// Setup sidebar tab navigation
function setupNavigation() {
    const menuItems = document.querySelectorAll(".menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.getAttribute("data-tab");
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    try {
        // Update menu active class
        const menuItems = document.querySelectorAll(".menu-item");
        menuItems.forEach(item => {
            if (item.getAttribute("data-tab") === tabId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Update visible tab content
        const tabs = document.querySelectorAll(".tab-content");
        tabs.forEach(tab => {
            if (tab.id === tabId) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });

        // Update page header title
        const titles = {
            "dashboard": "Tổng quan hệ thống",
            "inventory": "Kho thuốc & Tồn kho",
            "import-tab": "Nhập kho thuốc",
            "export-tab": "Xuất kho / Sử dụng thuốc",
            "reports": "Thống kê báo cáo theo Quý",
            "settings": "Cấu hình & Sao lưu hệ thống"
        };
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) pageTitle.textContent = titles[tabId] || "MediStock";

        // Refresh layout details based on tab
        if (tabId === 'dashboard') {
            renderDashboard();
        } else if (tabId === 'inventory') {
            renderInventoryTable();
        } else if (tabId === 'export-tab') {
            populateExportMedicineSelect();
            renderExportHistory();
        } else if (tabId === 'import-tab') {
            renderImportHistory();
        } else if (tabId === 'reports') {
            generateReportData();
        }
    } catch (err) {
        console.error("Error switching tab:", err);
    }
}

// Local Storage operations (guarded)
function loadState() {
    let savedState = null;
    try {
        savedState = localStorage.getItem("medistock_state");
    } catch (e) {
        console.warn("LocalStorage reading blocked, using in-memory state:", e);
    }
    
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            if (!state.medicines) state.medicines = [];
            if (!state.imports) state.imports = [];
            if (!state.exports) state.exports = [];
        } catch (e) {
            console.error("Error parsing saved state: ", e);
            loadMockDataSilently();
        }
    } else {
        loadMockDataSilently();
    }
}

function saveState() {
    try {
        localStorage.setItem("medistock_state", JSON.stringify(state));
    } catch (e) {
        console.warn("LocalStorage writing blocked, state is in-memory only:", e);
    }
}

// UI Refresh
function refreshUI() {
    if (window.lucide) lucide.createIcons();
    updateHeaderAlertBadge();
    
    const activeTab = document.querySelector(".tab-content.active");
    if (activeTab) {
        if (activeTab.id === "dashboard") renderDashboard();
        else if (activeTab.id === "inventory") renderInventoryTable();
        else if (activeTab.id === "import-tab") renderImportHistory();
        else if (activeTab.id === "export-tab") {
            populateExportMedicineSelect();
            renderExportHistory();
        }
        else if (activeTab.id === "reports") generateReportData();
    }
}

// Update the alert triangle in the top right header
function updateHeaderAlertBadge() {
    const lowStockCount = state.medicines.filter(m => m.pillsCount <= (m.threshold !== undefined ? m.threshold : 100)).length;
    const badge = document.getElementById("quick-alert-badge");
    const countSpan = document.getElementById("quick-alert-count");
    
    if (badge && countSpan) {
        if (lowStockCount > 0) {
            badge.classList.remove("hidden");
            countSpan.textContent = lowStockCount;
        } else {
            badge.classList.add("hidden");
        }
    }
}

// Helper Date functions
function getQuarterFromDate(dateString) {
    if (!dateString) return 1;
    const month = new Date(dateString).getMonth() + 1;
    return Math.ceil(month / 3);
}

function getYearFromDate(dateString) {
    if (!dateString) return 2026;
    return new Date(dateString).getFullYear();
}

// Form Listeners Setup
function setupFormListeners() {
    // Import Form Submit
    const importForm = document.getElementById("import-form");
    if (importForm) {
        importForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const name = document.getElementById("import-med-name").value.trim();
            let medId = document.getElementById("import-med-id").value.trim().toUpperCase();
            const category = document.getElementById("import-med-category").value.trim() || "Chưa phân loại";
            const pillsCount = parseInt(document.getElementById("import-pills-count").value);
            const importDate = document.getElementById("import-date").value;
            const expiry = document.getElementById("import-expiry").value || "";
            const threshold = parseInt(document.getElementById("import-threshold").value) || 100;
            const provider = document.getElementById("import-provider").value.trim() || "Nhà cung cấp tự do";

            if (!medId) {
                medId = "MED" + String(Date.now()).slice(-4);
            }

            // Add to imports history
            const importRecord = {
                id: "IMP" + Date.now(),
                medId,
                medName: name,
                pillsCount,
                date: importDate,
                expiry,
                quarter: getQuarterFromDate(importDate),
                year: getYearFromDate(importDate),
                provider
            };
            state.imports.unshift(importRecord);

            // Check if medicine already exists
            const existingMed = state.medicines.find(m => m.id === medId);
            if (existingMed) {
                existingMed.pillsCount += pillsCount;
                if (document.getElementById("import-threshold").value !== "") {
                    existingMed.threshold = threshold;
                }
            } else {
                state.medicines.push({
                    id: medId,
                    name,
                    category,
                    pillsCount,
                    threshold,
                    provider
                });
            }

            saveState();
            importForm.reset();
            document.getElementById("import-date").value = "2026-06-05";
            
            showToast(`Đã nhập kho thành công ${pillsCount} viên thuốc ${name}!`, "success");
            refreshUI();
            renderImportHistory();
        });
    }

    // Export Form Submit
    const exportForm = document.getElementById("export-form");
    if (exportForm) {
        exportForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const medId = document.getElementById("export-med-select").value;
            const pillsCount = parseInt(document.getElementById("export-pills-count").value);
            const exportDate = document.getElementById("export-date").value;
            const note = document.getElementById("export-note").value.trim() || "Xuất sử dụng";

            if (!medId) {
                showToast("Vui lòng chọn loại thuốc cần xuất!", "warning");
                return;
            }

            const med = state.medicines.find(m => m.id === medId);
            if (!med) {
                showToast("Không tìm thấy thông tin thuốc trong kho!", "danger");
                return;
            }

            if (med.pillsCount < pillsCount) {
                showToast(`Lỗi! Số lượng tồn kho không đủ (Hiện có ${med.pillsCount} viên, cần xuất ${pillsCount} viên).`, "danger");
                return;
            }

            // Subtract from stock
            med.pillsCount -= pillsCount;

            // Record export
            const exportRecord = {
                id: "EXP" + Date.now(),
                medId,
                medName: med.name,
                pillsCount,
                date: exportDate,
                note,
                quarter: getQuarterFromDate(exportDate),
                year: getYearFromDate(exportDate)
            };
            state.exports.unshift(exportRecord);

            saveState();
            exportForm.reset();
            
            document.getElementById("export-date").value = "2026-06-05";
            document.getElementById("export-stock-preview").classList.add("hidden");
            
            showToast(`Đã xuất kho thành công ${pillsCount} viên thuốc ${med.name}!`, "success");
            refreshUI();
            populateExportMedicineSelect();
            renderExportHistory();
        });
    }

    // Search and Filter Listeners on Inventory
    const searchInv = document.getElementById("search-inventory");
    if (searchInv) searchInv.addEventListener("input", renderInventoryTable);
    
    const filterStat = document.getElementById("filter-status");
    if (filterStat) filterStat.addEventListener("change", renderInventoryTable);

    // Edit Threshold Form Submit
    const editThresholdForm = document.getElementById("edit-threshold-form");
    if (editThresholdForm) {
        editThresholdForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const medId = document.getElementById("edit-threshold-med-id").value;
            const newValue = parseInt(document.getElementById("edit-threshold-value").value);
            
            const med = state.medicines.find(m => m.id === medId);
            if (med) {
                med.threshold = newValue;
                saveState();
                closeThresholdModal();
                showToast(`Cập nhật ngưỡng cảnh báo của ${med.name} thành ${newValue} viên thành công!`, "success");
                refreshUI();
            }
        });
    }

    // Chart Year Selector
    const chartFilter = document.getElementById("chart-year-filter");
    if (chartFilter) {
        chartFilter.addEventListener("change", (e) => {
            renderQuarterlyChart(e.target.value);
        });
    }
}

// Populate Export Medicine select option dropdown
function populateExportMedicineSelect() {
    const select = document.getElementById("export-med-select");
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Chọn thuốc cần xuất --</option>';
    
    state.medicines.forEach(med => {
        const warningSuffix = med.pillsCount <= (med.threshold || 100) ? ' [⚠️ SẮP HẾT]' : '';
        const option = document.createElement("option");
        option.value = med.id;
        option.textContent = `${med.name} (${med.id}) - Tồn: ${med.pillsCount} viên${warningSuffix}`;
        select.appendChild(option);
    });

    if (currentValue && state.medicines.some(m => m.id === currentValue)) {
        select.value = currentValue;
    }

    select.onchange = () => {
        const preview = document.getElementById("export-stock-preview");
        const valSpan = document.getElementById("preview-stock-pills");
        
        if (preview && valSpan) {
            if (select.value) {
                const med = state.medicines.find(m => m.id === select.value);
                if (med) {
                    preview.classList.remove("hidden");
                    valSpan.textContent = med.pillsCount;
                    if (med.pillsCount <= (med.threshold || 100)) {
                        preview.style.borderColor = 'var(--danger-border)';
                        preview.style.backgroundColor = 'var(--danger-light)';
                        preview.style.color = 'var(--danger)';
                    } else {
                        preview.style.borderColor = 'var(--border-color)';
                        preview.style.backgroundColor = 'var(--primary-light)';
                        preview.style.color = 'var(--primary-hover)';
                    }
                }
            } else {
                preview.classList.add("hidden");
            }
        }
    };
}

// RENDER: DASHBOARD
function renderDashboard() {
    try {
        const totalMedicines = state.medicines.length;
        const totalPills = state.medicines.reduce((sum, m) => sum + m.pillsCount, 0);
        const lowStockCount = state.medicines.filter(m => m.pillsCount <= (m.threshold || 100)).length;
        
        const currentYear = 2026;
        const currentQuarter = 2;
        
        const currentQuarterLabel = document.getElementById("current-quarter-label");
        if (currentQuarterLabel) currentQuarterLabel.textContent = `Nhập trong Quý ${currentQuarter}/${currentYear}`;
        
        const quarterImports = state.imports
            .filter(imp => imp.year === currentYear && imp.quarter === currentQuarter)
            .reduce((sum, imp) => sum + imp.pillsCount, 0);
            
        const totalMedsEl = document.getElementById("total-medicines-count");
        if (totalMedsEl) totalMedsEl.textContent = totalMedicines;
        
        const totalPillsEl = document.getElementById("total-pills-count");
        if (totalPillsEl) totalPillsEl.textContent = totalPills.toLocaleString('vi-VN');
        
        const lowStockEl = document.getElementById("low-stock-count");
        if (lowStockEl) lowStockEl.textContent = lowStockCount;
        
        const quarterImpEl = document.getElementById("quarter-import-count");
        if (quarterImpEl) quarterImpEl.textContent = quarterImports.toLocaleString('vi-VN');

        // Populate Top Low Stock list
        const lowStockList = document.getElementById("dashboard-low-stock-list");
        if (lowStockList) {
            lowStockList.innerHTML = '';
            const lowStockItems = state.medicines.filter(m => m.pillsCount <= (m.threshold || 100));
            
            if (lowStockItems.length === 0) {
                lowStockList.innerHTML = `
                    <div class="empty-state">
                        <i data-lucide="check-circle" class="txt-success"></i>
                        <p>Kho thuốc an toàn. Không có thuốc sắp hết.</p>
                    </div>
                `;
            } else {
                lowStockItems.sort((a, b) => a.pillsCount - b.pillsCount);
                lowStockItems.forEach(item => {
                    const div = document.createElement("div");
                    div.className = "low-stock-item";
                    div.innerHTML = `
                        <div class="low-stock-meta">
                            <h4>${item.name}</h4>
                            <p>Mã: ${item.id} | Nhóm: ${item.category}</p>
                        </div>
                        <div class="low-stock-val">
                            <div class="low-stock-pills-lbl">${item.pillsCount} <span>viên</span></div>
                            <span class="stat-desc">Ngưỡng: ${item.threshold || 100}v</span>
                        </div>
                    `;
                    lowStockList.appendChild(div);
                });
            }
        }
        
        populateChartYearDropdown();
        
        const chartFilter = document.getElementById("chart-year-filter");
        const selectedYear = (chartFilter && chartFilter.value) || "2026";
        
        // Render Chart safely (wrap in try-catch in case Chart library fails)
        try {
            renderQuarterlyChart(selectedYear);
        } catch (chartErr) {
            console.error("Chart.js failed to render:", chartErr);
        }
        
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error("Error rendering dashboard:", err);
    }
}

function populateChartYearDropdown() {
    const dropdown = document.getElementById("chart-year-filter");
    if (!dropdown) return;
    
    const years = new Set([2026]);
    state.imports.forEach(i => years.add(i.year));
    state.exports.forEach(e => years.add(e.year));
    
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const currentVal = dropdown.value;
    
    dropdown.innerHTML = '';
    sortedYears.forEach(yr => {
        const opt = document.createElement("option");
        opt.value = yr;
        opt.textContent = `Năm ${yr}`;
        dropdown.appendChild(opt);
    });
    
    if (currentVal && sortedYears.includes(parseInt(currentVal))) {
        dropdown.value = currentVal;
    } else {
        dropdown.value = sortedYears[0];
    }
}

// Render the bar chart using Chart.js
function renderQuarterlyChart(year) {
    if (!window.Chart) {
        console.warn("Chart.js not loaded. Skipping chart rendering.");
        return;
    }
    
    const yrNum = parseInt(year);
    const quarterlyImportData = [0, 0, 0, 0];
    state.imports.forEach(imp => {
        if (imp.year === yrNum) {
            quarterlyImportData[imp.quarter - 1] += imp.pillsCount;
        }
    });

    const quarterlyExportData = [0, 0, 0, 0];
    state.exports.forEach(exp => {
        if (exp.year === yrNum) {
            quarterlyExportData[exp.quarter - 1] += exp.pillsCount;
        }
    });

    const chartCanvas = document.getElementById("quarterlyChart");
    if (!chartCanvas) return;
    
    const ctx = chartCanvas.getContext("2d");
    
    if (quarterlyChart) {
        quarterlyChart.destroy();
    }
    
    const importGradient = ctx.createLinearGradient(0, 0, 0, 300);
    importGradient.addColorStop(0, 'rgba(16, 185, 129, 0.85)');
    importGradient.addColorStop(1, 'rgba(16, 185, 129, 0.15)');

    const exportGradient = ctx.createLinearGradient(0, 0, 0, 300);
    exportGradient.addColorStop(0, 'rgba(139, 92, 246, 0.85)');
    exportGradient.addColorStop(1, 'rgba(139, 92, 246, 0.15)');

    quarterlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Quý 1 (T1-T3)', 'Quý 2 (T4-T6)', 'Quý 3 (T7-T9)', 'Quý 4 (T10-T12)'],
            datasets: [
                {
                    label: 'Số viên nhập kho',
                    data: quarterlyImportData,
                    backgroundColor: importGradient,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                },
                {
                    label: 'Số viên xuất kho',
                    data: quarterlyExportData,
                    backgroundColor: exportGradient,
                    borderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#475569',
                        font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#0f172a',
                    bodyColor: '#475569',
                    borderColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 1,
                    titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0, 0, 0, 0.03)' },
                    ticks: {
                        color: '#475569',
                        font: { family: 'Plus Jakarta Sans', size: 12 }
                    }
                },
                y: {
                    grid: { color: 'rgba(0, 0, 0, 0.03)' },
                    ticks: {
                        color: '#475569',
                        font: { family: 'Plus Jakarta Sans', size: 12 },
                        callback: function(value) { return value.toLocaleString('vi-VN'); }
                    }
                }
            }
        }
    });
}

// RENDER: INVENTORY TABLE
function renderInventoryTable() {
    const searchVal = document.getElementById("search-inventory").value.trim().toLowerCase();
    const filterStatus = document.getElementById("filter-status").value;
    const tableBody = document.getElementById("inventory-table-body");
    const emptyState = document.getElementById("inventory-empty-state");
    
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    let filteredMeds = state.medicines.filter(med => {
        const matchSearch = med.name.toLowerCase().includes(searchVal) || med.id.toLowerCase().includes(searchVal) || med.category.toLowerCase().includes(searchVal);
        const threshold = med.threshold || 100;
        const isLow = med.pillsCount <= threshold;
        
        let matchStatus = true;
        if (filterStatus === 'low') matchStatus = isLow;
        else if (filterStatus === 'normal') matchStatus = !isLow;
        
        return matchSearch && matchStatus;
    });

    if (filteredMeds.length === 0) {
        if (emptyState) emptyState.classList.remove("hidden");
    } else {
        if (emptyState) emptyState.classList.add("hidden");
        
        filteredMeds.forEach(med => {
            const threshold = med.threshold || 100;
            const isLow = med.pillsCount <= threshold;
            const rowClass = isLow ? 'row-danger-alert' : '';
            
            const isPharmacist = currentUser && currentUser.role === 'pharmacist';
            const actionButtons = `
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button class="btn btn-secondary btn-sm" onclick="quickImportRedirect('${med.id}')" title="Nhập thêm">
                        <i data-lucide="arrow-down-to-line" style="width: 14px; height: 14px;"></i> Nhập
                    </button>
                    ${!isPharmacist ? `
                    <button class="btn btn-danger-action btn-sm" onclick="deleteMedicine('${med.id}', '${med.name}')" title="Xóa">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Xóa
                    </button>` : ''}
                </div>
            `;

            const tr = document.createElement("tr");
            tr.className = rowClass;
            tr.innerHTML = `
                <td><strong>${med.id}</strong></td>
                <td><span class="med-name">${med.name}</span></td>
                <td><span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">${med.category}</span></td>
                <td class="txt-right"><strong>${med.pillsCount.toLocaleString('vi-VN')}</strong></td>
                <td>
                    <span class="threshold-label">${threshold}v</span>
                    <button class="btn btn-text btn-sm" onclick="openThresholdModal('${med.id}', '${med.name}', ${threshold})" title="Sửa ngưỡng">
                        <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i>
                    </button>
                </td>
                <td>
                    ${isLow ? 
                        `<span class="badge badge-danger"><i data-lucide="alert-triangle"></i> Sắp Hết (≤ ${threshold}v)</span>` : 
                        `<span class="badge badge-success"><i data-lucide="check"></i> An toàn</span>`
                    }
                </td>
                <td class="txt-center">${actionButtons}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    document.querySelectorAll(".alert-threshold-lbl").forEach(el => el.textContent = '100');
    if (window.lucide) lucide.createIcons();
}

function quickImportRedirect(medId) {
    const med = state.medicines.find(m => m.id === medId);
    if (med) {
        switchTab('import-tab');
        document.getElementById("import-med-name").value = med.name;
        document.getElementById("import-med-id").value = med.id;
        document.getElementById("import-med-category").value = med.category;
        document.getElementById("import-threshold").value = med.threshold || 100;
        document.getElementById("import-provider").value = med.provider || "";
    }
}

// Threshold Modal Functions
function openThresholdModal(id, name, currentVal) {
    document.getElementById("edit-threshold-med-id").value = id;
    document.getElementById("edit-threshold-med-name").value = name;
    document.getElementById("edit-threshold-value").value = currentVal;
    
    document.getElementById("threshold-modal").classList.remove("hidden");
}

function closeThresholdModal() {
    document.getElementById("threshold-modal").classList.add("hidden");
}

async function deleteMedicine(id, name) {
    if (currentUser.role !== 'admin') {
        showToast("Bạn không có quyền thực hiện thao tác xóa!", "warning");
        return;
    }
    const confirmed = await showConfirm(`Bạn có chắc chắn muốn xóa thuốc "${name}" (${id}) khỏi hệ thống? \nHành động này cũng sẽ xóa thuốc khỏi danh sách tồn kho (lịch sử nhập xuất vẫn giữ nguyên).`);
    if (confirmed) {
        state.medicines = state.medicines.filter(m => m.id !== id);
        saveState();
        showToast(`Đã xóa thuốc ${name} thành công!`, "success");
        refreshUI();
    }
}

// RENDER: IMPORT HISTORY
function renderImportHistory() {
    const body = document.getElementById("import-history-body");
    if (!body) return;
    body.innerHTML = '';
    
    const recentImports = state.imports.slice(0, 10);
    const isPharmacist = currentUser && currentUser.role === 'pharmacist';
    
    if (recentImports.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="5" class="txt-center text-muted" style="padding: 24px;">Chưa có lịch sử nhập kho.</td>
            </tr>
        `;
    } else {
        recentImports.forEach(imp => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${formatDate(imp.date)}</td>
                <td><strong>${imp.medName}</strong><br><small>${imp.medId}</small></td>
                <td class="txt-right">${imp.pillsCount.toLocaleString('vi-VN')}</td>
                <td>Quý ${imp.quarter}/${imp.year}</td>
                <td class="txt-center">
                    ${!isPharmacist ? `
                    <button class="btn btn-text btn-sm txt-danger" onclick="deleteImportRecord('${imp.id}')" title="Xóa lịch sử">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>` : '<span class="text-muted" style="font-size: 11px;">Không có quyền</span>'}
                </td>
            `;
            body.appendChild(tr);
        });
    }
    if (window.lucide) lucide.createIcons();
}

async function deleteImportRecord(id) {
    if (currentUser.role !== 'admin') {
        showToast("Bạn không có quyền xóa chứng từ!", "warning");
        return;
    }
    const recordIndex = state.imports.findIndex(i => i.id === id);
    if (recordIndex > -1) {
        const record = state.imports[recordIndex];
        const confirmed = await showConfirm(`Bạn muốn hủy phiếu nhập kho này? \nSố lượng ${record.pillsCount} viên của thuốc "${record.medName}" sẽ bị trừ khỏi tồn kho.`);
        if (confirmed) {
            const med = state.medicines.find(m => m.id === record.medId);
            if (med) {
                med.pillsCount = Math.max(0, med.pillsCount - record.pillsCount);
            }
            
            state.imports.splice(recordIndex, 1);
            saveState();
            showToast("Đã hủy phiếu nhập kho thành công!", "success");
            refreshUI();
            renderImportHistory();
        }
    }
}

// RENDER: EXPORT HISTORY
function renderExportHistory() {
    const body = document.getElementById("export-history-body");
    if (!body) return;
    body.innerHTML = '';
    
    const recentExports = state.exports.slice(0, 10);
    const isPharmacist = currentUser && currentUser.role === 'pharmacist';
    
    if (recentExports.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="5" class="txt-center text-muted" style="padding: 24px;">Chưa có lịch sử xuất kho.</td>
            </tr>
        `;
    } else {
        recentExports.forEach(exp => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${formatDate(exp.date)}</td>
                <td><strong>${exp.medName}</strong><br><small>${exp.medId}</small></td>
                <td class="txt-right">${exp.pillsCount.toLocaleString('vi-VN')}</td>
                <td>${exp.note}</td>
                <td class="txt-center">
                    ${!isPharmacist ? `
                    <button class="btn btn-text btn-sm txt-danger" onclick="deleteExportRecord('${exp.id}')" title="Xóa lịch sử">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>` : '<span class="text-muted" style="font-size: 11px;">Không có quyền</span>'}
                </td>
            `;
            body.appendChild(tr);
        });
    }
    if (window.lucide) lucide.createIcons();
}

async function deleteExportRecord(id) {
    if (currentUser.role !== 'admin') {
        showToast("Bạn không có quyền xóa chứng từ!", "warning");
        return;
    }
    const recordIndex = state.exports.findIndex(e => e.id === id);
    if (recordIndex > -1) {
        const record = state.exports[recordIndex];
        const confirmed = await showConfirm(`Bạn muốn hủy phiếu xuất kho này? \nSố lượng ${record.pillsCount} viên của thuốc "${record.medName}" sẽ được cộng trả lại tồn kho.`);
        if (confirmed) {
            const med = state.medicines.find(m => m.id === record.medId);
            if (med) {
                med.pillsCount += record.pillsCount;
            }
            
            state.exports.splice(recordIndex, 1);
            saveState();
            showToast("Đã hoàn trả số viên thuốc vào kho thành công!", "success");
            refreshUI();
            populateExportMedicineSelect();
            renderExportHistory();
        }
    }
}

// RENDER: REPORTS BY QUARTER
function generateReportData() {
    const yearSelect = document.getElementById("report-year");
    const quarterSelect = document.getElementById("report-quarter");
    if (!yearSelect || !quarterSelect) return;
    
    const year = parseInt(yearSelect.value);
    const quarter = quarterSelect.value;
    
    const importBody = document.getElementById("report-import-body");
    const exportBody = document.getElementById("report-export-body");
    
    const importEmpty = document.getElementById("report-import-empty");
    const exportEmpty = document.getElementById("report-export-empty");
    
    if (!importBody || !exportBody) return;
    importBody.innerHTML = '';
    exportBody.innerHTML = '';
    
    const timeText = quarter === 'all' ? `Cả Năm ${year}` : `Quý ${quarter}/${year}`;
    const repImpTitle = document.getElementById("report-title-imports");
    const repExpTitle = document.getElementById("report-title-exports");
    
    if (repImpTitle) repImpTitle.textContent = `Tổng hợp Nhập Kho (${timeText})`;
    if (repExpTitle) repExpTitle.textContent = `Tổng hợp Xuất Kho (${timeText})`;
    
    const importSummary = {};
    const exportSummary = {};
    
    state.imports.forEach(imp => {
        if (imp.year === year && (quarter === 'all' || imp.quarter === parseInt(quarter))) {
            const key = imp.medId;
            if (!importSummary[key]) {
                importSummary[key] = { medId: imp.medId, medName: imp.medName, quarters: new Set(), times: 0, totalPills: 0 };
            }
            importSummary[key].quarters.add(imp.quarter);
            importSummary[key].times += 1;
            importSummary[key].totalPills += imp.pillsCount;
        }
    });

    state.exports.forEach(exp => {
        if (exp.year === year && (quarter === 'all' || exp.quarter === parseInt(quarter))) {
            const key = exp.medId;
            if (!exportSummary[key]) {
                exportSummary[key] = { medId: exp.medId, medName: exp.medName, quarters: new Set(), times: 0, totalPills: 0 };
            }
            exportSummary[key].quarters.add(exp.quarter);
            exportSummary[key].times += 1;
            exportSummary[key].totalPills += exp.pillsCount;
        }
    });

    // Display Imports
    const importItems = Object.values(importSummary);
    if (importItems.length === 0) {
        if (importEmpty) importEmpty.classList.remove("hidden");
    } else {
        if (importEmpty) importEmpty.classList.add("hidden");
        importItems.forEach(item => {
            const tr = document.createElement("tr");
            const qList = Array.from(item.quarters).sort().map(q => `Q${q}`).join(', ');
            tr.innerHTML = `
                <td><strong>${item.medId}</strong></td>
                <td>${item.medName}</td>
                <td>${qList}</td>
                <td class="txt-right">${item.times}</td>
                <td class="txt-right"><strong>${item.totalPills.toLocaleString('vi-VN')}</strong></td>
            `;
            importBody.appendChild(tr);
        });
    }

    // Display Exports
    const exportItems = Object.values(exportSummary);
    if (exportItems.length === 0) {
        if (exportEmpty) exportEmpty.classList.remove("hidden");
    } else {
        if (exportEmpty) exportEmpty.classList.add("hidden");
        exportItems.forEach(item => {
            const tr = document.createElement("tr");
            const qList = Array.from(item.quarters).sort().map(q => `Q${q}`).join(', ');
            tr.innerHTML = `
                <td><strong>${item.medId}</strong></td>
                <td>${item.medName}</td>
                <td>${qList}</td>
                <td class="txt-right">${item.times}</td>
                <td class="txt-right"><strong>${item.totalPills.toLocaleString('vi-VN')}</strong></td>
            `;
            exportBody.appendChild(tr);
        });
    }
    
    if (window.lucide) lucide.createIcons();
}

// CSV Export
function exportInventoryToCSV() {
    if (state.medicines.length === 0) {
        showToast("Không có dữ liệu thuốc để xuất file Excel/CSV!", "warning");
        return;
    }
    
    let csvContent = "\uFEFF";
    csvContent += "Mã Thuốc,Tên Thuốc,Nhóm Thuốc,Tồn Kho (Viên),Ngưỡng Cảnh Báo,Trạng Thái,Nhà Cung Cấp\n";
    
    state.medicines.forEach(m => {
        const threshold = m.threshold || 100;
        const status = m.pillsCount <= threshold ? "CẢNH BÁO SẮP HẾT" : "An Toàn";
        const row = [
            `"${m.id}"`, `"${m.name}"`, `"${m.category}"`, m.pillsCount, threshold, `"${status}"`, `"${m.provider || ''}"`
        ].join(",");
        csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MediStock_TonKho_2026-06-05.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Đã xuất file báo cáo kho Excel/CSV thành công!", "success");
}

// backup data to local JSON
function backupData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MediStock_Backup_2026-06-05.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Đã xuất file cấu hình backup (.json) thành công!", "success");
}

// Restore data from JSON backup
function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState.medicines && importedState.imports && importedState.exports) {
                state = importedState;
                saveState();
                showToast("Khôi phục toàn bộ dữ liệu kho thuốc thành công!", "success");
                refreshUI();
                document.getElementById("import-backup-file").value = "";
            } else {
                showToast("File cấu hình không hợp lệ hoặc sai cấu trúc!", "danger");
            }
        } catch (err) {
            showToast("Không thể đọc file cấu hình JSON này!", "danger");
        }
    };
    reader.readAsText(file);
}

// Load Mock data
async function loadMockData() {
    const confirmed = await showConfirm("Hành động này sẽ tải trước bộ dữ liệu demo (bao gồm danh sách thuốc, lịch sử xuất/nhập kho 2026). Dữ liệu hiện tại sẽ bị ghi đè! Bạn có đồng ý?");
    if (confirmed) {
        loadMockDataSilently();
        showToast("Đã tải dữ liệu thử nghiệm thành công!", "success");
        refreshUI();
    }
}

function loadMockDataSilently() {
    state.medicines = [
        { id: "MED001", name: "Paracetamol 500mg", category: "Giảm đau - Hạ sốt", pillsCount: 80, threshold: 100, provider: "Dược Hậu Giang (DHG)" },
        { id: "MED002", name: "Amoxicillin 500mg", category: "Kháng sinh", pillsCount: 750, threshold: 100, provider: "Pharmedic" },
        { id: "MED003", name: "Vitamin C 1000mg", category: "Bổ sung đề kháng", pillsCount: 50, threshold: 120, provider: "Dược Phẩm OPC" },
        { id: "MED004", name: "Panadol Extra", category: "Giảm đau", pillsCount: 1250, threshold: 200, provider: "GlaxoSmithKline (GSK)" },
        { id: "MED005", name: "Decolgen Forte", category: "Trị cảm cúm", pillsCount: 40, threshold: 100, provider: "Dược Phẩm Traphaco" },
        { id: "MED006", name: "Ibuprofen 400mg", category: "Kháng viêm - Giảm đau", pillsCount: 400, threshold: 100, provider: "Pharmedic" }
    ];

    state.imports = [
        { id: "IMP1", medId: "MED001", medName: "Paracetamol 500mg", pillsCount: 1500, date: "2026-02-15", expiry: "2029-02-15", quarter: 1, year: 2026, provider: "Dược Hậu Giang (DHG)" },
        { id: "IMP2", medId: "MED003", medName: "Vitamin C 1000mg", pillsCount: 500, date: "2026-01-20", expiry: "2028-01-20", quarter: 1, year: 2026, provider: "Dược Phẩm OPC" },
        { id: "IMP3", medId: "MED005", medName: "Decolgen Forte", pillsCount: 800, date: "2026-03-05", expiry: "2028-09-05", quarter: 1, year: 2026, provider: "Dược Phẩm Traphaco" },
        { id: "IMP4", medId: "MED002", medName: "Amoxicillin 500mg", pillsCount: 1000, date: "2026-04-10", expiry: "2028-04-10", quarter: 2, year: 2026, provider: "Pharmedic" },
        { id: "IMP5", medId: "MED004", medName: "Panadol Extra", pillsCount: 1500, date: "2026-05-18", expiry: "2029-05-18", quarter: 2, year: 2026, provider: "GlaxoSmithKline (GSK)" },
        { id: "IMP6", medId: "MED006", medName: "Ibuprofen 400mg", pillsCount: 400, date: "2026-05-02", expiry: "2028-05-02", quarter: 2, year: 2026, provider: "Pharmedic" },
        { id: "IMP7", medId: "MED001", medName: "Paracetamol 500mg", pillsCount: 500, date: "2026-05-25", expiry: "2029-02-15", quarter: 2, year: 2026, provider: "Dược Hậu Giang (DHG)" }
    ];

    state.exports = [
        { id: "EXP1", medId: "MED001", medName: "Paracetamol 500mg", pillsCount: 1200, date: "2026-03-10", note: "Cấp phát tủ thuốc công ty Q1", quarter: 1, year: 2026 },
        { id: "EXP2", medId: "MED003", medName: "Vitamin C 1000mg", pillsCount: 200, date: "2026-02-28", note: "Xuất bán lẻ khách hàng", quarter: 1, year: 2026 },
        { id: "EXP3", medId: "MED005", medName: "Decolgen Forte", pillsCount: 500, date: "2026-03-20", note: "Xuất bán sỉ phòng khám", quarter: 1, year: 2026 },
        { id: "EXP4", medId: "MED001", medName: "Paracetamol 500mg", pillsCount: 720, date: "2026-06-01", note: "Cấp thuốc khám từ thiện", quarter: 2, year: 2026 },
        { id: "EXP5", medId: "MED002", medName: "Amoxicillin 500mg", pillsCount: 250, date: "2026-05-12", note: "Bán đơn thuốc ngoại trú", quarter: 2, year: 2026 },
        { id: "EXP6", medId: "MED003", medName: "Vitamin C 1000mg", pillsCount: 250, date: "2026-05-30", note: "Xuất hủy hết hạn sử dụng", quarter: 2, year: 2026 },
        { id: "EXP7", medId: "MED004", medName: "Panadol Extra", pillsCount: 250, date: "2026-06-02", note: "Cấp phát định kỳ", quarter: 2, year: 2026 },
        { id: "EXP8", medId: "MED005", medName: "Decolgen Forte", pillsCount: 260, date: "2026-06-04", note: "Bán lẻ", quarter: 2, year: 2026 }
    ];

    saveState();
}

// Reset all app data
async function resetAllData() {
    if (currentUser.role !== 'admin') {
        showToast("Chỉ tài khoản Admin mới có quyền xóa toàn bộ hệ thống!", "warning");
        return;
    }
    const confirmed = await showConfirm("CẢNH BÁO NGUY HIỂM! Bạn chắc chắn muốn xóa toàn bộ dữ liệu tồn kho và lịch sử nhập xuất của phần mềm? Dữ liệu sẽ mất vĩnh viễn!");
    if (confirmed) {
        state = { medicines: [], imports: [], exports: [] };
        saveState();
        showToast("Đã xóa sạch toàn bộ cơ sở dữ liệu kho thuốc!", "danger");
        refreshUI();
    }
}

// Helper formatting
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Toast Notifications System
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconName = "info";
    if (type === "success") iconName = "check-circle";
    else if (type === "danger") iconName = "alert-circle";
    else if (type === "warning") iconName = "alert-triangle";
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div>${message}</div>
    `;
    
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();
    
    setTimeout(() => { toast.classList.add("show"); }, 10);
    
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => { toast.remove(); }, 300);
    }, 4000);
}

// ================= BARCODE SCANNER LOGIC =================

function openScanner(targetInputId) {
    activeScanTargetId = targetInputId;
    const modal = document.getElementById("scanner-modal");
    if (modal) modal.classList.remove("hidden");
    
    setScanMode('simulated');
}

function closeScanner() {
    if (simulatedScanTimeout) {
        clearTimeout(simulatedScanTimeout);
        simulatedScanTimeout = null;
    }
    
    stopCamera();
    
    const modal = document.getElementById("scanner-modal");
    if (modal) modal.classList.add("hidden");
}

function setScanMode(mode) {
    currentScanMode = mode;
    const btnToggle = document.getElementById("btn-toggle-scan-mode");
    const btnTrigger = document.getElementById("btn-trigger-simulation");
    const simulatedOverlay = document.getElementById("scanner-simulated-overlay");
    const cameraReader = document.getElementById("scanner-reader");
    
    if (mode === 'simulated') {
        stopCamera();
        if (btnToggle) btnToggle.innerHTML = '<i data-lucide="camera"></i> Chuyển sang Camera Thật';
        if (btnTrigger) btnTrigger.classList.remove("hidden");
        if (simulatedOverlay) simulatedOverlay.classList.remove("hidden");
        if (cameraReader) cameraReader.classList.add("hidden");
    } else {
        if (btnToggle) btnToggle.innerHTML = '<i data-lucide="refresh-cw"></i> Chuyển sang Giả lập Quét';
        if (btnTrigger) btnTrigger.classList.add("hidden");
        if (simulatedOverlay) simulatedOverlay.classList.add("hidden");
        if (cameraReader) cameraReader.classList.remove("hidden");
        startCamera();
    }
    if (window.lucide) lucide.createIcons();
}

function toggleScanMode() {
    if (currentScanMode === 'camera') {
        setScanMode('simulated');
    } else {
        setScanMode('camera');
    }
}

function startCamera() {
    if (!window.Html5Qrcode) {
        showToast("Không tìm thấy thư viện quét mã vạch. Chuyển sang giả lập.", "warning");
        setScanMode('simulated');
        return;
    }
    
    if (!html5Qrcode) {
        html5Qrcode = new Html5Qrcode("scanner-reader");
    }
    
    const config = { fps: 10, qrbox: { width: 250, height: 150 } };
    
    html5Qrcode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
    ).catch(err => {
        console.warn("Camera start error:", err);
        showToast("Không mở được camera thật. Hệ thống chuyển sang chế độ giả lập.", "warning");
        setScanMode('simulated');
    });
}

function stopCamera() {
    if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().then(() => {
            console.log("Camera stopped successfully");
        }).catch(err => {
            console.error("Error stopping camera:", err);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    processScannedCode(decodedText);
}

function onScanFailure(error) {}

function triggerSimulatedScan() {
    const laser = document.querySelector(".laser-scanner-line");
    if (laser) laser.style.animationPlayState = "running";
    
    const simulatedOverlay = document.getElementById("scanner-simulated-overlay");
    if (simulatedOverlay) {
        const simFeedTxt = simulatedOverlay.querySelector(".simulated-feed-txt");
        if (simFeedTxt) {
            simFeedTxt.innerHTML = "Đang nhận dạng mã vạch... <span class='pulse-animation'>🔴</span>";
            simFeedTxt.style.color = "#34d399";
        }
    }
    
    const btnSim = document.getElementById("btn-trigger-simulation");
    const btnToggle = document.getElementById("btn-toggle-scan-mode");
    if (btnSim) btnSim.setAttribute("disabled", "true");
    if (btnToggle) btnToggle.setAttribute("disabled", "true");
    
    simulatedScanTimeout = setTimeout(() => {
        let mockCodes = ["MED001", "MED002", "MED003", "MED004", "MED005"];
        if (state.medicines.length > 0) {
            mockCodes = state.medicines.map(m => m.id);
        }
        
        const randomCode = mockCodes[Math.floor(Math.random() * mockCodes.length)];
        
        if (btnSim) btnSim.removeAttribute("disabled");
        if (btnToggle) btnToggle.removeAttribute("disabled");
        
        if (simulatedOverlay) {
            const simFeedTxt = simulatedOverlay.querySelector(".simulated-feed-txt");
            if (simFeedTxt) {
                simFeedTxt.textContent = "Đang giả lập kết nối camera...";
                simFeedTxt.style.color = "rgba(255,255,255,0.5)";
            }
        }
        
        processScannedCode(randomCode);
    }, 1500);
}

function processScannedCode(code) {
    closeScanner();
    
    if (activeScanTargetId === 'import-med-id') {
        const input = document.getElementById("import-med-id");
        if (input) {
            input.value = code;
            const med = state.medicines.find(m => m.id === code);
            if (med) {
                document.getElementById("import-med-name").value = med.name;
                document.getElementById("import-med-category").value = med.category;
                document.getElementById("import-threshold").value = med.threshold || 100;
                document.getElementById("import-provider").value = med.provider || "";
                showToast(`Đã nhận dạng mã thuốc: ${code}. Hệ thống tự điền thông tin thuốc ${med.name}.`, "success");
            } else {
                showToast(`Đã quét mã mới: ${code}. Nhập tên thuốc để thêm mới vào kho.`, "info");
            }
        }
        
    } else if (activeScanTargetId === 'export-med-select') {
        const select = document.getElementById("export-med-select");
        if (select) {
            let optionFound = false;
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === code) {
                    select.selectedIndex = i;
                    optionFound = true;
                    break;
                }
            }
            
            if (optionFound) {
                select.onchange(); 
                showToast(`Đã quét mã vạch: ${code}. Đã chọn thuốc ${select.options[select.selectedIndex].text}`, "success");
            } else {
                showToast(`Không tìm thấy thuốc có mã "${code}" trong tồn kho!`, "danger");
            }
        }
    }
}

// Toggle Sidebar Collapse State
function toggleSidebarCollapse() {
    const appContainer = document.getElementById("app-main-layout");
    if (appContainer) {
        appContainer.classList.toggle("sidebar-collapsed");
        const isCollapsed = appContainer.classList.contains("sidebar-collapsed");
        try {
            localStorage.setItem("medistock_sidebar_collapsed", isCollapsed ? "true" : "false");
        } catch (e) {}
    }
}

// Promise-based Custom Confirmation Modal helper
function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const msgEl = document.getElementById("confirm-modal-message");
        const btnOk = document.getElementById("confirm-modal-ok");
        const btnCancel = document.getElementById("confirm-modal-cancel");
        
        if (modal && msgEl && btnOk && btnCancel) {
            msgEl.innerHTML = message.replace(/\n/g, '<br>');
            modal.classList.remove("hidden");
            
            const onOk = () => {
                modal.classList.add("hidden");
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                modal.classList.add("hidden");
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                btnOk.removeEventListener("click", onOk);
                btnCancel.removeEventListener("click", onCancel);
            };
            
            btnOk.addEventListener("click", onOk);
            btnCancel.addEventListener("click", onCancel);
        } else {
            console.warn("Không tìm thấy phần tử hộp thoại xác nhận tùy chỉnh (confirm-modal) trong DOM. Từ chối xác nhận.");
            resolve(false);
        }
    });
}

function closeConfirmModal() {
    const modal = document.getElementById("confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        const btnCancel = document.getElementById("confirm-modal-cancel");
        if (btnCancel) btnCancel.click();
    }
}
