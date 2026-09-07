/**
 * =========================================================================
 * نظام إدارة ورشة الحلويات والمخزن - ملف المعالجة البرمجية الكامل (app.js)
 * =========================================================================
 */

// الرابط الخاص بتطبيق Google Apps Script المنشور
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzpODYGke1q7kT0ddetFt3nVBLQwbQyKehzOjk6JykK4m5PttecHpl3bn6hBqbn3bI/exec";

// متغيرات الذاكرة المؤقتة للبيانات والمستخدم الحالي
let currentUser = null;
let productsCache = [];
let customersCache = [];

// =========================================================================
// [1] دوال عامة: مؤشر التحميل، التنبيهات، والتنقل بين الشاشات
// =========================================================================

// إظهار أو إخفاء مؤشر التحميل (Spinner)
function showLoader(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

// التبديل بين شاشات التطبيق
function showView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('view-active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('view-active');

  if (viewId === 'view-add-product') {
    populateProductDatalist();
  }
}

// دالة الرجوع المباشر للوحة التحكم الرئيسية
function showDashboard() {
  showView('view-dashboard');
}

// عرض رسائل التنبيه
function showAlert(message) {
  alert(message);
}

// دالة موحدة للتواصل مع Google Apps Script عبر GET
async function apiCall(action, params = {}) {
  showLoader(true);
  try {
    const url = new URL(SCRIPT_URL);
    url.searchParams.append('action', action);
    Object.keys(params).forEach(key => {
      const val = typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key];
      url.searchParams.append(key, val);
    });

    const response = await fetch(url);
    const data = await response.json();
    showLoader(false);
    return data;
  } catch (err) {
    showLoader(false);
    console.error("API Error:", err);
    showAlert("خطأ أثناء الاتصال بقاعدة البيانات!");
    return null;
  }
}

// =========================================================================
// [2] نظام تسجيل الدخول والخروج والتحميل الأولي
// =========================================================================

async function handleLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  if (!user || !pass) {
    showAlert("يرجى إدخال اسم المستخدم وكلمة المرور!");
    return;
  }

  const res = await apiCall('login', { user: user, pass: pass });
  if (res && res.success) {
    currentUser = res;
    const badge = document.getElementById('user-badge');
    if (badge) badge.innerText = `${res.user} (${res.role})`;
    showView('view-dashboard');
    preloadData();
  } else {
    showAlert(res ? res.message : "فشل تسجيل الدخول!");
  }
}

function logout() {
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showView('view-login');
}

// تحميل المنتجات والزبائن للذاكرة المؤقتة
async function preloadData() {
  try {
    const [products, customers] = await Promise.all([
      apiCall('getProducts'),
      apiCall('getCustomers')
    ]);
    if (products) productsCache = products;
    if (customers) customersCache = customers;
  } catch (e) {
    console.error("Error preloading:", e);
  }
}

// =========================================================================
// [3] إدارة المنتجات (إضافة / تعديل / التحقق)
// =========================================================================

function populateProductDatalist() {
  const datalist = document.getElementById('products-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  productsCache.forEach(p => {
    const option = document.createElement('option');
    option.value = p.name;
    datalist.appendChild(option);
  });
}

function checkProductExists(val) {
  const name = val.trim();
  const statusMsg = document.getElementById('product-status-msg');
  const btnSave = document.getElementById('btn-save-prod');
  const wholesaleInput = document.getElementById('p-wholesale');
  const retailInput = document.getElementById('p-retail');

  if (!name) {
    statusMsg.innerText = '';
    return;
  }

  const found = productsCache.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (found) {
    statusMsg.style.color = '#e67e22';
    statusMsg.innerHTML = `<i class="fa-solid fa-circle-info"></i> هذا المنتج مسجل مسبقاً (المتوفر: ${found.currentStock}).`;
    wholesaleInput.value = found.wholesalePrice;
    retailInput.value = found.retailPrice;
    btnSave.innerHTML = '<i class="fa-solid fa-sync"></i> تعديل بيانات المنتج';
  } else {
    statusMsg.style.color = '#27ae60';
    statusMsg.innerHTML = `<i class="fa-solid fa-check"></i> منتج جديد سيتم إنشاؤه في كافة الجداول`;
    btnSave.innerHTML = '<i class="fa-solid fa-save"></i> حفظ كمنتج جديد';
  }
}

