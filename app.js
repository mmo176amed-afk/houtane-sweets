/**
 * =========================================================================
 * نظام إدارة ورشة الحلويات والمخزن - ملف المعالجة البرمجية الشامل (app.js)
 * متوافق كلياً مع قاعدة بيانات Supabase (PostgreSQL) ومستضاف عبر GitHub Pages
 * =========================================================================
 */

// =========================================================================
// [1] إعداد الاتصال بقاعدة بيانات Supabase
// =========================================================================

// الرابط المباشر لمشروعك على Supabase
const SUPABASE_URL = 'https://ntvmrdwwnjqunsagritz.supabase.co';

// المفتاح العام الآمن (Anon / Publishable Key) الخاص بالمشروع
const SUPABASE_KEY = 'sb_publishable_DQ6yB5s9oLL_jxiWZKB9gQ_Pa0uwIRW';

// تهيئة عميل الاتصال بقاعدة البيانات
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Client Connected Successfully!");

// =========================================================================
// [2] متغيرات الذاكرة المؤقتة العامة (Global Cache Variables)
// =========================================================================

// تخزين بيانات المستخدم المسجل حالياً (الاسم والصلاحية)
let currentUser = null;

// مصفوفة الذاكرة المؤقتة لقائمة المنتجات والمخزون
let productsCache = [];

// مصفوفة الذاكرة المؤقتة لقائمة الزبائن والموزعين
let customersCache = [];

// =========================================================================
// [3] دوال التحكم العامة: مؤشر التحميل، التنبيهات، والتنقل بين الواجهات
// =========================================================================

/**
 * إظهار أو إخفاء مؤشر التحميل الدائري (Spinner Loader)
 * @param {boolean} show - القيمة true للإظهار و false للإخفاء
 */
function showLoader(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

/**
 * التبديل بين شاشات وواجهات التطبيق المختلفة
 * @param {string} viewId - المعرف (ID) الخاص بالواجهة المراد فتحها
 */
function showView(viewId) {
  // إخفاء كل الواجهات النشطة
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('view-active'));
  
  // إظهار الواجهة المطلوبة
  const target = document.getElementById(viewId);
  if (target) target.classList.add('view-active');

  // في حال فتح شاشة إضافة منتج، نقوم بتحديث القائمة المقترحة
  if (viewId === 'view-add-product') {
    populateProductDatalist();
  }
}

/**
 * دالة الرجوع المباشر إلى لوحة التحكم الرئيسية
 */
function showDashboard() {
  showView('view-dashboard');
}

/**
 * عرض رسائل التنبيه للمستخدم
 * @param {string} message - نص الرسالة
 */
function showAlert(message) {
  alert(message);
}

// =========================================================================
// [4] نظام تسجيل الدخول، تسجيل الخروج، وجلب البيانات الأولية
// =========================================================================

/**
 * معالجة تسجيل الدخول والتحقق من الصلاحيات
 */
async function handleLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  // التحقق من ملء الحقول
  if (!user || !pass) {
    showAlert("يرجى إدخال اسم المستخدم وكلمة المرور!");
    return;
  }

  // التحقق من مطابقة بيانات الدخول للمدير
  if (user === 'admin' && pass === '1234') {
    currentUser = { user: 'admin', role: 'Admin' };
    
    // عرض شارة المستخدم المسجل في أعلى الصفحة
    const badge = document.getElementById('user-badge');
    if (badge) badge.innerText = `${currentUser.user} (${currentUser.role})`;
    
    // الانتقال للوحة التحكم وبدء جلب البيانات
    showView('view-dashboard');
    await preloadData();
  } else {
    showAlert("اسم المستخدم أو كلمة المرور غير صحيحة!");
  }
}

/**
 * تسجيل الخروج وإعادة تعيين الحقول إلى الشاشة الافتتاحية
 */
function logout() {
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showView('view-login');
}

/**
 * جلب المنتجات (من جدولي المنتجات وتكاليف الإنتاج معاً) والزبائن إلى الذاكرة
 */
