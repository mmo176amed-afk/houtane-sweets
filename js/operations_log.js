/**
 * =========================================================================
 * [الفقرة 12] سجل العمليات - الجداول الستة (operations_log.js)
 * =========================================================================
 * 1) السلعة المنتجة   → invoice_operations (operation_type = 'سلعة منتجة')
 * 2) المباعة (جملة)    → invoices + invoice_operations
 * 3) المباعة (تجزئة)   → retail_distributions (status = 'closed')
 * 4) التالفة           → invoice_operations (operation_type = 'تالفة')
 * 5) المرجعة           → invoice_operations (operation_type = 'مسترجعة')
 * 6) الهدايا           → invoice_operations (operation_type = 'هدايا')
 */

/**
 * دالة مساعدة: تنسيق التاريخ من YYYY-MM-DD إلى DD/MM/YYYY
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
let currentOperationsTab = 'produced';
let operationsProductsList = [];

/**
 * 1. فتح صفحة سجل العمليات
 */
async function openOperationsLogView() {
  showView('view-operations-log');
  showLoader(true);
  try {
    // جلب قائمة المنتجات (لعمل أعمدة ديناميكية)
    const { data: prods, error } = await db
      .from('products')
      .select('id, name')
      .order('id', { ascending: true });
    if (error) throw error;
    operationsProductsList = prods || [];

    // فتح التبويب الافتراضي
    await switchOperationsTab('produced');
  } catch (err) {
    showAlert("خطأ في تحميل سجل العمليات: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 2. تبديل بين التبويبات
 */
async function switchOperationsTab(tab) {
  currentOperationsTab = tab;

  // إخفاء كل الأقسام
  document.querySelectorAll('[id^="log-sec-"]').forEach(el => el.style.display = 'none');

  // إظهار القسم المطلوب
  const targetSec = document.getElementById('log-sec-' + tab);
  if (targetSec) targetSec.style.display = 'block';

  // تحديث ألوان الأزرار (الزر النشط)
  const buttons = {
    produced: 'btn-log-produced',
    wholesale: 'btn-log-wholesale',
    retail: 'btn-log-retail',
    waste: 'btn-log-waste',
    returned: 'btn-log-returned',
    gifts: 'btn-log-gifts'
  };
  const activeColors = {
    produced: '#0284c7',
    wholesale: '#27ae60',
    retail: '#8e44ad',
    waste: '#c0392b',
    returned: '#3498db',
    gifts: '#e67e22'
  };

  Object.keys(buttons).forEach(key => {
    const btn = document.getElementById(buttons[key]);
    if (btn) btn.style.background = (key === tab) ? activeColors[key] : '#94a3b8';
  });

  // تحميل البيانات حسب التبويب
  showLoader(true);
  try {
    if (tab === 'produced') await loadOperationsProduced();
    else if (tab === 'wholesale') await loadOperationsWholesale();
    else if (tab === 'retail') await loadOperationsRetail();
    else if (tab === 'waste') await loadOperationsWaste();
    else if (tab === 'returned') await loadOperationsReturned();
    else if (tab === 'gifts') await loadOperationsGifts();
  } catch (err) {
    showAlert("خطأ في تحميل الجدول: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 3. دالة مساعدة: رسم جدول عمليات من invoice_operations
 * @param {Array} operations - صفوف invoice_operations
 * @param {string} tabId - معرف الجدول (produced, waste, returned, gifts)
 * @param {string} firstColLabel - عنوان العمود الرابع (اسم الزبون / المستفيد ...)
 */
function renderSimpleOperationsTable(operations, tabId, firstColLabel, showReceiptNum = false) {
  const thead = document.getElementById('log-' + tabId + '-thead');
  const tbody = document.getElementById('log-' + tabId + '-tbody');
  const tfoot = document.getElementById('log-' + tabId + '-tfoot');
  if (!thead || !tbody || !tfoot) return;

  // ===== رؤوس الأعمدة =====
  let prodHeaders = '';
  operationsProductsList.forEach(p => {
    prodHeaders += `<th style="background: #0284c7; color: white; min-width: 85px; font-size: 12px;">${p.name}</th>`;
  });

  const receiptHeader = showReceiptNum
    ? '<th style="background: #1e293b; color: white; min-width: 110px;">رقم الوصل</th>'
    : '';

  thead.innerHTML = `
    <tr>
      <th style="background: #1e293b; color: white; min-width: 50px;">#</th>
      <th style="background: #1e293b; color: white; min-width: 100px;">التاريخ</th>
      <th style="background: #7c3aed; color: white; min-width: 100px;">المستخدم</th>
      <th style="background: #27ae60; color: white; min-width: 150px;">${firstColLabel}</th>
      ${receiptHeader}
      ${prodHeaders}
    </tr>
  `;

  // ===== تجميع العمليات حسب (التاريخ + الزبون + رقم الوصل) =====
  const groups = {};
  operations.forEach(op => {
    const key = `${op.operation_date || ''}__${op.customer_name || ''}__${op.receipt_number || ''}__${op.created_by || ''}`;
    if (!groups[key]) {
      groups[key] = {
        date: op.operation_date || '-',
        customer: op.customer_name || '-',
        receipt: op.receipt_number || '-',
        user: op.created_by || 'unknown',
        products: {}
      };
    }
    const pName = op.product_name;
    groups[key].products[pName] = (groups[key].products[pName] || 0) + (Number(op.quantity) || 0);
  });

  // ===== بناء الصفوف =====
  const rows = Object.values(groups).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  tbody.innerHTML = '';
  const colTotals = {};
  operationsProductsList.forEach(p => colTotals[p.name] = 0);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${4 + (showReceiptNum ? 1 : 0) + operationsProductsList.length}" style="padding: 20px; text-align: center; color: #7f8c8d;">لا توجد عمليات مسجلة بعد</td></tr>`;
  } else {
    rows.forEach((r, idx) => {
      let prodCols = '';
      operationsProductsList.forEach(p => {
        const qty = r.products[p.name] || 0;
        colTotals[p.name] += qty;
        prodCols += `<td style="font-weight: bold; ${qty > 0 ? 'color: #0369a1;' : 'color: #cbd5e1;'}">${qty > 0 ? qty : '-'}</td>`;
      });

      const receiptCell = showReceiptNum
        ? `<td style="font-weight: bold; color: #2980b9;">${r.receipt}</td>`
        : '';

      tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold;">${idx + 1}</td>
          <td>${formatDate(r.date)}</td>
          <td style="font-weight: bold; color: #7c3aed;">${r.user}</td>
          <td style="font-weight: bold; text-align: right; padding-right: 10px;">${r.customer}</td>
          ${receiptCell}
          ${prodCols}
        </tr>
      `;
    });
  }

  // ===== المجاميع =====
  let footCols = '';
  operationsProductsList.forEach(p => {
    footCols += `<td style="background: #1e293b; color: #38bdf8; font-weight: bold;">${colTotals[p.name]}</td>`;
  });

  tfoot.innerHTML = `
    <tr style="border-top: 2px solid #0f172a;">
      <td colspan="${4 + (showReceiptNum ? 1 : 0)}" style="background: #0f172a; color: white; font-weight: bold;">المجموع:</td>
      ${footCols}
    </tr>
  `;
}

/**
 * 4. جدول السلعة المنتجة
 */
async function loadOperationsProduced() {
  const { data, error } = await db
    .from('invoice_operations')
    .select('*')
    .eq('operation_type', 'سلعة منتجة')
    .order('operation_date', { ascending: false });
  if (error) throw error;
  renderSimpleOperationsTable(data || [], 'produced', 'الجهة (إنتاج داخلي)');
}

/**
 * 5. جدول المباعة (جملة)
 */
async function loadOperationsWholesale() {
  const { data, error } = await db
    .from('invoice_operations')
    .select('*')
    .eq('operation_type', 'وصل جديد (توزيع)')
    .order('operation_date', { ascending: false });
  if (error) throw error;
  renderSimpleOperationsTable(data || [], 'wholesale', 'اسم الزبون', true);
}

/**
 * 6. جدول المباعة (تجزئة) — مصدرها retail_distributions
 */
async function loadOperationsRetail() {
  const thead = document.getElementById('log-retail-thead');
  const tbody = document.getElementById('log-retail-tbody');
  const tfoot = document.getElementById('log-retail-tfoot');
  if (!thead || !tbody || !tfoot) return;

  const { data, error } = await db
    .from('retail_distributions')
    .select('*')
    .eq('status', 'closed')
    .order('dist_date', { ascending: false });
  if (error) throw error;

  // رؤوس الأعمدة
  let prodHeaders = '';
  operationsProductsList.forEach(p => {
    prodHeaders += `<th style="background: #0284c7; color: white; min-width: 85px; font-size: 12px;">${p.name}</th>`;
  });
  thead.innerHTML = `
    <tr>
      <th style="background: #1e293b; color: white; min-width: 50px;">#</th>
      <th style="background: #1e293b; color: white; min-width: 100px;">التاريخ</th>
      <th style="background: #7c3aed; color: white; min-width: 100px;">المستخدم</th>
      <th style="background: #8e44ad; color: white; min-width: 150px;">الموزع</th>
      ${prodHeaders}
      <th style="background: #0f172a; color: white; min-width: 110px;">المجموع (دج)</th>
    </tr>
  `;

  tbody.innerHTML = '';
  const colTotals = {};
  operationsProductsList.forEach(p => colTotals[p.name] = 0);
  let totalAmount = 0;

  (data || []).forEach((r, idx) => {
    const itemsMap = {};
    (r.items || []).forEach(it => {
      const qty = Number(it.sold_qty) || 0;
      itemsMap[it.product_name] = (itemsMap[it.product_name] || 0) + qty;
    });

    let prodCols = '';
    operationsProductsList.forEach(p => {
      const qty = itemsMap[p.name] || 0;
      colTotals[p.name] += qty;
      prodCols += `<td style="font-weight: bold; ${qty > 0 ? 'color: #0369a1;' : 'color: #cbd5e1;'}">${qty > 0 ? qty : '-'}</td>`;
    });

    const amount = Number(r.final_amount) || 0;
    totalAmount += amount;

    tbody.innerHTML += `
      <tr>
        <td style="font-weight: bold;">${idx + 1}</td>
         <td>${formatDate(r.dist_date)}</td>
        <td style="font-weight: bold; color: #7c3aed;">${r.created_by || 'unknown'}</td>
        <td style="font-weight: bold; text-align: right; padding-right: 10px;">${r.distributor_name || '-'}</td>
        ${prodCols}
        <td style="font-weight: bold; color: #059669;">${amount.toLocaleString('fr-FR')} دج</td>
      </tr>
    `;
  });

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${5 + operationsProductsList.length}" style="padding: 20px; text-align: center; color: #7f8c8d;">لا توجد عمليات مسجلة بعد</td></tr>`;
  }

  let footCols = '';
  operationsProductsList.forEach(p => {
    footCols += `<td style="background: #1e293b; color: #38bdf8; font-weight: bold;">${colTotals[p.name]}</td>`;
  });

  tfoot.innerHTML = `
    <tr style="border-top: 2px solid #0f172a;">
      <td colspan="4" style="background: #0f172a; color: white; font-weight: bold;">المجموع:</td>
      ${footCols}
      <td style="background: #0f172a; color: #38bdf8; font-weight: bold;">${totalAmount.toLocaleString('fr-FR')} دج</td>
    </tr>
  `;
}

/**
 * 7. جدول السلعة التالفة
 */
async function loadOperationsWaste() {
  const { data, error } = await db
    .from('invoice_operations')
    .select('*')
    .eq('operation_type', 'تالفة')
    .order('operation_date', { ascending: false });
  if (error) throw error;
  renderSimpleOperationsTable(data || [], 'waste', 'الجهة (تلف)');
}

/**
 * 8. جدول السلعة المرجعة
 */
async function loadOperationsReturned() {
  const { data, error } = await db
    .from('invoice_operations')
    .select('*')
    .eq('operation_type', 'مسترجعة')
    .order('operation_date', { ascending: false });
  if (error) throw error;
  renderSimpleOperationsTable(data || [], 'returned', 'اسم الزبون المُرجِع');
}

/**
 * 9. جدول الهدايا
 */
async function loadOperationsGifts() {
  const { data, error } = await db
    .from('invoice_operations')
    .select('*')
    .eq('operation_type', 'هدايا')
    .order('operation_date', { ascending: false });
  if (error) throw error;
  renderSimpleOperationsTable(data || [], 'gifts', 'اسم المستفيد');
}