async function submitProduct() {
  const name = document.getElementById('p-name').value.trim();
  const qty = Number(document.getElementById('p-qty').value) || 0;
  const wholesale = Number(document.getElementById('p-wholesale').value) || 0;
  const retail = Number(document.getElementById('p-retail').value) || 0;

  if (!name) {
    showAlert("يرجى كتابة اسم المنتج!");
    return;
  }

  const res = await apiCall('addProduct', {
    name: name,
    quantity: qty,
    wholesalePrice: wholesale,
    retailPrice: retail
  });

  if (res && res.success) {
    showAlert(res.message);
    document.getElementById('p-name').value = '';
    document.getElementById('p-qty').value = '';
    document.getElementById('p-wholesale').value = '';
    document.getElementById('p-retail').value = '';
    document.getElementById('product-status-msg').innerText = '';
    
    await preloadData();
    showView('view-dashboard');
  }
}

// =========================================================================
// [4] إدارة الزبائن والموزعين
// =========================================================================

async function submitCustomer() {
  const name = document.getElementById('c-name').value.trim();
  const credit = Number(document.getElementById('c-credit').value) || 0;

  if (!name) {
    showAlert("يرجى كتابة اسم الزبون!");
    return;
  }

  const res = await apiCall('addCustomer', { name: name, credit: credit });
  if (res && res.success) {
    showAlert(res.message);
    document.getElementById('c-name').value = '';
    document.getElementById('c-credit').value = '';
    await preloadData();
    showView('view-dashboard');
  }
}

// =========================================================================
// [5] واجهة الوصل والعمليات المتنوعة (مع منع تكرار السلع في الأسطر)
// =========================================================================

async function openInvoiceView() {
  await preloadData();

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inv-date').value = today;
  document.getElementById('inv-num').value = '';
  document.getElementById('inv-credit').value = '0';

  const custSelect = document.getElementById('inv-customer');
  custSelect.innerHTML = '<option value="">-- اختر الزبون --</option>';
  customersCache.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.innerText = c.name;
    custSelect.appendChild(opt);
  });

  const container = document.getElementById('invoice-items-container');
  container.innerHTML = '';
  addInvoiceItemRow();
  addInvoiceItemRow();
  addInvoiceItemRow();

  showView('view-invoice-ops');
}

// =========================================================================
// عند اختيار زبون: جلب الكريدي وتوليد رقم الوصل التسلسلي المركب (2026 + رقم الزبون + رقم الفاتورة)
// =========================================================================
function onCustomerSelect(customerName) {
  const creditInput = document.getElementById('inv-credit');
  const receiptInput = document.getElementById('inv-num');

  if (!customerName) {
    creditInput.value = '0 دج';
    if (receiptInput) receiptInput.value = '';
    return;
  }

  // 1. البحث عن موقع وترتيب الزبون في القائمة
  const custIndex = customersCache.findIndex(c => c.name === customerName);
  const found = customersCache[custIndex];

  if (found && custIndex !== -1) {
    // 2. إظهار الكريدي القديم
    creditInput.value = Number(found.oldCredit || 0).toLocaleString() + ' دج';

    // 3. استخراج السنة الحالية (2026)
    const currentYear = new Date().getFullYear();

    // 4. تسلسل الزبون من 3 أرقام (الزبون الأول 001، الثالث 003، وهكذا)
    const customerCode = String(custIndex + 1).padStart(3, '0');

    // 5. رقم الفاتورة التسلسلي الخاص بالزبون (001 كافتراضي إذا لم تكن هناك فواتير سابقة)
    let invoiceSeq = "001";
    if (found.nextInvoiceNumber && found.nextInvoiceNumber.length >= 10) {
      invoiceSeq = found.nextInvoiceNumber.slice(-3);
    }

    // 6. تركيب وتعبئة رقم الوصل المركب (مثال: 2026001001)
    const fullInvoiceNum = `${currentYear}${customerCode}${invoiceSeq}`;
    if (receiptInput) {
      receiptInput.value = fullInvoiceNum;
    }
  } else {
    creditInput.value = '0 دج';
    if (receiptInput) receiptInput.value = '';
  }
}
function getSelectedProductsList(excludeRowId = null) {
  const selected = [];
  document.querySelectorAll('#invoice-items-container > div').forEach(row => {
    if (row.id !== excludeRowId) {
      const select = row.querySelector('.item-select');
      if (select && select.value) {
        selected.push(select.value);
      }
    }
  });
  return selected;
}

