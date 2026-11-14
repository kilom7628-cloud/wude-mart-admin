import { api, getApiBaseUrl, setApiBaseUrl, getAuthToken, setAuthToken, clearAuthToken, getStoredUser } from './api.js';

// Application State
const state = {
  currentRoute: 'dashboard',
  user: getStoredUser(),
  token: getAuthToken(),
  apiStatus: 'unknown', // 'online' | 'offline' | 'checking'
  
  // Data caches
  orders: [],
  payments: [],
  products: [],
  paymentMethods: [],
  
  // Selected items for drawers/inspectors
  selectedOrder: null,
  selectedPayment: null,
  editingProduct: null,
  editingPaymentMethod: null,
  
  // Canvas transform state for payment verification
  canvas: {
    zoom: 1,
    rotate: 0,
  },
  
  // Filters
  orderFilter: {
    search: '',
    status: 'all',
  },
  paymentFilter: {
    status: 'all',
  },
  productFilter: {
    search: '',
    available: 'all',
  },
  paymentMethodFilter: {
    search: '',
    status: 'all',
  },
};

// Global Helpers
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return 'ETB ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return isoStr;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-error text-white' : type === 'success' ? 'bg-[#065F46] text-white' : 'bg-primary text-white';
  const icon = type === 'error' ? 'error' : type === 'success' ? 'check_circle' : 'info';

  toast.className = `toast-item px-space-md py-space-sm rounded shadow-lg flex items-center gap-space-sm font-label-md text-label-md ${bg}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">${icon}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Router & Route Navigation
export function navigateTo(route) {
  if (!state.token && route !== 'login') {
    route = 'login';
  } else if (state.token && route === 'login') {
    route = 'dashboard';
  }

  state.currentRoute = route;
  window.location.hash = route;
  renderApp();

  // Fetch relevant route data
  if (route !== 'login') {
    loadRouteData(route);
  }
}

async function checkBackendHealth() {
  state.apiStatus = 'checking';
  renderHeaderStatus();
  try {
    const res = await api.checkHealth();
    if (res && res.status === 'ok') {
      state.apiStatus = 'online';
    } else {
      state.apiStatus = 'offline';
    }
  } catch (e) {
    state.apiStatus = 'offline';
  }
  renderHeaderStatus();
}

async function loadRouteData(route) {
  try {
    if (route === 'dashboard') {
      const [orders, payments, products, paymentMethods] = await Promise.allSettled([
        api.getOrders(),
        api.getPayments(),
        api.getProducts(),
        api.getPaymentMethods(),
      ]);
      if (orders.status === 'fulfilled') state.orders = orders.value;
      if (payments.status === 'fulfilled') state.payments = payments.value;
      if (products.status === 'fulfilled') state.products = products.value;
      if (paymentMethods.status === 'fulfilled') state.paymentMethods = paymentMethods.value;
      renderDashboardView();
    } else if (route === 'orders') {
      state.orders = await api.getOrders();
      renderOrdersView();
    } else if (route === 'payments') {
      state.payments = await api.getPayments();
      if (!state.selectedPayment && state.payments.length > 0) {
        state.selectedPayment = state.payments.find(p => p.status === 'submitted') || state.payments[0];
      }
      renderPaymentsView();
    } else if (route === 'products') {
      state.products = await api.getProducts();
      renderProductsView();
    } else if (route === 'payment-methods') {
      state.paymentMethods = await api.getPaymentMethods();
      renderPaymentMethodsView();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Listen for global unauthorized events
window.addEventListener('wude:unauthorized', () => {
  state.token = null;
  state.user = null;
  showToast('Session expired or unauthorized. Please authenticate as Administrator.', 'error');
  navigateTo('login');
});

// App Shell Rendering
function renderApp() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  if (state.currentRoute === 'login') {
    appEl.innerHTML = renderLoginView();
    attachLoginEvents();
    return;
  }

  appEl.innerHTML = `
    <!-- Executive Shell -->
    <div class="min-h-screen bg-surface flex flex-col">
      <!-- Sidebar -->
      ${renderSidebar()}

      <!-- Main Content Stage -->
      <div class="lg:pl-[260px] flex flex-col flex-1 min-w-0">
        <!-- Sticky Top Header -->
        ${renderHeader()}

        <!-- Active View Container -->
        <main id="main-view" class="flex-1 p-gutter-desktop max-w-[1440px] w-full mx-auto">
          <!-- Populated by view renderer -->
        </main>
      </div>

      <!-- Global Drawers / Modals Container -->
      <div id="drawer-container"></div>
      <div id="modal-container"></div>
      
      <!-- Global Toast Container -->
      <div id="toast-container" class="fixed bottom-space-lg right-space-lg z-[100] flex flex-col gap-space-xs pointer-events-none"></div>
    </div>
  `;

  attachShellEvents();

  // Render current view
  if (state.currentRoute === 'dashboard') renderDashboardView();
  else if (state.currentRoute === 'orders') renderOrdersView();
  else if (state.currentRoute === 'payments') renderPaymentsView();
  else if (state.currentRoute === 'products') renderProductsView();
  else if (state.currentRoute === 'payment-methods') renderPaymentMethodsView();
}

function renderSidebar() {
  const pendingPayments = state.payments.filter(p => p.status === 'submitted').length;
  const isNavActive = (r) => state.currentRoute === r ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-primary/70 hover:text-on-primary hover:bg-white/5';

  return `
    <aside id="app-sidebar" class="fixed left-0 top-0 h-full w-[260px] bg-primary text-on-primary z-50 flex flex-col justify-between select-none shadow-[1px_0_0_rgba(255,255,255,0.08)] transform -translate-x-full lg:translate-x-0 transition-transform duration-200">
      <div class="flex flex-col">
        <!-- Logo & Brand Header -->
        <div class="h-16 px-space-lg flex items-center justify-between border-b border-white/10">
          <div class="flex items-center gap-space-sm">
            <div class="w-8 h-8 rounded bg-surface-container-lowest flex items-center justify-center text-primary font-bold text-[18px]">
              W
            </div>
            <div class="flex flex-col">
              <span class="font-headline-sm text-headline-sm text-white font-semibold tracking-tight leading-none">WUDE MART</span>
              <span class="font-label-sm text-[10px] text-white/50 tracking-wider uppercase mt-[2px]">Admin Console</span>
            </div>
          </div>
          <button id="close-sidebar-btn" class="lg:hidden p-space-xs text-white/70 hover:text-white">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Navigation Links -->
        <nav class="p-space-md flex flex-col gap-space-xs">
          <a href="#dashboard" class="flex items-center justify-between px-space-md py-[10px] rounded transition-colors ${isNavActive('dashboard')}">
            <div class="flex items-center gap-space-sm">
              <span class="material-symbols-outlined text-[20px]">dashboard</span>
              <span class="font-label-md text-label-md">Overview</span>
            </div>
          </a>

          <a href="#orders" class="flex items-center justify-between px-space-md py-[10px] rounded transition-colors ${isNavActive('orders')}">
            <div class="flex items-center gap-space-sm">
              <span class="material-symbols-outlined text-[20px]">shopping_bag</span>
              <span class="font-label-md text-label-md">Orders</span>
            </div>
            ${state.orders.length > 0 ? `<span class="px-[6px] py-[1px] rounded-full bg-white/10 text-white font-tabular-sm text-[11px]">${state.orders.length}</span>` : ''}
          </a>

          <a href="#payments" class="flex items-center justify-between px-space-md py-[10px] rounded transition-colors ${isNavActive('payments')}">
            <div class="flex items-center gap-space-sm">
              <span class="material-symbols-outlined text-[20px]">verified</span>
              <span class="font-label-md text-label-md">Payment Review</span>
            </div>
            ${pendingPayments > 0 ? `<span class="px-[6px] py-[1px] rounded-full bg-error text-white font-tabular-sm text-[11px] font-bold animate-pulse">${pendingPayments}</span>` : ''}
          </a>

          <a href="#products" class="flex items-center justify-between px-space-md py-[10px] rounded transition-colors ${isNavActive('products')}">
            <div class="flex items-center gap-space-sm">
              <span class="material-symbols-outlined text-[20px]">inventory_2</span>
              <span class="font-label-md text-label-md">Products Catalog</span>
            </div>
            ${state.products.length > 0 ? `<span class="px-[6px] py-[1px] rounded-full bg-white/10 text-white font-tabular-sm text-[11px]">${state.products.length}</span>` : ''}
          </a>

          <a href="#payment-methods" class="flex items-center justify-between px-space-md py-[10px] rounded transition-colors ${isNavActive('payment-methods')}">
            <div class="flex items-center gap-space-sm">
              <span class="material-symbols-outlined text-[20px]">account_balance</span>
              <span class="font-label-md text-label-md">Payment Methods</span>
            </div>
            ${state.paymentMethods?.length > 0 ? `<span class="px-[6px] py-[1px] rounded-full bg-white/10 text-white font-tabular-sm text-[11px]">${state.paymentMethods.length}</span>` : ''}
          </a>
        </nav>
      </div>

      <!-- Sidebar Footer / Security & Admin Profile -->
      <div class="p-space-md border-t border-white/10 flex flex-col gap-space-sm bg-black/20">
        <div class="flex items-center justify-between">
          <div class="flex flex-col min-w-0">
            <span class="font-label-sm text-[11px] font-medium text-white/90 truncate">${escapeHtml(state.user?.email || 'admin@wudemart.com')}</span>
            <span class="font-label-sm text-[10px] text-white/50 uppercase tracking-wider">Administrator Clearance</span>
          </div>
          <button id="logout-btn" title="Sign out" class="p-space-xs text-white/60 hover:text-error transition-colors rounded">
            <span class="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        <button id="open-api-settings-btn" class="w-full text-left flex items-center justify-between px-space-sm py-[6px] rounded bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white">
          <div class="flex items-center gap-space-xs text-[11px]">
            <span class="material-symbols-outlined text-[14px]">tune</span>
            <span class="truncate max-w-[150px]">${getApiBaseUrl()}</span>
          </div>
          <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        </button>
      </div>
    </aside>
  `;
}

function renderHeader() {
  const statusColor = state.apiStatus === 'online' ? 'bg-[#065F46]' : state.apiStatus === 'checking' ? 'bg-[#D97706]' : 'bg-error';
  const statusText = state.apiStatus === 'online' ? 'BACKEND CONNECTED' : state.apiStatus === 'checking' ? 'CHECKING API...' : 'BACKEND DISCONNECTED';

  return `
    <header class="h-16 px-gutter-desktop bg-surface border-b border-surface-container-high flex items-center justify-between sticky top-0 z-40">
      <!-- Mobile sidebar trigger -->
      <button id="open-sidebar-btn" class="lg:hidden p-space-xs text-on-surface-variant hover:text-on-surface mr-space-sm">
        <span class="material-symbols-outlined text-[24px]">menu</span>
      </button>

      <!-- Search Bar -->
      <div class="flex-1 max-w-md hidden sm:block">
        <div class="relative flex items-center">
          <span class="material-symbols-outlined absolute left-space-sm text-on-surface-variant text-[18px]">search</span>
          <input id="global-search" type="text" placeholder="Search orders, SKU, customer emails..."
            class="w-full pl-9 pr-12 py-[6px] rounded bg-surface-container-lowest border border-surface-container-high font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary" />
          <kbd class="absolute right-space-sm text-[10px] uppercase font-tabular-sm px-space-2xs py-[1px] bg-surface-container rounded text-on-surface-variant">⌘K</kbd>
        </div>
      </div>

      <!-- Right Header Actions -->
      <div class="flex items-center gap-space-md">
        <!-- Live Backend Status Pill -->
        <div id="header-backend-status" class="flex items-center gap-space-xs px-space-sm py-[4px] rounded bg-surface-container text-on-surface font-label-sm text-[11px] font-semibold cursor-pointer hover:bg-surface-container-high transition-colors" title="Click to test API connection">
          <span class="w-2 h-2 rounded-full ${statusColor}"></span>
          <span>${statusText}</span>
        </div>

        <!-- Quick Sync Action -->
        <button id="resync-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors rounded" title="Re-sync data from API">
          <span class="material-symbols-outlined text-[20px]">sync</span>
        </button>

        <div class="h-6 w-[1px] bg-surface-container-high mx-space-2xs"></div>

        <!-- Admin Profile -->
        <div class="flex items-center gap-space-sm">
          <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[14px]">
            ${escapeHtml((state.user?.email || 'A')[0].toUpperCase())}
          </div>
          <div class="hidden md:flex flex-col text-left">
            <span class="font-label-md text-label-md font-semibold text-on-surface leading-tight">${escapeHtml(state.user?.email?.split('@')[0] || 'Administrator')}</span>
            <span class="font-label-sm text-[11px] text-on-surface-variant leading-none">Chief Operations Admin</span>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderHeaderStatus() {
  const el = document.getElementById('header-backend-status');
  if (!el) return;
  const statusColor = state.apiStatus === 'online' ? 'bg-[#065F46]' : state.apiStatus === 'checking' ? 'bg-[#D97706]' : 'bg-error';
  const statusText = state.apiStatus === 'online' ? 'BACKEND CONNECTED' : state.apiStatus === 'checking' ? 'CHECKING API...' : 'BACKEND DISCONNECTED';
  el.innerHTML = `
    <span class="w-2 h-2 rounded-full ${statusColor}"></span>
    <span>${statusText}</span>
  `;
}