async function preloadData() {
  showLoader(true);
  try {
    // 1. جلب المنتجات المسجلة في جدول المنتجات الرئيسي products
    const { data: prods, error: pErr } = await db.from('products').select('*').order('id', { ascending: true });
    if (pErr) throw pErr;

    // 2. جلب كافة أسماء المنتجات الموجودة في جدول تكلفة الإنتاج production_costs
    const { data: costProds } = await db.from('production_costs').select('product_name');
    
    // بناء مصفوفة المنتجات الأساسية الموحدة
    const mainList = (prods || []).map(p => ({
      id: p.id,
      name: (p.name || '').trim(),
      currentStock: Number(p.current_stock) || 0,
      wholesalePrice: Number(p.wholesale_price) || 0,
      retailPrice: Number(p.retail_price) || 0
    }));

    // دمج أسماء المنتجات من جدول التكلفة تلقائياً إن لم تكن مسجلة بعد في products
    if (costProds && costProds.length > 0) {
      const existingNames = new Set(mainList.map(p => p.name.toLowerCase()));
      costProds.forEach(cp => {
        const cName = (cp.product_name || '').trim();
        if (cName && !existingNames.has(cName.toLowerCase())) {
          existingNames.add(cName.toLowerCase());
          mainList.push({
            id: null,
            name: cName,
            currentStock: 0,
            wholesalePrice: 0,
            retailPrice: 0
          });
        }
      });
    }

    // حفظ القائمة الشاملة في الذاكرة المؤقتة
    productsCache = mainList;

    // 3. جلب قائمة الزبائن والموزعين من جدول customers
    const { data: custs, error: cErr } = await db.from('customers').select('*').order('id', { ascending: true });
    if (cErr) throw cErr;

    customersCache = (custs || []).map(c => ({
      id: c.id,
      name: c.name,
      oldCredit: Number(c.old_credit) || 0,
      lastInvoiceSeq: Number(c.last_invoice_seq) || 0
    }));

    // تحديث القوائم المنسدلة في الواجهات
    populateProductDatalist();
  } catch (e) {
    console.error("Error preloading data:", e);
    showAlert("خطأ أثناء جلب البيانات من قاعدة البيانات!");
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [5] إدارة المنتجات (إضافة / تعديل / التحقق الفوري من التوفر)
// =========================================================================

/**
 * ملء القائمة المقترحة للمنتجات (datalist) عند الكتابة للبحث السريع
 */
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

/**
 * التحقق الفوري أثناء كتابة اسم المنتج:
 * - إذا كان مسجلاً مسبقاً: يجلب أسعاره ومخزونه ويحول الزر إلى "تعديل".
 * - إذا كان جديداً: يحول الزر إلى "حفظ كمنتج جديد".
 * @param {string} val - النص المكتوب في حقل اسم المنتج
 */
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

/**
 * حفظ أو تعديل المنتج وإرسال بياناته إلى Supabase
 */
async function submitProduct() {
  const name = document.getElementById('p-name').value.trim();
  const qty = Number(document.getElementById('p-qty').value) || 0;
  const wholesale = Number(document.getElementById('p-wholesale').value) || 0;
  const retail = Number(document.getElementById('p-retail').value) || 0;

  if (!name) {
    showAlert("يرجى كتابة اسم المنتج!");
    return;
  }

  showLoader(true);
  try {
    const found = productsCache.find(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== null);
    let error;

    if (found) {
      // تعديل منتج موجود مسبقاً في جدول products
      const res = await db.from('products').update({
        current_stock: found.currentStock + qty,
        wholesale_price: wholesale,
        retail_price: retail
      }).eq('id', found.id);
      error = res.error;
    } else {
      // إدراج منتج جديد كلياً
      const res = await db.from('products').insert([{
        name: name,
        current_stock: qty,
        wholesale_price: wholesale,
        retail_price: retail
      }]);
      error = res.error;
    }

    if (error) throw error;

    showAlert("تم حفظ المنتج بنجاح في قاعدة البيانات!");
    
    // تصفير حقول الإدخال
    document.getElementById('p-name').value = '';
    document.getElementById('p-qty').value = '';
    document.getElementById('p-wholesale').value = '';
    document.getElementById('p-retail').value = '';
    document.getElementById('product-status-msg').innerText = '';

    // تحديث البيانات والرجوع للوحة التحكم
    await preloadData();
    showView('view-dashboard');
  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ المنتج: " + err.message);
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [6] إدارة الزبائن والموزعين
// =========================================================================

/**
 * تسجيل زبون أو موزع جديد مع رصيد الديون السابق (الكريدي)
 */
async function submitCustomer() {
  const name = document.getElementById('c-name').value.trim();
  const credit = Number(document.getElementById('c-credit').value) || 0;

  if (!name) {
    showAlert("يرجى كتابة اسم الزبون!");
    return;
  }

  showLoader(true);
  try {
    const { error } = await db.from('customers').insert([{
      name: name,
      old_credit: credit,
      last_invoice_seq: 0
    }]);

    if (error) throw error;

    showAlert("تم تسجيل الزبون بنجاح!");
    document.getElementById('c-name').value = '';
    document.getElementById('c-credit').value = '';
    await preloadData();
    showView('view-dashboard');
  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل الزبون: " + err.message);
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [7] واجهة الوصل والعمليات المتنوعة (توزيع، إنتاج، تالف، هدايا، مرتجع)
// =========================================================================

/**
 * تهيئة وفتح شاشة تحرير الفاتورة / الوصل الجديد
 */
async function openInvoiceView() {
  await preloadData();

  // ضبط تاريخ اليوم تلقائياً
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inv-date').value = today;
  document.getElementById('inv-num').value = '';
  document.getElementById('inv-credit').value = '0 دج';

  // تعبئة القائمة المنسدلة للزبائن
  const custSelect = document.getElementById('inv-customer');
  custSelect.innerHTML = '<option value="">-- اختر الزبون --</option>';
  customersCache.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.innerText = c.name;
    custSelect.appendChild(opt);
  });

  // إضافة 3 أسطر للمنتجات كبداية
  const container = document.getElementById('invoice-items-container');
  container.innerHTML = '';
  addInvoiceItemRow();
  addInvoiceItemRow();
  addInvoiceItemRow();

  showView('view-invoice-ops');
}

/**
 * عند اختيار زبون: 
 * 1. جلب الكريدي القديم الخاص به.
 * 2. توليد رقم الوصل التسلسلي المركب آلياً: (السنة الحالية + كود الزبون + رقم الوصل).
 * @param {string} customerName - اسم الزبون المختار
 */
function onCustomerSelect(customerName) {
  const creditInput = document.getElementById('inv-credit');
  const receiptInput = document.getElementById('inv-num');

  if (!customerName) {
    creditInput.value = '0 دج';
    if (receiptInput) receiptInput.value = '';
    return;
  }

  const custIndex = customersCache.findIndex(c => c.name === customerName);
  const found = customersCache[custIndex];

  if (found && custIndex !== -1) {
    // إظهار الكريدي القديم
    creditInput.value = Number(found.oldCredit || 0).toLocaleString() + ' دج';

    // استخراج السنة الحالية
    const currentYear = new Date().getFullYear();

    // ترميز الزبون من 3 خانات (مثال: 001، 002)
    const customerCode = String(custIndex + 1).padStart(3, '0');

    // رقم تسلسل فاتورة الزبون القادمة من 3 خانات
    const invoiceSeq = String((found.lastInvoiceSeq || 0) + 1).padStart(3, '0');

    // تركيب رقم الوصل المركب (مثال: 2026001001)
    const fullInvoiceNum = `${currentYear}${customerCode}${invoiceSeq}`;
    if (receiptInput) {
      receiptInput.value = fullInvoiceNum;
    }
  } else {
    creditInput.value = '0 دج';
    if (receiptInput) receiptInput.value = '';
  }
}

/**
 * جلب قائمة أسماء السلع المحددة مسبقاً في الأسطر الأخرى لمنع تكرارها
 * @param {string|null} excludeRowId - معرف السطر الحالي لتجاوزه
 */
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

/**
 * تحديث القوائم المنسدلة للسلع وحذف أي سلعة تم اختيارها في سطر آخر
 */
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

    // إذا اختار المستخدم سلعة مكررة يتم تفريغ الخانة
    if (currentVal && takenInOtherRows.includes(currentVal)) {
      select.value = '';
      row.querySelector('.item-stock-badge').innerText = 'مخزن: 0';
      row.querySelector('.item-price').value = '';
      row.querySelector('.item-qty').value = '';
    }
  });
}

/**
 * إضافة سطر جديد للفاتورة بشكل ديناميكي (مع تفعيل الإضافة التلقائية عند آخر خانة)
 */
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
      <input type="number" class="form-control item-qty" placeholder="الكمية" style="font-weight: bold;" oninput="handleAutoAddInvoiceRow('${rowId}')">
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

/**
 * التحقق من الكتابة في خانة الكمية للسطر الأخير، وإضافة سطر جديد تلقائياً
 * @param {string} currentRowId - معرف السطر الحالي
 */
function handleAutoAddInvoiceRow(currentRowId) {
  const container = document.getElementById('invoice-items-container');
  const allRows = container.querySelectorAll(':scope > div');
  
  if (allRows.length === 0) return;

  // التحقق إن كان السطر الحالي هو السطر الأخير في القائمة
  const lastRow = allRows[allRows.length - 1];
  if (lastRow.id === currentRowId) {
    const qtyInput = lastRow.querySelector('.item-qty');
    // إذا تمت كتابة كمية أكبر من صفر، يضاف سطر جديد فوراً
    if (qtyInput && Number(qtyInput.value) > 0) {
      addInvoiceItemRow();
    }
  }
}
/**
 * عند اختيار سلعة داخل سطر الفاتورة: وضع السعر والمخزون الحالي تلقائياً
 */
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

/**
 * حذف سطر من الفاتورة
 */
function removeInvoiceItemRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    refreshAllItemDropdowns();
  }
}