function refreshAllItemDropdowns() {
  document.querySelectorAll('#invoice-items-container > div').forEach(row => {
    const select = row.querySelector('.item-select');
    if (!select) return;

    const currentVal = select.value;
    const takenInOtherRows = getSelectedProductsList(row.id);

    select.innerHTML = '<option value="">-- اختر الحلوى --</option>';

    productsCache.forEach(p => {
      if (!takenInOtherRows.includes(p.name)) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.innerText = p.name;
        opt.setAttribute('data-price', p.wholesalePrice);
        opt.setAttribute('data-stock', p.currentStock);
        if (p.name === currentVal) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }
    });

    if (currentVal && takenInOtherRows.includes(currentVal)) {
      select.value = '';
      row.querySelector('.item-stock-badge').innerText = 'مخزن: 0';
      row.querySelector('.item-price').value = '';
      row.querySelector('.item-qty').value = '';
    }
  });
}

function addInvoiceItemRow() {
  const container = document.getElementById('invoice-items-container');
  const rowId = 'item-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.style = "display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap: 10px; align-items: center; margin-bottom: 10px; background: #fdfefe; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;";

  rowDiv.innerHTML = `
    <div>
      <select class="form-control item-select" onchange="onItemRowSelect('${rowId}', this)">
        <option value="" selected>-- اختر الحلوى --</option>
      </select>
    </div>
    <div>
      <span class="item-stock-badge" style="color: #e74c3c; font-size: 13px; font-weight: bold;">مخزن: 0</span>
    </div>
    <div>
      <input type="number" class="form-control item-price" placeholder="السعر" style="font-weight: bold;">
    </div>
    <div>
      <input type="number" class="form-control item-qty" placeholder="الكمية" style="font-weight: bold;">
    </div>
    <div>
      <button class="btn-action btn-secondary" style="padding: 6px 10px; background: #e74c3c;" onclick="removeInvoiceItemRow('${rowId}')">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `;

  container.appendChild(rowDiv);
  refreshAllItemDropdowns();
}

function onItemRowSelect(rowId, selectEl) {
  const row = document.getElementById(rowId);
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  
  if (selectEl.value) {
    const stock = selectedOpt.getAttribute('data-stock') || 0;
    const price = selectedOpt.getAttribute('data-price') || 0;

    row.querySelector('.item-stock-badge').innerText = `مخزن: ${stock}`;
    row.querySelector('.item-price').value = price > 0 ? price : '';
  } else {
    row.querySelector('.item-stock-badge').innerText = `مخزن: 0`;
    row.querySelector('.item-price').value = '';
    row.querySelector('.item-qty').value = '';
  }

  refreshAllItemDropdowns();
}

function removeInvoiceItemRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    refreshAllItemDropdowns();
  }
}

async function submitInvoiceOp(type) {
  const date = document.getElementById('inv-date').value;
  const receipt = document.getElementById('inv-num').value.trim();
  const customer = document.getElementById('inv-customer').value;

  if (type === 'distribution' && !customer) {
    showAlert("يرجى اختيار الزبون أولاً لعملية التوزيع!");
    return;
  }

  const items = [];
  document.querySelectorAll('#invoice-items-container > div').forEach(row => {
    const select = row.querySelector('.item-select');
    const pName = select.value;
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    const price = Number(row.querySelector('.item-price').value) || 0;

    if (pName && qty > 0) {
      items.push({ name: pName, qty: qty, price: price });
    }
  });

  if (items.length === 0) {
    showAlert("يرجى تحديد منتج واحد على الأقل مع كتابة الكمية!");
    return;
  }

  const payload = {
    type: type,
    date: date,
    customer: customer,
    receipt: receipt,
    items: items
  };

  const res = await apiCall('saveInvoiceOperation', { data: payload });
  if (res && res.success) {
    showAlert(res.message);
    await preloadData();
    showView('view-dashboard');
  }
}