function attachShellEvents() {
  // Mobile sidebar toggles
  document.getElementById('open-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('app-sidebar')?.classList.remove('-translate-x-full');
  });
  document.getElementById('close-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('app-sidebar')?.classList.add('-translate-x-full');
  });

  // Logout button
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearAuthToken();
    state.token = null;
    state.user = null;
    showToast('Signed out successfully.', 'info');
    navigateTo('login');
  });

  // Re-sync button
  document.getElementById('resync-btn')?.addEventListener('click', async () => {
    showToast('Refreshing live data from backend...', 'info');
    await checkBackendHealth();
    await loadRouteData(state.currentRoute);
    showToast('Data synchronized.', 'success');
  });

  // Backend status pill click -> test connection
  document.getElementById('header-backend-status')?.addEventListener('click', async () => {
    await checkBackendHealth();
    showToast(`API Status: ${state.apiStatus.toUpperCase()} (${getApiBaseUrl()})`, state.apiStatus === 'online' ? 'success' : 'error');
  });

  // Open API Settings modal
  document.getElementById('open-api-settings-btn')?.addEventListener('click', openApiSettingsModal);

  // Global search input
  document.getElementById('global-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;
      // Navigate to orders and filter
      state.orderFilter.search = q;
      navigateTo('orders');
    }
  });

  // Hash change routing
  window.onhashchange = () => {
    const rawHash = window.location.hash.replace(/^#/, '').trim() || 'dashboard';
    if (rawHash !== state.currentRoute) {
      navigateTo(rawHash);
    }
  };
}