/**
 * حفظ عملية الفاتورة (توزيع، إنتاج، تالف، هدايا، مرتجع) وتحديث المخزون وتسلسل الفواتير
 * @param {string} type - نوع العملية ('distribution', 'produced', 'damaged', 'gifts', 'returned')
 */
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
      items.push({
        operation_type: type,
        operation_date: date,
        customer_name: customer || '',
        receipt_number: receipt || '',
        product_name: pName,
        quantity: qty,
        price: price
      });
    }
  });

  if (items.length === 0) {
    showAlert("يرجى تحديد منتج واحد على الأقل مع كتابة الكمية!");
    return;
  }

  showLoader(true);
  try {
    // 1. تسجيل سطور الفاتورة في جدول invoice_operations
    const { error: insErr } = await db.from('invoice_operations').insert(items);
    if (insErr) throw insErr;

    // 2. تحديث المخزن وفق نوع العملية
    for (const item of items) {
      const prod = productsCache.find(p => p.name === item.product_name && p.id !== null);
      if (prod) {
        let newStock = prod.currentStock;
        if (type === 'distribution' || type === 'damaged' || type === 'gifts') {
          newStock -= item.quantity; // إنقاص من المخزن
        } else if (type === 'produced' || type === 'returned') {
          newStock += item.quantity; // زيادة إلى المخزن
        }
        await db.from('products').update({ current_stock: newStock }).eq('id', prod.id);
      }
    }

    // 3. زيادة تسلسل فواتير الزبون في حال عملية التوزيع
    if (type === 'distribution' && customer) {
      const cust = customersCache.find(c => c.name === customer);
      if (cust) {
        await db.from('customers').update({
          last_invoice_seq: (cust.lastInvoiceSeq || 0) + 1
        }).eq('id', cust.id);
      }
    }

    showAlert("تم حفظ العملية وتحديث المخزون بنجاح!");
    await preloadData();
    showView('view-dashboard');
  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل العملية: " + err.message);
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [8] واجهة جرد الباقي وحساب المباع وتصفية الحساب
// =========================================================================

/**
 * تهيئة وفتح شاشة جرد الباقي وحساب المباع
 */
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

/**
 * بناء جدول السلع عند اختيار زبون لحساب الجرد
 * @param {string} customerName - اسم الزبون
 */
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

/**
 * حساب المباع وإجمالي السطر رياضياً: المباع = المسلم - الباقي
 * @param {number} idx - رقم السطر
 */
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

/**
 * حساب المجموع الكلي للمبيعات في شاشة الجرد
 */
function calcGrandTotal() {
  let grand = 0;
  document.querySelectorAll('#inventory-tbody tr').forEach(tr => {
    const sold = Number(tr.querySelector('.sold-qty')?.value) || 0;
    const price = Number(tr.querySelector('.row-price')?.value) || 0;
    grand += (sold * price);
  });
  document.getElementById('invt-total').value = grand.toLocaleString() + ' دج';
}

/**
 * حفظ عملية الجرد وتصفية الحساب
 */
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
      items.push({
        operation_type: 'sales_settlement',
        operation_date: date,
        customer_name: customer,
        product_name: pName,
        quantity: sold,
        price: price
      });
    }
  });

  if (items.length === 0) {
    showAlert("لم يتم إدخال أي كميات مباعة أو متبقية!");
    return;
  }

  showLoader(true);
  try {
    const { error } = await db.from('invoice_operations').insert(items);
    if (error) throw error;

    showAlert("تم حفظ بيانات الجرد والفاتورة بنجاح!");
    await preloadData();
    showView('view-dashboard');
  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ الجرد: " + err.message);
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [9] إدارة وحساب تكلفة الإنتاج وبناء الجدول الديناميكي والإدراج التلقائي
// =========================================================================

/**
 * تهيئة وفتح شاشة حساب تكلفة الإنتاج
 */
function showProductionCostView() {
  document.getElementById('cost-product-name').value = '';
  document.getElementById('pkg-total').value = '';
  document.getElementById('pkg-rem').value = '';
  document.getElementById('pkg-price').value = '';

  const container = document.getElementById('cost-ingredients-container');
  container.innerHTML = '';

  // إضافة 3 أسطر افتراضية للمكونات
  addIngredientRow();
  addIngredientRow();
  addIngredientRow();

  showView('view-cost-calculation');
}

/**
 * إضافة سطر مكون ديناميكي جديد في جدول تكلفة الإنتاج (مع الإضافة التلقائية عند آخر خانة)
 */
function addIngredientRow() {
  const container = document.getElementById('cost-ingredients-container');
  const row = document.createElement('div');
  const rowId = 'cost-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  row.id = rowId;
  row.className = 'cost-row';
  row.style = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap: 10px; margin-bottom: 10px; align-items: center;';

  row.innerHTML = `
    <input type="text" class="form-control ing-name" placeholder="اسم المكون (فرينة، سكر...)">
    <input type="number" class="form-control ing-total" placeholder="الكمية الكلية" style="text-align: center;">
    <input type="number" class="form-control ing-rem" placeholder="الباقي" style="text-align: center;">
    <input type="number" class="form-control ing-price" placeholder="سعر الوحدة (دج)" style="text-align: center;" oninput="handleAutoAddCostRow('${rowId}')">
    <button type="button" class="btn-action" style="background: #e74c3c; height: 38px;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  container.appendChild(row);
}

/**
 * التحقق من الكتابة في خانة "سعر الوحدة" للسطر الأخير في جدول التكلفة، وإضافة سطر جديد تلقائياً
 * @param {string} currentRowId - معرف السطر الحالي
 */
function handleAutoAddCostRow(currentRowId) {
  const container = document.getElementById('cost-ingredients-container');
  const allRows = container.querySelectorAll('.cost-row');
  
  if (allRows.length === 0) return;

  // التحقق إن كان السطر الحالي هو السطر الأخير في قائمة المكونات
  const lastRow = allRows[allRows.length - 1];
  if (lastRow.id === currentRowId) {
    const priceInput = lastRow.querySelector('.ing-price');
    // إذا تم إدخال سعر أكبر من صفر، يضاف سطر مكون جديد تلقائياً
    if (priceInput && Number(priceInput.value) > 0) {
      addIngredientRow();
    }
  }
}
/**
 * تجميع بيانات المكونات، حساب التكلفة، وإدراج المنتج مباشرة في جداول SQL والمخزن
 */
async function submitProductionCost() {
  const pName = document.getElementById('cost-product-name').value.trim();
  if (!pName) {
    showAlert("يرجى كتابة اسم المنتج أولاً!");
    return;
  }

  // 1. تجميع المكونات وحساب تكلفة الاستهلاك: المستهلك = (الكلي - الباقي) * سعر الوحدة
  const rows = document.querySelectorAll('#cost-ingredients-container .cost-row');
  const records = [];
  let totalIngredientsCost = 0;

  rows.forEach(r => {
    const name = r.querySelector('.ing-name').value.trim();
    const totalQty = parseFloat(r.querySelector('.ing-total').value) || 0;
    const remQty = parseFloat(r.querySelector('.ing-rem').value) || 0;
    const unitPrice = parseFloat(r.querySelector('.ing-price').value) || 0;

    if (name) {
      const consumedQty = Math.max(0, totalQty - remQty);
      totalIngredientsCost += (consumedQty * unitPrice);

      records.push({
        product_name: pName,
        ingredient_name: name,
        total_qty: totalQty,
        rem_qty: remQty,
        unit_price: unitPrice
      });
    }
  });

  // 2. تجميع وحساب سطر التعليب: عدد العلب المنتجة = كلي التعليب - باقي التعليب
  const pkgTotal = parseFloat(document.getElementById('pkg-total').value) || 0;
  const pkgRem = parseFloat(document.getElementById('pkg-rem').value) || 0;
  const pkgPrice = parseFloat(document.getElementById('pkg-price').value) || 0;

  const producedBoxes = Math.max(0, pkgTotal - pkgRem);
  const packagingCost = producedBoxes * pkgPrice;

  if (pkgTotal > 0) {
    records.push({
      product_name: pName,
      ingredient_name: 'التعليب',
      total_qty: pkgTotal,
      rem_qty: pkgRem,
      unit_price: pkgPrice
    });
  }

  if (records.length === 0) {
    showAlert("يرجى إدخال المكونات أولاً!");
    return;
  }

  // حساب التكلفة الإجمالية وتكلفة العلبة الواحدة
  const grandTotalCost = totalIngredientsCost + packagingCost;
  const unitCostPerBox = producedBoxes > 0 ? Math.round(grandTotalCost / producedBoxes) : 0;

  showLoader(true);
  try {
    // أ) حفظ المكونات في جدول production_costs
    const { error: costErr } = await db.from('production_costs').insert(records);
    if (costErr) throw costErr;

    // ب) إدراج أو تحديث المنتج في جدول products ليتوفر فوراً في كل الجداول والقوائم
    const existing = productsCache.find(p => p.name.toLowerCase() === pName.toLowerCase() && p.id !== null);

    if (!existing) {
      await db.from('products').insert([{
        name: pName,
        current_stock: Math.round(producedBoxes),
        wholesale_price: Math.round(unitCostPerBox),
        retail_price: Math.round(unitCostPerBox)
      }]);
    } else {
      await db.from('products').update({
        current_stock: Number(existing.currentStock) + Math.round(producedBoxes)
      }).eq('id', existing.id);
    }

    // ج) إعادة تحميل البيانات وتحديث الواجهة
    await preloadData();

    showAlert(`تم حفظ تكلفة الإنتاج بنجاح!\n• عدد العلب المنتجة: ${producedBoxes}\n• التكلفة الإجمالية: ${grandTotalCost.toLocaleString()} دج\n• تكلفة العلبة: ${unitCostPerBox} دج\n• تم إدراج المنتج في المخزن والقوائم.`);
    showView('view-dashboard');
  } catch (err) {
    showAlert("حدث خطأ أثناء الحفظ: " + err.message);
  } finally {
    showLoader(false);
  }
}

// =========================================================================
// [10] عرض حالة المخزن الحالية وجدول المنتجات
// =========================================================================

/**
 * جلب وعرض بيانات المخزن الحالي في جدول منسق
 */
async function loadStockTable() {
  showView('view-stock-table');
  showLoader(true);
  try {
    const { data, error } = await db.from('products').select('*').order('id', { ascending: true });
    if (error) throw error;

    productsCache = (data || []).map(p => ({
      id: p.id,
      name: p.name,
      currentStock: Number(p.current_stock) || 0,
      wholesalePrice: Number(p.wholesale_price) || 0,
      retailPrice: Number(p.retail_price) || 0
    }));

    const tbody = document.getElementById('stock-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (productsCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد منتجات مسجلة</td></tr>';
    } else {
      productsCache.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td>${p.id}</td>
            <td style="font-weight: bold;">${p.name}</td>
            <td>${Number(p.wholesalePrice).toLocaleString()} دج</td>
            <td>${Number(p.retailPrice).toLocaleString()} دج</td>
            <td><strong style="color: ${p.currentStock > 0 ? 'var(--success)' : '#e74c3c'}; font-size: 16px;">${p.currentStock}</strong></td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل المخزون: " + err.message);
  } finally {
    showLoader(false);
  }
}
// =========================================================================
// [11] عرض سجل الفواتير والدفعات ومتابعة ديون الزبائن
// =========================================================================

/**
 * دالة جلب وعرض بيانات جدول الفواتير والدفعات من Supabase
 * تقوم بالاتصال بجدول invoices وترتيب النتائج وبناء الأسطر ديناميكياً مع تلوين حالة الدين
 */
async function loadInvoicesTable() {
  // 1. فتح واجهة جدول الفواتير وإخفاء باقي الشاشات
  showView('view-invoices-table');

  // 2. تفعيل مؤشر التحميل الدائري لحين اكتمال جلب البيانات
  showLoader(true);

  try {
    // 3. جلب كافة سجلات الفواتير من جدول invoices مرتبة تسلسلياً حسب المعرف id
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .order('id', { ascending: true });

    // التحقق من وجود أي خطأ أثناء الاستعلام
    if (error) throw error;

    // 4. تحديد عنصر جسم الجدول (tbody) في الصفحة
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    // 5. تفريغ محتوى الجدول القديم قبل إدراج البيانات الجديدة
    tbody.innerHTML = '';

    // 6. التحقق إن كان الجدول فارغاً في قاعدة البيانات
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 15px;">لا توجد فواتير مسجلة حتى الآن</td></tr>';
    } else {
      // 7. المرور على كل فاتورة وبناء السطر الخاص بها
      data.forEach((inv, index) => {
        // استخراج قيمة الدين وتحويلها إلى رقم
        const debtVal = Number(inv.debt) || 0;

        // تحديد لون خط خانة الدين تلقائياً:
        // - أحمر (#e74c3c): إذا كان على الزبون دين متبقي (أكبر من 0)
        // - أزرق (#2980b9): إذا كان للزبون رصيد زائد مدفوع مسبقاً (أقل من 0)
        // - أخضر (#27ae60): إذا كان الحساب مصفى تماماً (يساوي 0)
        const debtColor = debtVal > 0 ? '#e74c3c' : (debtVal < 0 ? '#2980b9' : '#27ae60');

        // إدراج السطر داخل الجدول بالترتيب المطابق لملف الإكسيل
        tbody.innerHTML += `
          <tr>
            <!-- الرقم التسلسلي التلقائي -->
            <td style="font-weight: bold;">${index + 1}</td>

            <!-- إسم الزبون أو الموزع -->
            <td style="font-weight: bold;">${inv.customer_name || ''}</td>

            <!-- رقم الفاتورة المركب -->
            <td>${inv.invoice_number || ''}</td>

            <!-- مبلغ الفاتورة الإجمالي مع التنسيق بالألف دج -->
            <td style="font-weight: bold;">${Number(inv.invoice_amount || 0).toLocaleString()} دج</td>

            <!-- تاريخ تحرير الفاتورة -->
            <td>${inv.invoice_date || '-'}</td>

            <!-- القيمة المدفوعة (باللون الأخضر) -->
            <td style="color: #27ae60; font-weight: bold;">${Number(inv.paid_amount || 0).toLocaleString()} دج</td>

            <!-- تاريخ تسديد الدفعة -->
            <td>${inv.payment_date || '-'}</td>

            <!-- الدين المتبقي مع اللون المناسب للحالة -->
            <td style="font-weight: bold; color: ${debtColor};">${debtVal.toLocaleString()} دج</td>

            <!-- خانة الملاحظات (مثل بونيس، إرجاع سلع، روثور...) -->
            <td style="color: #c0392b; font-size: 13px;">${inv.notes || ''}</td>
          </tr>
        `;
      });
    }
  } catch (err) {
    // عرض رسالة تنبيه في حال حدوث أي خطأ في الاتصال
    showAlert("حدث خطأ أثناء تحميل جدول الفواتير: " + err.message);
  } finally {
    // 8. إيقاف مؤشر التحميل بعد انتهاء العملية سواء بنجاح أو بخطأ
    showLoader(false);
  }
}