// =========================================================================
// [6] واجهة جرد الباقي وحساب المباع
// =========================================================================

async function openInventoryView() {
  await preloadData();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invt-date').value = today;
  document.getElementById('invt-total').value = '0 دج';

  const custSelect = document.getElementById('invt-customer');
  custSelect.innerHTML = '<option value="">-- اختر الزبون --</option>';
  customersCache.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.innerText = c.name;
    custSelect.appendChild(opt);
  });

  document.getElementById('inventory-tbody').innerHTML = '<tr><td colspan="6">اختر الزبون لعرض السلع</td></tr>';
  showView('view-inventory');
}

function loadCustomerDeliveredStock(customerName) {
  if (!customerName) return;
  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = '';

  productsCache.forEach((p, idx) => {
    tbody.innerHTML += `
      <tr id="invt-row-${idx}">
        <td style="font-weight: bold;">${p.name}</td>
        <td><input type="number" class="form-control delivered-qty" placeholder="0" oninput="calcRowSales(${idx})"></td>
        <td><input type="number" class="form-control remaining-qty" placeholder="0" oninput="calcRowSales(${idx})"></td>
        <td><input type="number" class="form-control sold-qty" readonly style="background: #f1f5f9; font-weight: bold;" value="0"></td>
        <td><input type="number" class="form-control row-price" value="${p.wholesalePrice}" oninput="calcRowSales(${idx})"></td>
        <td><span class="row-total" style="font-weight: bold; color: var(--info);">0 دج</span></td>
      </tr>
    `;
  });
}

function calcRowSales(idx) {
  const row = document.getElementById(`invt-row-${idx}`);
  const delivered = Number(row.querySelector('.delivered-qty').value) || 0;
  const remaining = Number(row.querySelector('.remaining-qty').value) || 0;
  const price = Number(row.querySelector('.row-price').value) || 0;

  const sold = Math.max(0, delivered - remaining);
  row.querySelector('.sold-qty').value = sold;

  const total = sold * price;
  row.querySelector('.row-total').innerText = total.toLocaleString() + ' دج';

  calcGrandTotal();
}

function calcGrandTotal() {
  let grand = 0;
  document.querySelectorAll('#inventory-tbody tr').forEach(tr => {
    const sold = Number(tr.querySelector('.sold-qty')?.value) || 0;
    const price = Number(tr.querySelector('.row-price')?.value) || 0;
    grand += (sold * price);
  });
  document.getElementById('invt-total').value = grand.toLocaleString() + ' دج';
}

async function submitInventoryAndSales() {
  const date = document.getElementById('invt-date').value;
  const customer = document.getElementById('invt-customer').value;

  if (!customer) {
    showAlert("يرجى تحديد الزبون أولاً!");
    return;
  }

  const items = [];
  document.querySelectorAll('#inventory-tbody tr').forEach(tr => {
    const pName = tr.cells[0]?.innerText;
    const remaining = Number(tr.querySelector('.remaining-qty')?.value) || 0;
    const sold = Number(tr.querySelector('.sold-qty')?.value) || 0;
    const price = Number(tr.querySelector('.row-price')?.value) || 0;

    if (pName && (sold > 0 || remaining > 0)) {
      items.push({ name: pName, remaining: remaining, sold: sold, price: price });
    }
  });

  if (items.length === 0) {
    showAlert("لم يتم إدخال أي كميات مباعة أو متبقية!");
    return;
  }

  const res = await apiCall('saveInventoryAndSales', {
    data: { date: date, customer: customer, items: items }
  });

  if (res && res.success) {
    showAlert(res.message);
    showView('view-dashboard');
  }
}