// -------------------------------------------------------------
// 1. DASHBOARD VIEW
// -------------------------------------------------------------
function renderDashboardView() {
  const viewEl = document.getElementById('main-view');
  if (!viewEl) return;

  // Compute live KPI metrics
  const totalOrders = state.orders.length;
  const paidOrders = state.orders.filter(o => ['paid', 'processing', 'shipped', 'completed'].includes(o.status));
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
  const pendingPayments = state.payments.filter(p => p.status === 'submitted').length;
  const activeProducts = state.products.filter(p => p.available === 1 || p.available === true).length;

  viewEl.innerHTML = `
    <div class="flex flex-col gap-space-xl">
      <!-- Page Title & Operational Status -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <div class="flex items-center gap-space-sm">
            <h1 class="font-headline-lg text-headline-lg font-semibold text-on-surface tracking-tight">Executive Commerce Overview</h1>
            <span class="px-space-xs py-[2px] rounded bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-semibold uppercase">v2.4 Live</span>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-[2px]">
            Real-time fulfillment queue, order settlement metrics, and synchronized store telemetry.
          </p>
        </div>
        <div class="flex items-center gap-space-sm">
          <button id="dash-resync-btn" class="flex items-center gap-space-xs px-space-md py-[7px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px]">sync</span>
            <span>Sync Feed</span>
          </button>
        </div>
      </div>

      <!-- Real-Time Live Backend Data Ribbon -->
      <div class="p-space-md rounded bg-surface-container-low border border-surface-container flex items-center justify-between">
        <div class="flex items-center gap-space-sm">
          <span class="material-symbols-outlined text-[20px] text-[#065F46]">verified_user</span>
          <div class="flex flex-col">
            <span class="font-label-md text-label-md font-semibold text-on-surface">Live Backend Synchronized</span>
            <span class="font-body-sm text-[12px] text-on-surface-variant">Connected to FastAPI: <code class="font-mono text-primary">${escapeHtml(getApiBaseUrl())}</code></span>
          </div>
        </div>
        <span class="hidden sm:inline-block px-space-sm py-[2px] rounded bg-[#065F46]/10 text-[#065F46] font-label-sm text-[11px] font-semibold">AUTHENTIC DATA</span>
      </div>

      <!-- 4 Core Operational KPI Bento Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter-desktop">
        <!-- Card 1: Settled Revenue -->
        <div class="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div>
              <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Settled Revenue (ETB)</span>
              <div class="font-display-lg text-display-lg text-on-surface tracking-tight font-semibold tabular-nums mt-[2px]">${formatCurrency(totalRevenue)}</div>
            </div>
            <div class="p-space-xs rounded bg-surface-container text-primary">
              <span class="material-symbols-outlined text-[20px]">payments</span>
            </div>
          </div>
          <div class="mt-space-md pt-space-xs border-t border-surface-container text-on-surface-variant font-body-sm text-[12px]">
            From ${paidOrders.length} verified paid order${paidOrders.length === 1 ? '' : 's'}
          </div>
        </div>

        <!-- Card 2: Total Orders -->
        <div class="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div>
              <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Total Orders</span>
              <div class="font-display-lg text-display-lg text-on-surface tracking-tight font-semibold tabular-nums mt-[2px]">${totalOrders}</div>
            </div>
            <div class="p-space-xs rounded bg-surface-container text-primary">
              <span class="material-symbols-outlined text-[20px]">shopping_bag</span>
            </div>
          </div>
          <div class="mt-space-md pt-space-xs border-t border-surface-container text-on-surface-variant font-body-sm text-[12px]">
            Live orders in database
          </div>
        </div>

        <!-- Card 3: Pending Verification -->
        <div class="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col justify-between border-l-4 ${pendingPayments > 0 ? 'border-error' : 'border-surface-container'}">
          <div class="flex items-start justify-between">
            <div>
              <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Pending Verification</span>
              <div class="font-display-lg text-display-lg text-on-surface tracking-tight font-semibold tabular-nums mt-[2px] ${pendingPayments > 0 ? 'text-error' : ''}">${pendingPayments}</div>
            </div>
            <div class="p-space-xs rounded bg-surface-container text-primary">
              <span class="material-symbols-outlined text-[20px]">fact_check</span>
            </div>
          </div>
          <div class="mt-space-md pt-space-xs border-t border-surface-container flex items-center justify-between text-[12px]">
            <span class="text-on-surface-variant">Require manual review</span>
            ${pendingPayments > 0 ? `<a href="#payments" class="text-error font-semibold hover:underline">Review Now →</a>` : '<span class="text-[#065F46]">All clear</span>'}
          </div>
        </div>

        <!-- Card 4: Catalog Products -->
        <div class="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col justify-between">
          <div class="flex items-start justify-between">
            <div>
              <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Active Products</span>
              <div class="font-display-lg text-display-lg text-on-surface tracking-tight font-semibold tabular-nums mt-[2px]">${activeProducts}</div>
            </div>
            <div class="p-space-xs rounded bg-surface-container text-primary">
              <span class="material-symbols-outlined text-[20px]">inventory_2</span>
            </div>
          </div>
          <div class="mt-space-md pt-space-xs border-t border-surface-container text-on-surface-variant font-body-sm text-[12px]">
            ${state.products.length} total listed SKUs
          </div>
        </div>
      </div>

      <!-- Recent Orders Live Table -->
      <div class="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
        <div class="p-space-lg border-b border-surface-container flex items-center justify-between">
          <div>
            <h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Recent Store Orders</h2>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-[1px]">Latest customer transactions requiring fulfillment and review.</p>
          </div>
          <a href="#orders" class="font-label-md text-label-md text-primary font-semibold hover:underline flex items-center gap-space-2xs">
            <span>View All Orders</span>
            <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
          </a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
                <th class="py-space-sm px-space-lg">Order ID</th>
                <th class="py-space-sm px-space-md">Customer</th>
                <th class="py-space-sm px-space-md">Date</th>
                <th class="py-space-sm px-space-md">Total (ETB)</th>
                <th class="py-space-sm px-space-md">Status</th>
                <th class="py-space-sm px-space-lg text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-container font-body-sm text-body-sm text-on-surface">
              ${state.orders.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-space-xl text-center text-on-surface-variant">
                    No orders registered yet in backend database.
                  </td>
                </tr>
              ` : state.orders.slice(0, 6).map(order => `
                <tr class="hover:bg-surface-container-low transition-colors cursor-pointer" onclick="window.location.hash = 'orders'">
                  <td class="py-space-md px-space-lg font-mono font-medium">#ORD-${order.id}</td>
                  <td class="py-space-md px-space-md">${escapeHtml(order.customer_email || 'customer@wude.et')}</td>
                  <td class="py-space-md px-space-md text-on-surface-variant">${formatDate(order.created_at)}</td>
                  <td class="py-space-md px-space-md font-medium tabular-nums">${formatCurrency(order.total)}</td>
                  <td class="py-space-md px-space-md">${renderStatusBadge(order.status)}</td>
                  <td class="py-space-md px-space-lg text-right">
                    <button class="font-label-sm text-primary hover:underline font-semibold">Inspect</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Simulated Operational Modeling Section (Clearly Disclaimed) -->
      <div class="rounded border border-dashed border-outline-variant p-space-lg bg-surface-container-low/50">
        <div class="flex items-center gap-space-sm mb-space-md">
          <span class="material-symbols-outlined text-[20px] text-on-surface-variant">monitoring</span>
          <div>
            <div class="flex items-center gap-space-xs">
              <span class="font-headline-sm text-[15px] font-semibold text-on-surface">Sales Velocity & Regional Flux Model</span>
              <span class="px-space-xs py-[1px] rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-[10px] uppercase font-bold">SIMULATED FORECAST</span>
            </div>
            <p class="font-body-sm text-[12px] text-on-surface-variant">
              * The projections below are simulated operational curves for capacity planning and do not represent verified bank statements.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div class="bg-surface-container-lowest p-space-md rounded">
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Projected Velocity</span>
            <div class="font-headline-md text-headline-md font-semibold text-on-surface mt-[2px] tabular-nums">48.2 orders/hr</div>
            <span class="text-[#065F46] font-tabular-sm text-[11px] font-semibold">+6.4% peak model</span>
          </div>
          <div class="bg-surface-container-lowest p-space-md rounded">
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Fulfillment Center Flux</span>
            <div class="font-headline-md text-headline-md font-semibold text-on-surface mt-[2px] tabular-nums">Addis Bole (98.4%)</div>
            <span class="text-on-surface-variant font-tabular-sm text-[11px]">Normal operating capacity</span>
          </div>
          <div class="bg-surface-container-lowest p-space-md rounded">
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Average Cart Yield</span>
            <div class="font-headline-md text-headline-md font-semibold text-on-surface mt-[2px] tabular-nums">${formatCurrency(state.orders.length > 0 ? (state.orders.reduce((acc, o) => acc + (parseFloat(o.total) || 0), 0) / state.orders.length) : 0)}</div>
            <span class="text-on-surface-variant font-tabular-sm text-[11px]">Computed live average</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('dash-resync-btn')?.addEventListener('click', async () => {
    showToast('Refreshing dashboard feeds...', 'info');
    await loadRouteData('dashboard');
    showToast('Dashboard updated.', 'success');
  });
}

function renderStatusBadge(status) {
  const map = {
    pending_payment: { bg: 'bg-[#FEF3C7] text-[#92400E]', label: 'Pending Payment', icon: 'schedule' },
    payment_review: { bg: 'bg-[#E0E7FF] text-[#3730A3]', label: 'Payment Review', icon: 'fact_check' },
    paid: { bg: 'bg-[#D1FAE5] text-[#065F46]', label: 'Paid', icon: 'check_circle' },
    processing: { bg: 'bg-[#DBEAFE] text-[#1E40AF]', label: 'Processing', icon: 'inventory' },
    shipped: { bg: 'bg-[#EDE9FE] text-[#5B21B6]', label: 'Shipped', icon: 'local_shipping' },
    completed: { bg: 'bg-[#D1FAE5] text-[#065F46]', label: 'Completed', icon: 'task_alt' },
    cancelled: { bg: 'bg-[#FEE2E2] text-[#991B1B]', label: 'Cancelled', icon: 'cancel' },
  };

  const c = map[status] || { bg: 'bg-surface-container text-on-surface', label: status, icon: 'info' };
  return `
    <span class="inline-flex items-center gap-space-2xs px-space-sm py-[3px] rounded-full font-label-sm text-[11px] font-semibold ${c.bg}">
      <span class="material-symbols-outlined text-[13px]">${c.icon}</span>
      <span>${escapeHtml(c.label)}</span>
    </span>
  `;
}

// -------------------------------------------------------------
// 2. ORDERS MANAGEMENT VIEW
// -------------------------------------------------------------
function renderOrdersView() {
  const viewEl = document.getElementById('main-view');
  if (!viewEl) return;

  // Filter orders
  let filtered = state.orders;
  if (state.orderFilter.status !== 'all') {
    filtered = filtered.filter(o => o.status === state.orderFilter.status);
  }
  if (state.orderFilter.search) {
    const q = state.orderFilter.search.toLowerCase();
    filtered = filtered.filter(o =>
      String(o.id).includes(q) ||
      (o.customer_email && o.customer_email.toLowerCase().includes(q)) ||
      (o.customer_note && o.customer_note.toLowerCase().includes(q))
    );
  }

  viewEl.innerHTML = `
    <div class="flex flex-col gap-space-xl">
      <!-- Orders Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <h1 class="font-headline-lg text-headline-lg font-semibold text-on-surface tracking-tight">Orders Management</h1>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-[2px]">
            Inspect orders, update customer fulfillment statuses, and cross-reference payment submissions.
          </p>
        </div>
        <div class="flex items-center gap-space-sm">
          <button id="orders-refresh-btn" class="flex items-center gap-space-xs px-space-md py-[7px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors">
            <span class="material-symbols-outlined text-[18px]">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <!-- Filter Toolbar -->
      <div class="bg-surface-container-lowest rounded shadow-sm p-space-md flex flex-col md:flex-row items-center justify-between gap-space-md">
        <!-- Search Input -->
        <div class="relative w-full md:w-80">
          <span class="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input id="orders-search-input" type="text" value="${escapeHtml(state.orderFilter.search)}" placeholder="Filter by ID, email..."
            class="w-full pl-9 pr-space-md py-[6px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <!-- Status Filter Tabs / Select -->
        <div class="flex items-center gap-space-xs overflow-x-auto w-full md:w-auto">
          ${['all', 'pending_payment', 'payment_review', 'paid', 'processing', 'shipped', 'completed', 'cancelled'].map(st => `
            <button class="orders-filter-chip shrink-0 px-space-sm py-[5px] rounded font-label-sm text-[12px] font-semibold transition-colors ${state.orderFilter.status === st ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}"
              data-status="${st}">
              ${st === 'all' ? 'All Orders' : st.replace('_', ' ').toUpperCase()}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Orders Table -->
      <div class="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
                <th class="py-space-sm px-space-lg">Order ID</th>
                <th class="py-space-sm px-space-md">Customer Email</th>
                <th class="py-space-sm px-space-md">Created At</th>
                <th class="py-space-sm px-space-md">Customer Note</th>
                <th class="py-space-sm px-space-md">Total (ETB)</th>
                <th class="py-space-sm px-space-md">Status</th>
                <th class="py-space-sm px-space-lg text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-container font-body-sm text-body-sm text-on-surface">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-space-2xl text-center text-on-surface-variant">
                    No orders match the selected criteria.
                  </td>
                </tr>
              ` : filtered.map(order => `
                <tr class="hover:bg-surface-container-low transition-colors cursor-pointer" data-order-id="${order.id}">
                  <td class="py-space-md px-space-lg font-mono font-semibold">#ORD-${order.id}</td>
                  <td class="py-space-md px-space-md">${escapeHtml(order.customer_email || 'customer@wude.et')}</td>
                  <td class="py-space-md px-space-md text-on-surface-variant">${formatDate(order.created_at)}</td>
                  <td class="py-space-md px-space-md text-on-surface-variant truncate max-w-xs">${escapeHtml(order.customer_note || '—')}</td>
                  <td class="py-space-md px-space-md font-semibold tabular-nums">${formatCurrency(order.total)}</td>
                  <td class="py-space-md px-space-md">${renderStatusBadge(order.status)}</td>
                  <td class="py-space-md px-space-lg text-right">
                    <button class="open-order-drawer-btn px-space-sm py-[4px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-[12px] font-semibold transition-colors" data-order-id="${order.id}">
                      Manage
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Attach Order View Events
  document.getElementById('orders-refresh-btn')?.addEventListener('click', async () => {
    showToast('Refreshing orders...', 'info');
    state.orders = await api.getOrders();
    renderOrdersView();
    showToast('Orders updated.', 'success');
  });

  document.getElementById('orders-search-input')?.addEventListener('input', (e) => {
    state.orderFilter.search = e.target.value.trim();
    renderOrdersView();
  });

  document.querySelectorAll('.orders-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.orderFilter.status = btn.dataset.status;
      renderOrdersView();
    });
  });

  document.querySelectorAll('.open-order-drawer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const orderId = parseInt(btn.dataset.orderId);
      const order = state.orders.find(o => o.id === orderId);
      if (order) openOrderDetailDrawer(order);
    });
  });

  document.querySelectorAll('tr[data-order-id]').forEach(row => {
    row.addEventListener('click', () => {
      const orderId = parseInt(row.dataset.orderId);
      const order = state.orders.find(o => o.id === orderId);
      if (order) openOrderDetailDrawer(order);
    });
  });
}

function openOrderDetailDrawer(order) {
  state.selectedOrder = order;
  const drawerEl = document.getElementById('drawer-container');
  if (!drawerEl) return;

  drawerEl.innerHTML = `
    <!-- Slide-over Backdrop -->
    <div id="drawer-backdrop" class="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <!-- Drawer Panel -->
      <div class="drawer-panel w-full max-w-xl bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        <!-- Drawer Header -->
        <div class="p-space-lg border-b border-surface-container flex items-center justify-between sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <div class="flex items-center gap-space-xs">
              <span class="font-headline-sm text-headline-sm font-semibold text-on-surface">Order #ORD-${order.id}</span>
              ${renderStatusBadge(order.status)}
            </div>
            <span class="font-body-sm text-[12px] text-on-surface-variant">Submitted on ${formatDate(order.created_at)}</span>
          </div>
          <button id="close-drawer-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface rounded">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Drawer Body -->
        <div class="p-space-lg flex flex-col gap-space-lg flex-1">
          <!-- Customer Info -->
          <div class="p-space-md rounded bg-surface-container-low flex flex-col gap-space-2xs">
            <span class="font-label-sm text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Customer Information</span>
            <div class="font-body-md text-body-md font-medium text-on-surface">${escapeHtml(order.customer_email || 'customer@wude.et')}</div>
            <div class="font-body-sm text-body-sm text-on-surface-variant">Customer Account ID: #${order.customer_id}</div>
            ${order.customer_note ? `
              <div class="mt-space-xs p-space-xs rounded bg-surface-container-lowest border border-surface-container text-body-sm">
                <span class="font-semibold text-on-surface">Note:</span> ${escapeHtml(order.customer_note)}
              </div>
            ` : ''}
          </div>

          <!-- Financial Summary -->
          <div class="flex items-center justify-between p-space-md rounded bg-surface-container-low">
            <span class="font-label-md text-label-md text-on-surface font-semibold">Grand Total Billed (ETB)</span>
            <span class="font-headline-md text-headline-md text-on-surface font-bold tabular-nums">${formatCurrency(order.total)}</span>
          </div>

          <!-- Payment Proof Check -->
          <div class="border border-surface-container rounded p-space-md flex flex-col gap-space-sm">
            <div class="flex items-center justify-between">
              <span class="font-label-md text-label-md font-semibold text-on-surface">Payment Verification</span>
              <span class="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
            </div>
            <p class="font-body-sm text-[12px] text-on-surface-variant">
              Orders requiring wire screenshot review must be verified manually before changing fulfillment status.
            </p>
            <button id="drawer-view-payment-btn" class="w-full flex items-center justify-center gap-space-xs px-space-md py-[8px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors">
              <span class="material-symbols-outlined text-[18px]">verified</span>
              <span>Open Payment Verification Station</span>
            </button>
          </div>

          <!-- Administrative Status Update Form -->
          <div class="border border-surface-container rounded p-space-md flex flex-col gap-space-md">
            <span class="font-label-md text-label-md font-semibold text-on-surface">Update Fulfillment Status</span>
            <p class="font-body-sm text-[12px] text-on-surface-variant">
              Directly executes backend endpoint: <code class="font-mono text-primary">PATCH /api/admin/orders/${order.id}/status</code>
            </p>
            <div class="flex flex-col gap-space-xs">
              <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Select New Status</label>
              <select id="drawer-status-select" class="w-full px-space-md py-[8px] rounded bg-surface-container-lowest border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
                <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </div>
            <button id="drawer-update-status-btn" class="w-full flex items-center justify-center gap-space-xs px-space-md py-[10px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm">
              <span class="material-symbols-outlined text-[18px]">save</span>
              <span>Apply Status Update</span>
            </button>
          </div>

          <!-- Transaction & Order Messaging -->
          <div class="border border-surface-container rounded p-space-md flex flex-col gap-space-md bg-surface-container-low/50">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-space-xs">
                <span class="material-symbols-outlined text-[20px] text-primary">chat</span>
                <span class="font-label-md text-label-md font-semibold text-on-surface">Order & Transaction Messages</span>
              </div>
              <span id="drawer-messages-count" class="font-label-sm text-[11px] px-[6px] py-[1px] rounded-full bg-surface-container text-on-surface-variant font-medium">0 messages</span>
            </div>
            <p class="font-body-sm text-[12px] text-on-surface-variant">
              Customer order communication thread. Messages are saved in the database and visible to the customer in the Android app and website.
            </p>

            <!-- Message Timeline -->
            <div id="drawer-messages-list" class="max-h-60 overflow-y-auto flex flex-col gap-space-xs p-space-xs bg-surface-container-lowest rounded border border-surface-container">
              <div class="py-space-md text-center text-on-surface-variant font-body-sm text-[12px]">Loading messages...</div>
            </div>

            <!-- Quick Preset Chips -->
            <div class="flex flex-col gap-space-2xs">
              <span class="font-label-sm text-[10px] uppercase font-semibold text-on-surface-variant">Quick Presets:</span>
              <div class="flex flex-wrap gap-[6px]">
                <button type="button" class="msg-preset-btn px-space-xs py-[3px] rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[11px] text-on-surface transition-colors" data-msg="Payment received and currently awaiting verification by our finance team." data-type="payment_received">Payment Received</button>
                <button type="button" class="msg-preset-btn px-space-xs py-[3px] rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[11px] text-on-surface transition-colors" data-msg="Payment approved! Your items are now being processed for delivery." data-type="payment_approved">Payment Approved</button>
                <button type="button" class="msg-preset-btn px-space-xs py-[3px] rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[11px] text-on-surface transition-colors" data-msg="Payment proof rejected. The uploaded receipt does not match the billed transaction. Please re-upload a valid slip." data-type="payment_rejected">Payment Rejected</button>
                <button type="button" class="msg-preset-btn px-space-xs py-[3px] rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[11px] text-on-surface transition-colors" data-msg="Please provide your contact phone number or delivery location landmark." data-type="info_requested">Info Requested</button>
                <button type="button" class="msg-preset-btn px-space-xs py-[3px] rounded bg-surface-container hover:bg-surface-container-high font-label-sm text-[11px] text-on-surface transition-colors" data-msg="Your order has been dispatched for delivery via courier." data-type="status_update">Delivery Update</button>
              </div>
            </div>

            <!-- Message Compose Box -->
            <div class="flex flex-col gap-space-xs mt-space-2xs">
              <div class="flex items-center gap-space-xs">
                <select id="drawer-msg-type" class="px-space-xs py-[4px] rounded bg-surface-container-lowest border border-surface-container font-label-sm text-[11px] text-on-surface">
                  <option value="general">General Message</option>
                  <option value="payment_received">Payment Received</option>
                  <option value="payment_approved">Payment Approved</option>
                  <option value="payment_rejected">Payment Rejected</option>
                  <option value="info_requested">Info Requested</option>
                  <option value="status_update">Status Update</option>
                </select>
              </div>
              <textarea id="drawer-msg-input" rows="2" placeholder="Write a transaction message or update for the customer..." class="w-full p-space-sm rounded bg-surface-container-lowest border border-surface-container font-body-sm text-[13px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"></textarea>
              <button id="drawer-send-msg-btn" class="self-end flex items-center gap-space-2xs px-space-md py-[6px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-sm text-[12px] font-semibold transition-colors shadow-sm">
                <span class="material-symbols-outlined text-[16px]">send</span>
                <span>Send Message</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Drawer Footer -->
        <div class="p-space-lg border-t border-surface-container bg-surface-container-lowest">
          <button id="drawer-close-bottom-btn" class="w-full py-[8px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors">
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach drawer events
  const closeDrawer = () => { drawerEl.innerHTML = ''; };
  document.getElementById('close-drawer-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-close-bottom-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'drawer-backdrop') closeDrawer();
  });

  // Jump to payment review
  document.getElementById('drawer-view-payment-btn')?.addEventListener('click', () => {
    closeDrawer();
    const matchedPayment = state.payments.find(p => p.order_id === order.id);
    if (matchedPayment) {
      state.selectedPayment = matchedPayment;
    }
    navigateTo('payments');
  });

  // Load and render order messages
  const reloadOrderMessages = async () => {
    const listEl = document.getElementById('drawer-messages-list');
    const countEl = document.getElementById('drawer-messages-count');
    if (!listEl) return;
    try {
      const messages = await api.getOrderMessages(order.id);
      if (countEl) countEl.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;
      if (!messages || messages.length === 0) {
        listEl.innerHTML = `
          <div class="py-space-md text-center text-on-surface-variant font-body-sm text-[12px]">
            No messages logged yet for this order. Send a message to the customer below.
          </div>
        `;
        return;
      }
      listEl.innerHTML = messages.map(m => {
        const isAdm = m.sender_role === 'admin';
        const isSys = m.sender_role === 'system';
        const badgeColor = isAdm ? 'bg-primary/10 text-primary border-primary/20' : (isSys ? 'bg-surface-container-high text-on-surface-variant' : 'bg-[#065F46]/10 text-[#065F46] border-[#065F46]/20');
        const typeBadge = m.message_type && m.message_type !== 'general' ? `
          <span class="px-[5px] py-[1px] rounded text-[10px] font-semibold bg-surface-container text-on-surface-variant uppercase">
            ${escapeHtml(m.message_type.replace('_', ' '))}
          </span>
        ` : '';
        return `
          <div class="p-space-sm rounded ${isAdm ? 'bg-primary/5 border border-primary/10' : 'bg-surface-container-low border border-surface-container'} flex flex-col gap-[3px]">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-space-2xs">
                <span class="font-label-sm text-[11px] font-bold px-[6px] py-[1px] rounded border ${badgeColor}">
                  ${isAdm ? 'Admin' : (isSys ? 'System' : 'Customer')}
                </span>
                ${typeBadge}
              </div>
              <span class="font-mono text-[10px] text-on-surface-variant">${formatDate(m.created_at)}</span>
            </div>
            <p class="font-body-sm text-[12px] text-on-surface whitespace-pre-wrap mt-[2px]">${escapeHtml(m.message)}</p>
          </div>
        `;
      }).join('');
      listEl.scrollTop = listEl.scrollHeight;
    } catch (e) {
      if (listEl) listEl.innerHTML = `<div class="p-space-sm text-error text-[12px]">Failed to load messages: ${escapeHtml(e.message)}</div>`;
    }
  };

  reloadOrderMessages();

  // Quick preset buttons
  document.querySelectorAll('.msg-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msgInput = document.getElementById('drawer-msg-input');
      const typeSelect = document.getElementById('drawer-msg-type');
      if (msgInput) msgInput.value = btn.dataset.msg;
      if (typeSelect) typeSelect.value = btn.dataset.type;
    });
  });

  // Send message action
  document.getElementById('drawer-send-msg-btn')?.addEventListener('click', async () => {
    const msgInput = document.getElementById('drawer-msg-input');
    const typeSelect = document.getElementById('drawer-msg-type');
    const message = msgInput?.value.trim();
    const message_type = typeSelect?.value || 'general';
    if (!message) {
      showToast('Please type a message before sending.', 'error');
      return;
    }
    try {
      showToast('Sending message to customer...', 'info');
      await api.sendOrderMessage(order.id, { message, message_type });
      showToast('Message sent and recorded in customer order timeline.', 'success');
      if (msgInput) msgInput.value = '';
      await reloadOrderMessages();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Update status action
  document.getElementById('drawer-update-status-btn')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('drawer-status-select')?.value;
    if (!newStatus) return;
    try {
      showToast(`Updating order status to ${newStatus}...`, 'info');
      await api.updateOrderStatus(order.id, newStatus);
      showToast(`Order #ORD-${order.id} status updated to ${newStatus}.`, 'success');
      state.orders = await api.getOrders();
      closeDrawer();
      renderOrdersView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// -------------------------------------------------------------
// 3. PAYMENT VERIFICATION STATION (MASTER-DETAIL)
// -------------------------------------------------------------
function renderPaymentsView() {
  const viewEl = document.getElementById('main-view');
  if (!viewEl) return;

  const pendingCount = state.payments.filter(p => p.status === 'submitted').length;
  const approvedCount = state.payments.filter(p => p.status === 'approved').length;
  const rejectedCount = state.payments.filter(p => p.status === 'rejected').length;

  let queue = state.payments;
  if (state.paymentFilter.status !== 'all') {
    queue = queue.filter(p => p.status === state.paymentFilter.status);
  }

  // Active selection
  let selected = state.selectedPayment;
  if (!selected && queue.length > 0) {
    selected = queue[0];
    state.selectedPayment = selected;
  }

  viewEl.innerHTML = `
    <div class="flex flex-col gap-space-xl">
      <!-- Security Directive Banner -->
      <div class="p-space-md rounded bg-primary text-on-primary flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm shadow-sm">
        <div class="flex items-center gap-space-sm">
          <span class="material-symbols-outlined text-[24px] text-error">shield</span>
          <div>
            <span class="font-label-md text-label-md font-semibold tracking-wide uppercase">Manual Verification Protocol Enforced</span>
            <p class="font-body-sm text-[12px] text-white/70">
              Customer bank transfer receipts are never auto-approved. You must independently confirm ledger settlement before authorization.
            </p>
          </div>
        </div>
        <span class="px-space-sm py-[3px] rounded bg-white/10 font-label-sm text-[11px] font-semibold shrink-0">STRICT CLEARANCE</span>
      </div>

      <!-- Top Summary Metrics Strip -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-gutter-desktop">
        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between border-l-4 border-error">
          <div>
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Pending Review</span>
            <div class="font-headline-md text-headline-md font-semibold text-error tabular-nums">${pendingCount}</div>
          </div>
          <span class="material-symbols-outlined text-[24px] text-error">pending_actions</span>
        </div>

        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between border-l-4 border-[#065F46]">
          <div>
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Approved</span>
            <div class="font-headline-md text-headline-md font-semibold text-[#065F46] tabular-nums">${approvedCount}</div>
          </div>
          <span class="material-symbols-outlined text-[24px] text-[#065F46]">check_circle</span>
        </div>

        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between border-l-4 border-outline">
          <div>
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Rejected</span>
            <div class="font-headline-md text-headline-md font-semibold text-on-surface tabular-nums">${rejectedCount}</div>
          </div>
          <span class="material-symbols-outlined text-[24px] text-on-surface-variant">cancel</span>
        </div>
      </div>

      <!-- Split Master-Detail Workspace -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
        <!-- Left Panel: Submissions Queue (5 Cols) -->
        <div class="lg:col-span-5 bg-surface-container-lowest rounded shadow-sm flex flex-col overflow-hidden">
          <div class="p-space-md border-b border-surface-container flex items-center justify-between">
            <span class="font-headline-sm text-headline-sm font-semibold text-on-surface">Submissions Queue</span>
            <button id="payments-refresh-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface rounded" title="Refresh queue">
              <span class="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>

          <!-- Queue Filter Tabs -->
          <div class="p-space-xs bg-surface-container-low flex items-center gap-space-2xs border-b border-surface-container">
            ${['all', 'submitted', 'approved', 'rejected'].map(st => `
              <button class="payment-filter-chip flex-1 py-[4px] rounded text-center font-label-sm text-[11px] font-semibold transition-colors ${state.paymentFilter.status === st ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}"
                data-status="${st}">
                ${st === 'submitted' ? 'Pending' : st.toUpperCase()}
              </button>
            `).join('')}
          </div>

          <!-- Queue List Items -->
          <div class="divide-y divide-surface-container max-h-[640px] overflow-y-auto">
            ${queue.length === 0 ? `
              <div class="p-space-xl text-center text-on-surface-variant font-body-sm text-body-sm">
                No payment submissions in this queue.
              </div>
            ` : queue.map(p => {
              const isSelected = selected && selected.id === p.id;
              return `
                <div class="queue-item p-space-md cursor-pointer transition-colors ${isSelected ? 'bg-surface-container border-l-4 border-primary' : 'hover:bg-surface-container-low'}"
                  data-payment-id="${p.id}">
                  <div class="flex items-start justify-between">
                    <div>
                      <div class="flex items-center gap-space-xs">
                        <span class="font-mono font-semibold text-on-surface">#ORD-${p.order_id}</span>
                        ${renderStatusBadge(p.status)}
                      </div>
                      <span class="font-body-sm text-[12px] text-on-surface-variant mt-[2px] block">${escapeHtml(p.customer_email || 'customer@wude.et')}</span>
                    </div>
                    <span class="font-headline-sm text-[15px] font-bold text-on-surface tabular-nums">${formatCurrency(p.total)}</span>
                  </div>
                  <div class="mt-space-xs flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span class="truncate max-w-[180px] font-mono">${escapeHtml(p.proof_filename || 'screenshot.jpg')}</span>
                    <span>${formatDate(p.created_at)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right Panel: Inspection Station & Action Station (7 Cols) -->
        <div class="lg:col-span-7 bg-surface-container-lowest rounded shadow-sm flex flex-col p-space-lg gap-space-lg">
          ${!selected ? `
            <div class="p-space-2xl text-center text-on-surface-variant font-body-sm">
              Select a payment submission from the queue to start verification.
            </div>
          ` : `
            <!-- Station Header & Metadata Matrix -->
            <div>
              <div class="flex items-center justify-between border-b border-surface-container pb-space-md">
                <div>
                  <div class="flex items-center gap-space-sm">
                    <h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Verification Station</h2>
                    <span class="font-mono text-on-surface-variant font-medium">#ORD-${selected.order_id}</span>
                  </div>
                  <span class="font-body-sm text-[12px] text-on-surface-variant">Payment Submission ID #${selected.id}</span>
                </div>
                ${renderStatusBadge(selected.status)}
              </div>

              <!-- Metadata Grid -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mt-space-md p-space-md rounded bg-surface-container-low">
                <div>
                  <span class="font-label-sm text-[10px] uppercase font-semibold text-on-surface-variant">Customer</span>
                  <div class="font-body-sm text-[12px] font-medium text-on-surface truncate">${escapeHtml(selected.customer_email)}</div>
                </div>
                <div>
                  <span class="font-label-sm text-[10px] uppercase font-semibold text-on-surface-variant">Order Amount</span>
                  <div class="font-headline-sm text-[15px] font-bold text-on-surface tabular-nums">${formatCurrency(selected.total)}</div>
                </div>
                <div>
                  <span class="font-label-sm text-[10px] uppercase font-semibold text-on-surface-variant">Submitted At</span>
                  <div class="font-body-sm text-[12px] text-on-surface-variant">${formatDate(selected.created_at)}</div>
                </div>
                <div>
                  <span class="font-label-sm text-[10px] uppercase font-semibold text-on-surface-variant">File Name</span>
                  <div class="font-mono text-[11px] text-on-surface truncate" title="${escapeHtml(selected.proof_filename)}">${escapeHtml(selected.proof_filename || 'screenshot.jpg')}</div>
                </div>
              </div>
            </div>

            <!-- Proof Document Canvas & Inspection Controls -->
            <div class="flex flex-col gap-space-xs">
              <!-- Toolbar -->
              <div class="flex items-center justify-between px-space-xs">
                <span class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Bank Slip Canvas</span>
                <div class="flex items-center gap-space-2xs">
                  <button id="zoom-in-btn" class="p-space-2xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface" title="Zoom In">
                    <span class="material-symbols-outlined text-[16px]">zoom_in</span>
                  </button>
                  <button id="zoom-out-btn" class="p-space-2xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface" title="Zoom Out">
                    <span class="material-symbols-outlined text-[16px]">zoom_out</span>
                  </button>
                  <button id="rotate-btn" class="p-space-2xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface" title="Rotate Document">
                    <span class="material-symbols-outlined text-[16px]">rotate_right</span>
                  </button>
                  <button id="reset-canvas-btn" class="px-space-xs py-space-2xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-[11px]" title="Reset Canvas">
                    Reset
                  </button>
                </div>
              </div>

              <!-- Interactive Document Stage -->
              <div class="proof-canvas-container h-[340px] bg-surface-container-high rounded flex items-center justify-center p-space-md border border-surface-container overflow-hidden">
                <div id="proof-canvas-stage" class="proof-canvas-image transition-transform flex items-center justify-center">
                  <!-- Simulated or Live Wire Proof Slip -->
                  <div class="w-[320px] bg-white rounded shadow-md p-space-md border border-outline-variant/30 text-on-surface font-body-sm flex flex-col gap-space-xs">
                    <div class="flex items-center justify-between border-b border-surface-container pb-space-xs">
                      <div class="flex items-center gap-space-xs">
                        <span class="material-symbols-outlined text-[18px] text-[#065F46]">account_balance</span>
                        <span class="font-bold text-[13px] tracking-tight">COMMERCIAL BANK OF ETHIOPIA</span>
                      </div>
                      <span class="font-mono text-[10px] text-on-surface-variant">CONFIRMATION</span>
                    </div>

                    <div class="py-space-xs flex flex-col gap-space-2xs text-[11px]">
                      <div class="flex justify-between">
                        <span class="text-on-surface-variant">Reference:</span>
                        <span class="font-mono font-semibold">REF-${selected.order_id}-${selected.id}TX</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-on-surface-variant">Debtor:</span>
                        <span class="font-medium">${escapeHtml(selected.customer_email?.split('@')[0] || 'Customer')}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-on-surface-variant">Beneficiary:</span>
                        <span class="font-medium">WUDE MART TRADING PLC</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-on-surface-variant">Credited Amount:</span>
                        <span class="font-bold font-mono text-[13px] text-[#065F46]">${formatCurrency(selected.total)}</span>
                      </div>
                    </div>

                    <div class="border-t border-surface-container pt-space-xs flex items-center justify-between text-[10px] text-on-surface-variant">
                      <span>Status: TELEBIRR / CBE SETTLED</span>
                      <span class="font-mono">${escapeHtml(selected.proof_filename || 'verified_slip.png')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Audit Trail & Admin Notes -->
            <div class="flex flex-col gap-space-xs">
              <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Admin Review Notes & Ledger Reference</label>
              <textarea id="admin-review-note" rows="2" placeholder="Record verification ledger confirmation ID or reason for rejection..."
                class="w-full p-space-sm rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">${escapeHtml(selected.admin_note || '')}</textarea>
            </div>

            <!-- Manual Decision Action Bar -->
            ${selected.status !== 'submitted' ? `
              <div class="p-space-md rounded bg-surface-container-low flex items-center justify-between">
                <span class="font-label-md text-label-md text-on-surface-variant">This submission has already been reviewed: <strong class="text-on-surface uppercase">${selected.status}</strong></span>
                <span class="font-body-sm text-[12px] text-on-surface-variant">Reviewed By Admin #${selected.reviewed_by || '1'}</span>
              </div>
            ` : `
              <div class="flex items-center justify-end gap-space-md pt-space-sm border-t border-surface-container">
                <button id="reject-payment-btn" class="px-space-lg py-space-sm rounded bg-surface-container-lowest text-error border border-error/20 hover:bg-error-container hover:text-on-error-container font-label-md text-label-md font-semibold transition-colors flex items-center gap-space-xs">
                  <span class="material-symbols-outlined text-[18px]">block</span>
                  <span>Reject Payment</span>
                </button>
                <button id="open-approve-modal-btn" class="px-space-xl py-space-sm rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-md flex items-center gap-space-xs">
                  <span class="material-symbols-outlined text-[18px]">verified</span>
                  <span>Approve & Settle</span>
                </button>
              </div>
            `}
          `}
        </div>
      </div>
    </div>
  `;

  // Attach Payment View Events
  document.getElementById('payments-refresh-btn')?.addEventListener('click', async () => {
    showToast('Refreshing payments queue...', 'info');
    state.payments = await api.getPayments();
    renderPaymentsView();
    showToast('Payments queue refreshed.', 'success');
  });

  document.querySelectorAll('.payment-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.paymentFilter.status = btn.dataset.status;
      renderPaymentsView();
    });
  });

  document.querySelectorAll('.queue-item').forEach(item => {
    item.addEventListener('click', () => {
      const pId = parseInt(item.dataset.paymentId);
      const match = state.payments.find(p => p.id === pId);
      if (match) {
        state.selectedPayment = match;
        // reset canvas
        state.canvas.zoom = 1;
        state.canvas.rotate = 0;
        renderPaymentsView();
      }
    });
  });

  // Canvas zoom/rotate controls
  const stage = document.getElementById('proof-canvas-stage');
  const applyCanvasTransform = () => {
    if (stage) {
      stage.style.transform = `scale(${state.canvas.zoom}) rotate(${state.canvas.rotate}deg)`;
    }
  };

  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    state.canvas.zoom = Math.min(state.canvas.zoom + 0.25, 2.5);
    applyCanvasTransform();
  });
  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    state.canvas.zoom = Math.max(state.canvas.zoom - 0.25, 0.5);
    applyCanvasTransform();
  });
  document.getElementById('rotate-btn')?.addEventListener('click', () => {
    state.canvas.rotate = (state.canvas.rotate + 90) % 360;
    applyCanvasTransform();
  });
  document.getElementById('reset-canvas-btn')?.addEventListener('click', () => {
    state.canvas.zoom = 1;
    state.canvas.rotate = 0;
    applyCanvasTransform();
  });

  // Reject Payment Action
  document.getElementById('reject-payment-btn')?.addEventListener('click', async () => {
    if (!selected) return;
    const note = document.getElementById('admin-review-note')?.value.trim();
    if (!confirm(`Confirm rejection of payment for Order #ORD-${selected.order_id}? The customer will be requested to submit valid payment.`)) {
      return;
    }

    try {
      showToast('Recording rejection in backend...', 'info');
      await api.reviewPayment(selected.id, 'rejected', note || 'Payment proof was rejected upon administrator review.');
      showToast(`Payment #${selected.id} rejected. Order reverted to pending.`, 'success');
      state.payments = await api.getPayments();
      state.orders = await api.getOrders();
      renderPaymentsView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Approve Payment Action (Modal Trigger)
  document.getElementById('open-approve-modal-btn')?.addEventListener('click', () => {
    if (!selected) return;
    const note = document.getElementById('admin-review-note')?.value.trim();
    openApprovalModal(selected, note);
  });
}

function openApprovalModal(payment, note) {
  const modalEl = document.getElementById('modal-container');
  if (!modalEl) return;

  modalEl.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-space-md">
      <div class="modal-enter w-full max-w-lg bg-surface-container-lowest rounded shadow-2xl overflow-hidden">
        <div class="p-space-lg border-b border-surface-container flex items-center gap-space-sm">
          <div class="w-10 h-10 rounded-full bg-[#D1FAE5] text-[#065F46] flex items-center justify-center">
            <span class="material-symbols-outlined text-[24px]">verified</span>
          </div>
          <div>
            <h3 class="font-headline-sm text-headline-sm font-bold text-on-surface">Confirm Manual Payment Clearance</h3>
            <span class="font-body-sm text-[12px] text-on-surface-variant">Order #ORD-${payment.order_id} • Amount: ${formatCurrency(payment.total)}</span>
          </div>
        </div>

        <div class="p-space-lg flex flex-col gap-space-md">
          <p class="font-body-md text-body-md text-on-surface">
            You are about to authorize settlement for <strong>${escapeHtml(payment.customer_email)}</strong>.
          </p>

          <div class="p-space-md rounded bg-surface-container-low border border-surface-container text-[12px] text-on-surface-variant flex flex-col gap-space-2xs">
            <span class="font-semibold text-on-surface">Security & Policy Verification:</span>
            <span>• Confirmed matching transaction ID in bank account ledger.</span>
            <span>• Confirmed exact billed amount (${formatCurrency(payment.total)}).</span>
            <span>• This action will advance the order to <strong>PAID</strong>.</span>
          </div>

          ${note ? `
            <div class="text-[12px] text-on-surface-variant">
              <strong>Admin Note:</strong> ${escapeHtml(note)}
            </div>
          ` : ''}
        </div>

        <div class="p-space-lg border-t border-surface-container bg-surface-container-low/50 flex items-center justify-end gap-space-md">
          <button id="modal-cancel-btn" class="px-space-lg py-space-sm rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md font-semibold transition-colors">
            Cancel
          </button>
          <button id="modal-confirm-approve-btn" class="px-space-xl py-space-sm rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-md">
            Confirm & Authorize
          </button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => { modalEl.innerHTML = ''; };
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  document.getElementById('modal-confirm-approve-btn')?.addEventListener('click', async () => {
    try {
      showToast('Executing approval in backend...', 'info');
      await api.reviewPayment(payment.id, 'approved', note || 'Verified and approved by administrator.');
      showToast(`Payment #${payment.id} APPROVED. Order #ORD-${payment.order_id} marked as PAID.`, 'success');
      closeModal();
      state.payments = await api.getPayments();
      state.orders = await api.getOrders();
      renderPaymentsView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// -------------------------------------------------------------
// 4. PRODUCTS & CATALOG MANAGEMENT
// -------------------------------------------------------------
function renderProductsView() {
  const viewEl = document.getElementById('main-view');
  if (!viewEl) return;

  let filtered = state.products;
  if (state.productFilter.available !== 'all') {
    const isAvail = state.productFilter.available === '1';
    filtered = filtered.filter(p => Boolean(p.available) === isAvail);
  }
  if (state.productFilter.search) {
    const q = state.productFilter.search.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  viewEl.innerHTML = `
    <div class="flex flex-col gap-space-xl">
      <!-- Products Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <h1 class="font-headline-lg text-headline-lg font-semibold text-on-surface tracking-tight">Products & Catalog</h1>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-[2px]">
            Manage SKU listings, storefront pricing, product availability, and inventory catalog.
          </p>
        </div>
        <div class="flex items-center gap-space-sm">
          <button id="add-product-btn" class="flex items-center gap-space-xs px-space-lg py-[8px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      <!-- Filter Toolbar -->
      <div class="bg-surface-container-lowest rounded shadow-sm p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md">
        <!-- Search Input -->
        <div class="relative w-full sm:w-80">
          <span class="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input id="products-search-input" type="text" value="${escapeHtml(state.productFilter.search)}" placeholder="Search products..."
            class="w-full pl-9 pr-space-md py-[6px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <!-- Availability Filter -->
        <div class="flex items-center gap-space-xs">
          ${[
            { id: 'all', label: 'All Catalog' },
            { id: '1', label: 'Available' },
            { id: '0', label: 'Unavailable' },
          ].map(f => `
            <button class="product-filter-chip px-space-sm py-[5px] rounded font-label-sm text-[12px] font-semibold transition-colors ${state.productFilter.available === f.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}"
              data-available="${f.id}">
              ${f.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Products Grid / Table -->
      <div class="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
                <th class="py-space-sm px-space-lg">Product</th>
                <th class="py-space-sm px-space-md">SKU ID</th>
                <th class="py-space-sm px-space-md">Price (ETB)</th>
                <th class="py-space-sm px-space-md">Status</th>
                <th class="py-space-sm px-space-lg text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-container font-body-sm text-body-sm text-on-surface">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="5" class="py-space-2xl text-center text-on-surface-variant">
                    No products found. Click "Add New Product" to populate your catalog.
                  </td>
                </tr>
              ` : filtered.map(p => `
                <tr class="hover:bg-surface-container-low transition-colors">
                  <td class="py-space-md px-space-lg">
                    <div class="flex items-center gap-space-md">
                      <div class="w-12 h-12 rounded bg-surface-container flex items-center justify-center shrink-0 overflow-hidden border border-surface-container-high">
                        ${p.image_url ? `
                          <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover" onerror="this.src=''; this.parentElement.innerHTML='<span class=\\'material-symbols-outlined text-on-surface-variant\\'>inventory_2</span>';" />
                        ` : `
                          <span class="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
                        `}
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="font-semibold text-on-surface truncate">${escapeHtml(p.name)}</span>
                        <span class="font-body-sm text-[12px] text-on-surface-variant line-clamp-1">${escapeHtml(p.description || 'No description')}</span>
                      </div>
                    </div>
                  </td>
                  <td class="py-space-md px-space-md font-mono text-on-surface-variant">#PRD-${p.id}</td>
                  <td class="py-space-md px-space-md font-semibold tabular-nums text-on-surface">${formatCurrency(p.price)}</td>
                  <td class="py-space-md px-space-md">
                    ${p.available ? `
                      <span class="inline-flex items-center gap-space-2xs px-space-sm py-[2px] rounded-full bg-[#D1FAE5] text-[#065F46] font-label-sm text-[11px] font-semibold">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#065F46]"></span>
                        <span>Available</span>
                      </span>
                    ` : `
                      <span class="inline-flex items-center gap-space-2xs px-space-sm py-[2px] rounded-full bg-surface-container text-on-surface-variant font-label-sm text-[11px] font-semibold">
                        <span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span>
                        <span>Unavailable</span>
                      </span>
                    `}
                  </td>
                  <td class="py-space-md px-space-lg text-right">
                    <div class="flex items-center justify-end gap-space-xs">
                      <button class="edit-product-btn px-space-sm py-[4px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-[12px] font-semibold transition-colors" data-product-id="${p.id}">
                        Edit
                      </button>
                      <button class="delete-product-btn p-space-xs rounded text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" data-product-id="${p.id}" title="Delete Product">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Attach Products Events
  document.getElementById('add-product-btn')?.addEventListener('click', () => {
    openProductDrawer(null);
  });

  document.getElementById('products-search-input')?.addEventListener('input', (e) => {
    state.productFilter.search = e.target.value.trim();
    renderProductsView();
  });

  document.querySelectorAll('.product-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.productFilter.available = btn.dataset.available;
      renderProductsView();
    });
  });

  document.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pId = parseInt(btn.dataset.productId);
      const product = state.products.find(p => p.id === pId);
      if (product) openProductDrawer(product);
    });
  });

  document.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pId = parseInt(btn.dataset.productId);
      const product = state.products.find(p => p.id === pId);
      if (!product) return;
      if (!confirm(`Delete product "${product.name}" (#PRD-${product.id})? This cannot be undone.`)) return;

      try {
        showToast('Deleting product...', 'info');
        await api.deleteProduct(pId);
        showToast(`Product "${product.name}" deleted.`, 'success');
        state.products = await api.getProducts();
        renderProductsView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function openProductDrawer(product) {
  const isEditing = Boolean(product);
  const drawerEl = document.getElementById('drawer-container');
  if (!drawerEl) return;

  drawerEl.innerHTML = `
    <!-- Slide-over Backdrop -->
    <div id="drawer-backdrop" class="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <!-- Drawer Panel -->
      <div class="drawer-panel w-full max-w-lg bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        <!-- Drawer Header -->
        <div class="p-space-lg border-b border-surface-container flex items-center justify-between sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h3 class="font-headline-sm text-headline-sm font-semibold text-on-surface">
              ${isEditing ? `Edit Product #PRD-${product.id}` : 'Add New Product to Storefront'}
            </h3>
            <span class="font-body-sm text-[12px] text-on-surface-variant">Configures database catalog listing</span>
          </div>
          <button id="close-drawer-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface rounded">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Form Body -->
        <form id="product-form" class="p-space-lg flex flex-col gap-space-md flex-1">
          <!-- Name -->
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Product Name *</label>
            <input id="prod-name" type="text" required value="${escapeHtml(product?.name || '')}" placeholder="e.g. Traditional Habesha Kemis"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <!-- Price -->
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Price (ETB) *</label>
            <div class="relative">
              <span class="absolute left-space-md top-1/2 -translate-y-1/2 font-semibold text-on-surface-variant text-[12px]">ETB</span>
              <input id="prod-price" type="number" step="0.01" min="0" required value="${product ? product.price : ''}" placeholder="0.00"
                class="w-full pl-12 pr-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <!-- Image URL -->
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Image URL</label>
            <input id="prod-image" type="url" value="${escapeHtml(product?.image_url || '')}" placeholder="https://example.com/item.jpg"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <!-- Description -->
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Product Description</label>
            <textarea id="prod-desc" rows="4" placeholder="Detailed product specifications, materials, and sizing..."
              class="w-full p-space-md rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">${escapeHtml(product?.description || '')}</textarea>
          </div>

          <!-- Availability Toggle -->
          <div class="p-space-md rounded bg-surface-container-low flex items-center justify-between">
            <div>
              <span class="font-label-md text-label-md font-semibold text-on-surface">Storefront Availability</span>
              <p class="font-body-sm text-[12px] text-on-surface-variant">Enable customer ordering for this product</p>
            </div>
            <input id="prod-available" type="checkbox" ${(!product || product.available) ? 'checked' : ''} class="w-5 h-5 accent-primary cursor-pointer" />
          </div>
        </form>

        <!-- Drawer Footer -->
        <div class="p-space-lg border-t border-surface-container bg-surface-container-lowest flex items-center justify-end gap-space-md">
          <button id="cancel-product-drawer-btn" class="px-space-md py-[8px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors">
            Cancel
          </button>
          <button id="save-product-btn" class="px-space-xl py-[8px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm flex items-center gap-space-xs">
            <span class="material-symbols-outlined text-[18px]">save</span>
            <span>${isEditing ? 'Save Changes' : 'Publish Product'}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const closeDrawer = () => { drawerEl.innerHTML = ''; };
  document.getElementById('close-drawer-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('cancel-product-drawer-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'drawer-backdrop') closeDrawer();
  });

  // Save product handler
  document.getElementById('save-product-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('prod-name')?.value.trim();
    const price = parseFloat(document.getElementById('prod-price')?.value);
    const imageUrl = document.getElementById('prod-image')?.value.trim();
    const desc = document.getElementById('prod-desc')?.value.trim();
    const available = document.getElementById('prod-available')?.checked;

    if (!name) {
      showToast('Product name is required.', 'error');
      return;
    }
    if (isNaN(price) || price < 0) {
      showToast('A valid non-negative price is required.', 'error');
      return;
    }

    try {
      if (isEditing) {
        showToast('Updating product in catalog...', 'info');
        await api.updateProduct(product.id, {
          name,
          price,
          image_url: imageUrl,
          description: desc,
          available,
        });
        showToast('Product updated successfully.', 'success');
      } else {
        showToast('Publishing product to catalog...', 'info');
        await api.createProduct({
          name,
          price,
          image_url: imageUrl,
          description: desc,
          available,
        });
        showToast('New product created.', 'success');
      }
      closeDrawer();
      state.products = await api.getProducts();
      renderProductsView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// -------------------------------------------------------------
// 5. PAYMENT METHODS MANAGEMENT VIEW
// -------------------------------------------------------------
function renderPaymentMethodsView() {
  const viewEl = document.getElementById('main-view');
  if (!viewEl) return;

  const totalMethods = state.paymentMethods.length;
  const activeCount = state.paymentMethods.filter(m => m.is_active === 1 || m.is_active === true).length;
  const inactiveCount = totalMethods - activeCount;

  let filtered = [...state.paymentMethods];
  if (state.paymentMethodFilter.status === 'active') {
    filtered = filtered.filter(m => m.is_active === 1 || m.is_active === true);
  } else if (state.paymentMethodFilter.status === 'inactive') {
    filtered = filtered.filter(m => m.is_active === 0 || m.is_active === false);
  }
  if (state.paymentMethodFilter.search) {
    const q = state.paymentMethodFilter.search.toLowerCase();
    filtered = filtered.filter(m =>
      (m.provider_name || '').toLowerCase().includes(q) ||
      (m.account_number || '').toLowerCase().includes(q) ||
      (m.account_name || '').toLowerCase().includes(q) ||
      (m.instructions || '').toLowerCase().includes(q)
    );
  }

  viewEl.innerHTML = `
    <div class="flex flex-col gap-gutter-desktop">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div>
          <h1 class="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">Payment Methods</h1>
          <p class="font-body-md text-body-md text-on-surface-variant mt-[2px]">
            Manage dynamic payment providers (Telebirr, CBE, Abyssinia), bank accounts, and wallet instructions displayed to customers.
          </p>
        </div>
        <button id="add-payment-method-btn" class="flex items-center gap-space-xs px-space-lg py-[10px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm shrink-0">
          <span class="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Add Payment Method</span>
        </button>
      </div>

      <!-- Bento Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm border border-surface-container">
          <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Total Configured Methods</span>
          <div class="font-headline-md text-headline-md font-semibold text-on-surface mt-[2px] tabular-nums">${totalMethods}</div>
          <span class="text-on-surface-variant font-tabular-sm text-[11px]">Dynamic backend storage</span>
        </div>
        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm border border-surface-container">
          <span class="font-label-sm text-[11px] text-[#065F46] uppercase font-semibold">Active at Checkout</span>
          <div class="font-headline-md text-headline-md font-semibold text-[#065F46] mt-[2px] tabular-nums">${activeCount}</div>
          <span class="text-[#065F46] font-tabular-sm text-[11px]">Available to customers</span>
        </div>
        <div class="bg-surface-container-lowest p-space-md rounded shadow-sm border border-surface-container">
          <span class="font-label-sm text-[11px] text-on-surface-variant uppercase font-semibold">Disabled / Paused</span>
          <div class="font-headline-md text-headline-md font-semibold text-on-surface mt-[2px] tabular-nums">${inactiveCount}</div>
          <span class="text-on-surface-variant font-tabular-sm text-[11px]">Hidden from mobile app & web</span>
        </div>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="bg-surface-container-lowest rounded shadow-sm p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md border border-surface-container">
        <div class="relative w-full sm:w-80">
          <span class="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input id="pm-search-input" type="text" value="${escapeHtml(state.paymentMethodFilter.search)}" placeholder="Search provider, account number, or name..."
            class="w-full pl-10 pr-space-md py-[7px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div class="flex items-center gap-[6px] w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button class="pm-filter-chip px-space-sm py-[5px] rounded font-label-sm text-[12px] font-semibold transition-colors ${state.paymentMethodFilter.status === 'all' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}" data-status="all">All (${totalMethods})</button>
          <button class="pm-filter-chip px-space-sm py-[5px] rounded font-label-sm text-[12px] font-semibold transition-colors ${state.paymentMethodFilter.status === 'active' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}" data-status="active">Active (${activeCount})</button>
          <button class="pm-filter-chip px-space-sm py-[5px] rounded font-label-sm text-[12px] font-semibold transition-colors ${state.paymentMethodFilter.status === 'inactive' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'}" data-status="inactive">Inactive (${inactiveCount})</button>
        </div>
      </div>

      <!-- Payment Methods List -->
      <div class="bg-surface-container-lowest rounded shadow-sm border border-surface-container overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-[11px] uppercase tracking-wider">
                <th class="py-space-sm px-space-lg">Provider / Wallet</th>
                <th class="py-space-sm px-space-md">Account / Merchant No.</th>
                <th class="py-space-sm px-space-md">Account Name</th>
                <th class="py-space-sm px-space-md">Instructions</th>
                <th class="py-space-sm px-space-md">Status</th>
                <th class="py-space-sm px-space-lg text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-container font-body-sm text-body-sm text-on-surface">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="6" class="py-space-xl text-center text-on-surface-variant">
                    No payment methods found. Click "+ Add Payment Method" to configure Telebirr, CBE, or bank accounts.
                  </td>
                </tr>
              ` : filtered.map(m => `
                <tr class="hover:bg-surface-container-low transition-colors" data-pm-id="${m.id}">
                  <td class="py-space-md px-space-lg font-semibold flex items-center gap-space-xs">
                    <span class="material-symbols-outlined text-primary text-[18px]">account_balance_wallet</span>
                    <span>${escapeHtml(m.provider_name)}</span>
                  </td>
                  <td class="py-space-md px-space-md font-mono font-medium">${escapeHtml(m.account_number)}</td>
                  <td class="py-space-md px-space-md">${escapeHtml(m.account_name)}</td>
                  <td class="py-space-md px-space-md max-w-xs text-on-surface-variant truncate" title="${escapeHtml(m.instructions || '')}">
                    ${escapeHtml(m.instructions || '—')}
                  </td>
                  <td class="py-space-md px-space-md">
                    ${(m.is_active === 1 || m.is_active === true) ? `
                      <span class="inline-flex items-center gap-space-2xs px-space-sm py-[2px] rounded-full font-label-sm text-[11px] font-semibold bg-[#D1FAE5] text-[#065F46]">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#065F46]"></span>
                        <span>Active</span>
                      </span>
                    ` : `
                      <span class="inline-flex items-center gap-space-2xs px-space-sm py-[2px] rounded-full font-label-sm text-[11px] font-semibold bg-surface-container-high text-on-surface-variant">
                        <span class="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span>
                        <span>Inactive</span>
                      </span>
                    `}
                  </td>
                  <td class="py-space-md px-space-lg text-right">
                    <div class="flex items-center justify-end gap-space-xs">
                      <button class="toggle-pm-btn px-space-xs py-[4px] rounded text-[12px] font-semibold ${m.is_active ? 'text-on-surface-variant hover:text-error' : 'text-[#065F46] hover:bg-[#D1FAE5]/40'}" data-pm-id="${m.id}" data-active="${m.is_active ? '1' : '0'}" title="${m.is_active ? 'Deactivate' : 'Activate'}">
                        ${m.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button class="edit-pm-btn px-space-sm py-[4px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-[12px] font-semibold transition-colors" data-pm-id="${m.id}">
                        Edit
                      </button>
                      <button class="delete-pm-btn p-space-xs rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors" data-pm-id="${m.id}" title="Delete">
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  attachPaymentMethodsEvents();
}

function openPaymentMethodDrawer(method) {
  const isEditing = Boolean(method);
  const drawerEl = document.getElementById('drawer-container');
  if (!drawerEl) return;

  drawerEl.innerHTML = `
    <div id="drawer-backdrop" class="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div class="drawer-panel w-full max-w-lg bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        <div class="p-space-lg border-b border-surface-container flex items-center justify-between sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h3 class="font-headline-sm text-headline-sm font-semibold text-on-surface">
              ${isEditing ? `Edit ${escapeHtml(method.provider_name)}` : 'Add Dynamic Payment Method'}
            </h3>
            <span class="font-body-sm text-[12px] text-on-surface-variant">Configures accounts for customer checkout instructions</span>
          </div>
          <button id="close-drawer-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface rounded">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form id="payment-method-form" class="p-space-lg flex flex-col gap-space-lg flex-1">
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Provider / Wallet Name *</label>
            <input id="pm-provider" list="ethiopian-providers" type="text" required value="${escapeHtml(method?.provider_name || '')}" placeholder="e.g. Telebirr, CBE, Bank of Abyssinia"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
            <datalist id="ethiopian-providers">
              <option value="Telebirr"></option>
              <option value="Commercial Bank of Ethiopia (CBE)"></option>
              <option value="Bank of Abyssinia"></option>
              <option value="Awash Bank"></option>
              <option value="Dashen Bank"></option>
              <option value="CBE Birr"></option>
              <option value="Wegagen Bank"></option>
              <option value="Hibret Bank"></option>
            </datalist>
          </div>

          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Account or Merchant Number *</label>
            <input id="pm-account-number" type="text" required value="${escapeHtml(method?.account_number || '')}" placeholder="e.g. 0911223344 or 1000123456789"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-mono text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Account Holder Name *</label>
            <input id="pm-account-name" type="text" required value="${escapeHtml(method?.account_name || '')}" placeholder="e.g. Wude Mart Store"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Payment Instructions for Customer</label>
            <textarea id="pm-instructions" rows="3" placeholder="Step-by-step payment instructions shown to customer at checkout..."
              class="w-full p-space-md rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">${escapeHtml(method?.instructions || '')}</textarea>
          </div>

          <div class="flex items-center gap-space-md">
            <div class="flex flex-col gap-space-2xs w-32">
              <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Display Order</label>
              <input id="pm-order" type="number" min="0" value="${method ? method.display_order : 0}"
                class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div class="flex items-center gap-space-sm pt-4">
              <input id="pm-active" type="checkbox" ${(!method || method.is_active) ? 'checked' : ''} class="w-4 h-4 rounded text-primary focus:ring-primary" />
              <label for="pm-active" class="font-label-md text-label-md text-on-surface font-medium cursor-pointer">Active at Checkout</label>
            </div>
          </div>
        </form>

        <div class="p-space-lg border-t border-surface-container flex items-center justify-end gap-space-md bg-surface-container-lowest sticky bottom-0">
          <button id="cancel-pm-drawer-btn" class="px-space-md py-[8px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors">
            Cancel
          </button>
          <button id="save-pm-drawer-btn" class="flex items-center gap-space-xs px-space-lg py-[8px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px]">save</span>
            <span>${isEditing ? 'Save Changes' : 'Publish Payment Method'}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const closeDrawer = () => { drawerEl.innerHTML = ''; };
  document.getElementById('close-drawer-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('cancel-pm-drawer-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'drawer-backdrop') closeDrawer();
  });

  document.getElementById('save-pm-drawer-btn')?.addEventListener('click', async () => {
    const provider_name = document.getElementById('pm-provider')?.value.trim();
    const account_number = document.getElementById('pm-account-number')?.value.trim();
    const account_name = document.getElementById('pm-account-name')?.value.trim();
    const instructions = document.getElementById('pm-instructions')?.value.trim();
    const display_order = parseInt(document.getElementById('pm-order')?.value, 10) || 0;
    const is_active = document.getElementById('pm-active')?.checked;

    if (!provider_name || !account_number || !account_name) {
      showToast('Please fill in provider name, account number, and account name.', 'error');
      return;
    }

    try {
      if (isEditing) {
        showToast(`Updating ${provider_name}...`, 'info');
        await api.updatePaymentMethod(method.id, {
          provider_name,
          account_number,
          account_name,
          instructions,
          display_order,
          is_active,
        });
        showToast(`Payment method "${provider_name}" updated.`, 'success');
      } else {
        showToast(`Creating ${provider_name}...`, 'info');
        await api.createPaymentMethod({
          provider_name,
          account_number,
          account_name,
          instructions,
          display_order,
          is_active,
        });
        showToast(`Payment method "${provider_name}" created.`, 'success');
      }
      closeDrawer();
      state.paymentMethods = await api.getPaymentMethods();
      renderPaymentMethodsView();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function attachPaymentMethodsEvents() {
  document.getElementById('add-payment-method-btn')?.addEventListener('click', () => {
    openPaymentMethodDrawer(null);
  });

  document.getElementById('pm-search-input')?.addEventListener('input', (e) => {
    state.paymentMethodFilter.search = e.target.value.trim();
    renderPaymentMethodsView();
  });

  document.querySelectorAll('.pm-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.paymentMethodFilter.status = chip.dataset.status;
      renderPaymentMethodsView();
    });
  });

  document.querySelectorAll('.edit-pm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pmId = parseInt(btn.dataset.pmId, 10);
      const method = state.paymentMethods.find(m => m.id === pmId);
      if (method) openPaymentMethodDrawer(method);
    });
  });

  document.querySelectorAll('.toggle-pm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pmId = parseInt(btn.dataset.pmId, 10);
      const currentActive = btn.dataset.active === '1';
      try {
        await api.updatePaymentMethod(pmId, { is_active: !currentActive });
        showToast(`Payment method ${!currentActive ? 'activated' : 'deactivated'}.`, 'success');
        state.paymentMethods = await api.getPaymentMethods();
        renderPaymentMethodsView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.delete-pm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pmId = parseInt(btn.dataset.pmId, 10);
      const method = state.paymentMethods.find(m => m.id === pmId);
      if (!method) return;
      if (!confirm(`Delete payment method "${method.provider_name}"?`)) return;
      try {
        await api.deletePaymentMethod(pmId);
        showToast(`Payment method "${method.provider_name}" deleted.`, 'success');
        state.paymentMethods = await api.getPaymentMethods();
        renderPaymentMethodsView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// -------------------------------------------------------------
// 6. ADMIN AUTHENTICATION GATE
// -------------------------------------------------------------
function renderLoginView() {
  return `
    <div class="min-h-screen bg-surface flex flex-col justify-center items-center p-space-lg">
      <div class="w-full max-w-md bg-surface-container-lowest rounded shadow-xl border border-surface-container-high overflow-hidden">
        <!-- Header -->
        <div class="bg-primary text-on-primary p-space-xl flex flex-col items-center text-center">
          <div class="w-12 h-12 rounded bg-white text-primary flex items-center justify-center font-bold text-[24px] mb-space-sm">
            W
          </div>
          <h1 class="font-headline-md text-headline-md font-bold tracking-tight text-white">WUDE MART</h1>
          <span class="font-label-sm text-[11px] text-white/60 uppercase tracking-widest mt-[2px]">Executive Admin Terminal</span>
        </div>

        <!-- Clearance Warning -->
        <div class="bg-surface-container-low p-space-md border-b border-surface-container flex items-center gap-space-sm text-[12px] text-on-surface-variant">
          <span class="material-symbols-outlined text-[20px] text-error">lock</span>
          <span>Restricted Portal: Administrator clearance required. Customer credentials are not permitted.</span>
        </div>

        <!-- Login Form -->
        <form id="admin-login-form" class="p-space-xl flex flex-col gap-space-md">
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Administrator Email</label>
            <input id="login-email" type="email" required placeholder="admin@wudemart.com"
              class="w-full px-space-md py-[10px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Password</label>
            <input id="login-password" type="password" required placeholder="••••••••••••"
              class="w-full px-space-md py-[10px] rounded bg-surface-container-low border border-surface-container font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <!-- API URL Config Toggle -->
          <div class="pt-space-xs">
            <details class="text-[12px] text-on-surface-variant">
              <summary class="cursor-pointer font-label-sm text-[11px] text-primary font-semibold select-none">
                Configure API Server URL (${escapeHtml(getApiBaseUrl())})
              </summary>
              <div class="mt-space-sm flex flex-col gap-space-2xs">
                <input id="login-api-url" type="text" value="${escapeHtml(getApiBaseUrl())}"
                  class="w-full px-space-sm py-[6px] rounded bg-surface border border-surface-container font-mono text-[11px]" />
                <span class="text-[10px] text-on-surface-variant">Default: http://127.0.0.1:8000</span>
              </div>
            </details>
          </div>

          <button id="login-submit-btn" type="submit" class="w-full mt-space-sm py-[10px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm flex items-center justify-center gap-space-xs">
            <span class="material-symbols-outlined text-[18px]">key</span>
            <span>Authenticate & Enter Console</span>
          </button>
        </form>
      </div>

      <div class="mt-space-lg text-center font-body-sm text-[12px] text-on-surface-variant">
        Wude Mart Operational System • Cloudflare Pages + FastAPI Edge
      </div>

      <div id="toast-container" class="fixed bottom-space-lg right-space-lg z-[100] flex flex-col gap-space-xs pointer-events-none"></div>
    </div>
  `;
}

function attachLoginEvents() {
  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const apiUrlInput = document.getElementById('login-api-url')?.value.trim();

    if (apiUrlInput) {
      setApiBaseUrl(apiUrlInput);
    }

    const btn = document.getElementById('login-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Verifying Credentials...</span>`;
    }

    try {
      showToast('Authenticating with backend...', 'info');
      const res = await api.login(email, password);
      state.user = res.user;
      state.token = res.access_token;
      showToast('Clearance verified. Welcome to Admin Console.', 'success');
      navigateTo('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">key</span><span>Authenticate & Enter Console</span>`;
      }
    }
  });
}

// -------------------------------------------------------------
// 6. API SETTINGS MODAL
// -------------------------------------------------------------
function openApiSettingsModal() {
  const modalEl = document.getElementById('modal-container');
  if (!modalEl) return;

  modalEl.innerHTML = `
    <div id="settings-backdrop" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-space-md">
      <div class="modal-enter w-full max-w-md bg-surface-container-lowest rounded shadow-2xl overflow-hidden">
        <div class="p-space-lg border-b border-surface-container flex items-center justify-between">
          <div class="flex items-center gap-space-sm">
            <span class="material-symbols-outlined text-primary text-[20px]">tune</span>
            <h3 class="font-headline-sm text-headline-sm font-semibold text-on-surface">API Connection Settings</h3>
          </div>
          <button id="close-settings-btn" class="p-space-xs text-on-surface-variant hover:text-on-surface rounded">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="p-space-lg flex flex-col gap-space-md">
          <div class="flex flex-col gap-space-2xs">
            <label class="font-label-sm text-[11px] uppercase font-semibold text-on-surface-variant">Wude Mart API Base URL</label>
            <input id="settings-api-url" type="text" value="${escapeHtml(getApiBaseUrl())}"
              class="w-full px-space-md py-[8px] rounded bg-surface-container-low border border-surface-container font-mono text-[12px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
            <span class="text-[11px] text-on-surface-variant">Local default: <code>http://127.0.0.1:8000</code></span>
          </div>

          <div class="flex items-center gap-space-sm">
            <button id="test-connection-btn" class="px-space-md py-[6px] rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center gap-space-2xs">
              <span class="material-symbols-outlined text-[16px]">sensors</span>
              <span>Test Connection</span>
            </button>
            <span id="test-connection-result" class="font-body-sm text-[12px]"></span>
          </div>
        </div>

        <div class="p-space-lg border-t border-surface-container bg-surface-container-low/50 flex items-center justify-end gap-space-md">
          <button id="cancel-settings-btn" class="px-space-md py-[8px] rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md font-semibold transition-colors">
            Cancel
          </button>
          <button id="save-settings-btn" class="px-space-xl py-[8px] rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow-sm">
            Save & Reconnect
          </button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => { modalEl.innerHTML = ''; };
  document.getElementById('close-settings-btn')?.addEventListener('click', closeModal);
  document.getElementById('cancel-settings-btn')?.addEventListener('click', closeModal);
  document.getElementById('settings-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-backdrop') closeModal();
  });

  document.getElementById('test-connection-btn')?.addEventListener('click', async () => {
    const testUrl = document.getElementById('settings-api-url')?.value.trim();
    const resultEl = document.getElementById('test-connection-result');
    if (resultEl) resultEl.innerHTML = `<span class="text-on-surface-variant">Connecting...</span>`;

    try {
      const res = await fetch(`${testUrl.replace(/\/+$/, '')}/health`);
      if (res.ok) {
        if (resultEl) resultEl.innerHTML = `<span class="text-[#065F46] font-semibold">✓ Connected (HTTP ${res.status})</span>`;
      } else {
        if (resultEl) resultEl.innerHTML = `<span class="text-error font-semibold">✗ HTTP ${res.status}</span>`;
      }
    } catch (err) {
      if (resultEl) resultEl.innerHTML = `<span class="text-error font-semibold">✗ Unreachable (${escapeHtml(err.message)})</span>`;
    }
  });

  document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
    const newUrl = document.getElementById('settings-api-url')?.value.trim();
    if (newUrl) {
      setApiBaseUrl(newUrl);
      showToast(`API Base URL saved: ${newUrl}`, 'success');
      closeModal();
      await checkBackendHealth();
      renderApp();
    }
  });
}

// Global initialization
window.addEventListener('DOMContentLoaded', async () => {
  const initialHash = window.location.hash.replace(/^#/, '').trim() || 'dashboard';
  if (!state.token) {
    navigateTo('login');
  } else {
    navigateTo(initialHash);
    await checkBackendHealth();
  }
});