// =========================================================================
// [7] إدارة وحساب تكلفة الإنتاج وبناء الجدول الديناميكي (القسم الجديد)
// =========================================================================

// تهيئة وفتح شاشة حساب تكلفة الإنتاج
function showProductionCostView() {
  document.getElementById('cost-product-name').value = '';
  document.getElementById('pkg-total').value = '';
  document.getElementById('pkg-rem').value = '';
  document.getElementById('pkg-price').value = '';

  const container = document.getElementById('cost-ingredients-container');
  container.innerHTML = '';
  
  // إضافة 3 أسطر للمكونات كبداية افتراضية
  addIngredientRow();
  addIngredientRow();
  addIngredientRow();

  showView('view-cost-calculation');
}

// إضافة سطر مكون ديناميكي جديد
function addIngredientRow() {
  const container = document.getElementById('cost-ingredients-container');
  const row = document.createElement('div');
  row.className = 'cost-row';
  row.style = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap: 10px; margin-bottom: 10px; align-items: center;';
  
  row.innerHTML = `
    <input type="text" class="form-control ing-name" placeholder="اسم المكون (فرينة، سكر...)">
    <input type="number" class="form-control ing-total" placeholder="الكمية الكلية" style="text-align: center;">
    <input type="number" class="form-control ing-rem" placeholder="الباقي" style="text-align: center;">
    <input type="number" class="form-control ing-price" placeholder="سعر الوحدة (دج)" style="text-align: center;">
    <button type="button" class="btn-action" style="background: #e74c3c; height: 38px;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  container.appendChild(row);
}

// تجميع البيانات وإرسالها لحفظ الجدول في شيت «تكلفة الإنتاج» وإدراج المنتج
async function submitProductionCost() {
  const pName = document.getElementById('cost-product-name').value.trim();
  if (!pName) {
    showAlert("يرجى كتابة اسم المنتج أولاً!");
    return;
  }

  // تجميع المكونات المدخلة
  const rows = document.querySelectorAll('#cost-ingredients-container .cost-row');
  const ingredients = [];

  rows.forEach(r => {
    const name = r.querySelector('.ing-name').value.trim();
    const totalQty = r.querySelector('.ing-total').value;
    const remQty = r.querySelector('.ing-rem').value;
    const unitPrice = r.querySelector('.ing-price').value;

    if (name) {
      ingredients.push({
        name: name,
        totalQty: Number(totalQty) || 0,
        remQty: Number(remQty) || 0,
        unitPrice: Number(unitPrice) || 0
      });
    }
  });

  // تجميع بيانات سطر التعليب الإجباري
  const pkgTotal = document.getElementById('pkg-total').value;
  const pkgRem = document.getElementById('pkg-rem').value;
  const pkgPrice = document.getElementById('pkg-price').value;

  const packaging = {
    totalQty: Number(pkgTotal) || 0,
    remQty: Number(pkgRem) || 0,
    unitPrice: Number(pkgPrice) || 0
  };

  const payload = {
    productName: pName,
    ingredients: ingredients,
    packaging: packaging
  };

  // إرسال البيانات للواجهة الخلفية
  const res = await apiCall('saveProductionCost', { data: payload });
  if (res && res.success) {
    showAlert(res.message);
    await preloadData();
    showView('view-dashboard');
  }
}

// =========================================================================
// [8] عرض حالة المخزن الحالية
// =========================================================================

async function loadStockTable() {
  const data = await apiCall('getProducts');
  if (!data) return;

  productsCache = data;
  const tbody = document.getElementById('stock-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">لا توجد منتجات مسجلة</td></tr>';
  } else {
    data.forEach(p => {
      tbody.innerHTML += `
        <tr>
          <td>${p.id}</td>
          <td style="font-weight: bold;">${p.name}</td>
          <td>${Number(p.wholesalePrice).toLocaleString()} دج</td>
          <td>${Number(p.retailPrice).toLocaleString()} دج</td>
          <td><strong style="color: var(--success); font-size: 16px;">${p.currentStock}</strong></td>
        </tr>
      `;
    });
  }
  showView('view-stock-table');
}
