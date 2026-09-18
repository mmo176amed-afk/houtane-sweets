/**
 * =========================================================================
 * وحدة إدارة وتوزيع التجزئة وجرد الموزعين اليومي (Houtane Sweets)
 * الملف: js/retail.js
 * =========================================================================
 */

let allProductsList = [];
let activeMorningRecord = null;
let eveningCreditRowCounter = 0;

/**
 * 1. دالة فتح وتهيئة واجهة التجزئة والموزعين
 */
async function openRetailDistributionView() {
  showView('view-retail-dist');
  showLoader(true);

  try {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('morning-date').value = today;
    document.getElementById('evening-date').value = today;

    const { data: prods, error: pErr } = await db
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (pErr) throw pErr;

    const { data: ops, error: opsErr } = await db
      .from('invoice_operations')
      .select('*');

    if (opsErr) throw opsErr;

    const opsSummary = {};
    (ops || []).forEach(op => {
      const pName = op.product_name;
      if (!opsSummary[pName]) {
        opsSummary[pName] = { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
      }
      const qty = Number(op.quantity) || 0;
      if (op.operation_type === 'سلعة منتجة') opsSummary[pName].produced += qty;
      else if (op.operation_type === 'وصل جديد (توزيع)') opsSummary[pName].wholesaleSold += qty;
      else if (op.operation_type === 'تالفة' || op.operation_type === 'هدايا') opsSummary[pName].wasteAndGifts += qty;
      else if (op.operation_type === 'مسترجعة') opsSummary[pName].returned += qty;
      else if (op.operation_type === 'بيع تجزئة') opsSummary[pName].retailSold += qty;
    });

    allProductsList = (prods || []).map(p => {
      const s = opsSummary[p.name] || { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
      const baseStock = Number(p.current_stock) || 0;
      const realStock = (baseStock + s.produced + s.returned) - (s.wholesaleSold + s.wasteAndGifts + s.retailSold);
      return { ...p, real_stock: realStock };
    });

    // جلب الموزعين فقط (النوع distributor) مباشرة من قاعدة البيانات
    // -- هذا هو التعديل الذي يمنع ظهور زبائن الجملة ضمن قائمة الموزعين --
    const { data: distributors, error: cErr } = await db
      .from('customers')
      .select('name, type')
      .eq('type', 'distributor')
      .order('name');
    if (cErr) throw cErr;

    const fillDatalist = (elId, list) => {
      const datalist = document.getElementById(elId);
      if (!datalist) return;
      datalist.innerHTML = '';
      (list || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        datalist.appendChild(opt);
      });
    };
    fillDatalist('distributors-list-morning', distributors);
    fillDatalist('distributors-list', distributors);

    // جلب زبائن التجزئة لقائمة الإكمال التلقائي في جدول الكريدي
    await fillRetailCustomersDatalist();

    // جلب السجل التاريخي الكامل لكريدي/تحصيل زبائن التجزئة (يبقى في صفحة الصباح)
    await loadRetailLedgerTable();

    const container = document.getElementById('morning-items-container');
    container.innerHTML = '';
    addMorningItemRow();

    switchRetailTab('morning');

  } catch (err) {
    showAlert("خطأ في جلب بيانات المنتجات والمخزن: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 2. دالة التبديل بين التبويبات
 */
function switchRetailTab(tab) {
  document.getElementById('retail-sec-morning').style.display = tab === 'morning' ? 'block' : 'none';
  document.getElementById('retail-sec-evening').style.display = tab === 'evening' ? 'block' : 'none';
  document.getElementById('retail-sec-report').style.display = tab === 'report' ? 'block' : 'none';

  document.getElementById('btn-tab-morning').style.background = tab === 'morning' ? '#0284c7' : '#64748b';
  document.getElementById('btn-tab-evening').style.background = tab === 'evening' ? '#059669' : '#64748b';
  document.getElementById('btn-tab-report').style.background = tab === 'report' ? '#475569' : '#64748b';

  if (tab === 'report') loadRetailReportTable();
}

/**
 * 3. دوال خروج السلعة (الصباح) - المنتجات
 */
function addMorningItemRow(selectedProdId = "", qty = "") {
  const container = document.getElementById('morning-items-container');
  const rowId = 'm-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const selectedProductIds = Array.from(container.querySelectorAll('.m-prod-select'))
    .map(sel => sel.value).filter(val => val !== "");

  let optionsHtml = '<option value="">-- اختر الحلوى --</option>';
  allProductsList.forEach(p => {
    const isChosenElsewhere = selectedProductIds.includes(String(p.id)) && String(p.id) !== String(selectedProdId);
    if (!isChosenElsewhere) {
      const isSelected = String(p.id) === String(selectedProdId) ? 'selected' : '';
      optionsHtml += `<option value="${p.id}" ${isSelected}>${p.name}</option>`;
    }
  });

  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.className = 'invoice-item-row';
  rowDiv.style.display = 'grid';
  rowDiv.style.gridTemplateColumns = '40px 2.5fr 100px 1.2fr 1.2fr';
  rowDiv.style.gap = '10px';
  rowDiv.style.alignItems = 'center';
  rowDiv.style.marginBottom = '10px';

  rowDiv.innerHTML = `
    <button type="button" class="btn-action" style="background: #e11d48; color: white; padding: 6px; height: 38px;" onclick="removeMorningRow('${rowId}')">
      <i class="fa-solid fa-xmark"></i>
    </button>
    <select class="form-control m-prod-select" onchange="onMorningProductSelect(this, '${rowId}')">
      ${optionsHtml}
    </select>
    <span class="m-stock-badge" style="color: #dc2626; font-weight: bold; font-size: 13px; text-align: center;">مخزن: 0</span>
    <input type="text" class="form-control m-price-input" readonly placeholder="السعر" style="text-align: center; background: #f8fafc; font-weight: bold;">
    <input type="number" class="form-control m-qty-input" min="1" placeholder="الكمية" value="${qty}" style="text-align: center;" oninput="handleAutoRowAdd(this)">
  `;

  container.appendChild(rowDiv);
  if (selectedProdId) {
    const selectEl = rowDiv.querySelector('.m-prod-select');
    onMorningProductSelect(selectEl, rowId);
  }
}

function removeMorningRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) { row.remove(); refreshAllMorningSelectOptions(); }
}

function onMorningProductSelect(selectEl, rowId) {
  const prodId = selectEl.value;
  const row = document.getElementById(rowId);
  const stockBadge = row.querySelector('.m-stock-badge');
  const priceInput = row.querySelector('.m-price-input');

  if (!prodId) {
    stockBadge.innerText = 'مخزن: 0';
    priceInput.value = '';
  } else {
    const prod = allProductsList.find(p => String(p.id) === String(prodId));
    if (prod) {
      stockBadge.innerText = `مخزن: ${prod.real_stock !== undefined ? prod.real_stock : 0}`;
      priceInput.value = prod.retail_price || 0;
    }
  }
  refreshAllMorningSelectOptions();
}

function refreshAllMorningSelectOptions() {
  const container = document.getElementById('morning-items-container');
  if (!container) return;
  const rows = container.querySelectorAll('.invoice-item-row');
  const selectedValues = Array.from(rows).map(r => r.querySelector('.m-prod-select')?.value).filter(val => val && val !== "");

  rows.forEach(r => {
    const select = r.querySelector('.m-prod-select');
    if (!select) return;
    const currentVal = select.value;
    let newHtml = '<option value="">-- اختر الحلوى --</option>';
    allProductsList.forEach(p => {
      const isTakenByOther = selectedValues.includes(String(p.id)) && String(p.id) !== String(currentVal);
      if (!isTakenByOther) {
        const isSelected = String(p.id) === String(currentVal) ? 'selected' : '';
        newHtml += `<option value="${p.id}" ${isSelected}>${p.name}</option>`;
      }
    });
    select.innerHTML = newHtml;
  });
}

function handleAutoRowAdd(inputEl) {
  const currentRow = inputEl.closest('.invoice-item-row');
  const container = document.getElementById('morning-items-container');
  const allRows = container.querySelectorAll('.invoice-item-row');
  if (inputEl.value.trim() !== "" && currentRow === allRows[allRows.length - 1]) {
    const selectedCount = Array.from(container.querySelectorAll('.m-prod-select')).filter(s => s.value !== "").length;
    if (selectedCount < allProductsList.length) addMorningItemRow();
  }
}

/**
 * 4. حفظ (تثبيت) خروج السلعة للصباح
 * -- هذه الدالة كانت مفقودة بالكامل من الملف الأصلي، وهي سبب عدم عمل الزر --
 */
async function saveMorningDelivery() {
  const distName = document.getElementById('morning-distributor').value.trim();
  const distDate = document.getElementById('morning-date').value;

  if (!distName) {
    showAlert("يرجى كتابة اسم الموزع!");
    return;
  }
  if (!distDate) {
    showAlert("يرجى اختيار التاريخ!");
    return;
  }

  const container = document.getElementById('morning-items-container');
  const rows = container.querySelectorAll('.invoice-item-row');
  const items = [];

  rows.forEach(row => {
    const prodId = row.querySelector('.m-prod-select')?.value;
    const qty = Number(row.querySelector('.m-qty-input')?.value) || 0;
    const price = Number(row.querySelector('.m-price-input')?.value) || 0;
    if (prodId && qty > 0) {
      const prod = allProductsList.find(p => String(p.id) === String(prodId));
      items.push({
        product_id: Number(prodId),
        product_name: prod ? prod.name : '',
        out_qty: qty,
        retail_price: price,
        return_qty: 0
      });
    }
  });

  if (items.length === 0) {
    showAlert("يرجى إضافة منتج واحد على الأقل بكمية صحيحة!");
    return;
  }

  showLoader(true);
  try {
    // التحقق من وجود سجل سابق لنفس الموزع/التاريخ لم يُغلق بعد، لتفادي التكرار
    const { data: existing, error: exErr } = await db
      .from('retail_distributions')
      .select('id, status')
      .eq('dist_date', distDate)
      .eq('distributor_name', distName)
      .order('id', { ascending: false })
      .limit(1);

    if (exErr) throw exErr;

    if (existing && existing.length > 0 && existing[0].status !== 'closed') {
      const { error: updErr } = await db
        .from('retail_distributions')
        .update({ items: items })
        .eq('id', existing[0].id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await db
        .from('retail_distributions')
        .insert([{
          dist_date: distDate,
          distributor_name: distName,
          items: items,
          status: 'out'
        }]);
      if (insErr) throw insErr;
    }

    showAlert("تم تثبيت خروج السلعة بنجاح!");

    document.getElementById('morning-items-container').innerHTML = '';
    addMorningItemRow();

  } catch (err) {
    showAlert("خطأ أثناء حفظ خروج السلعة: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 5. جدول السجل التاريخي لكريدي/تحصيل زبائن التجزئة (يبقى في صفحة الصباح)
 * الأعمدة: # / اسم الزبون / التسمية / القيمة / التاريخ / اسم الموزع / الباقي التراكمي
 */
async function loadRetailLedgerTable() {
  const tbody = document.getElementById('retail-balance-tbody');
  if (!tbody) return;
  try {
    const { data, error } = await db
      .from('retail_credits')
      .select('*')
      .order('operation_date', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 10px; color: #7c2d12;">لا يوجد عمليات بعد.</td></tr>';
      return;
    }

    const balances = {};
    const rowsHtml = [];

    data.forEach((op, idx) => {
      const custName = op.customer_name;
      if (!(custName in balances)) balances[custName] = 0;

      const isCredit = op.operation_type === 'credit';
      const amount = Number(op.amount) || 0;
      balances[custName] += isCredit ? amount : -amount;

      const bal = balances[custName];
      const balColor = bal > 0 ? '#c0392b' : (bal < 0 ? '#27ae60' : '#2980b9');
      const label = isCredit ? 'كريدي' : 'تحصيل';
      const labelColor = isCredit ? '#c0392b' : '#27ae60';

      rowsHtml.push(`
        <tr>
          <td style="padding: 6px; border: 1px solid #fb923c;">${idx + 1}</td>
          <td style="padding: 6px; border: 1px solid #fb923c; font-weight: bold; text-align: right; padding-right: 12px;">${custName}</td>
          <td style="padding: 6px; border: 1px solid #fb923c; font-weight: bold; color: ${labelColor};">${label}</td>
          <td style="padding: 6px; border: 1px solid #fb923c; font-weight: bold;" dir="ltr">${Math.abs(amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="padding: 6px; border: 1px solid #fb923c;">${op.operation_date}</td>
          <td style="padding: 6px; border: 1px solid #fb923c;">${op.distributor_name || ''}</td>
          <td style="padding: 6px; border: 1px solid #fb923c; font-weight: bold; color: ${balColor};" dir="ltr">${bal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `);
    });

    // عرض الأحدث أولاً مع بقاء الباقي التراكمي محسوباً بالترتيب الزمني الصحيح
    tbody.innerHTML = rowsHtml.reverse().join('');

  } catch (err) {
    console.warn("تعذر جلب سجل كريدي التجزئة:", err.message);
  }
}

/**
 * جلب قائمة زبائن التجزئة في الـ datalist (للإكمال التلقائي داخل جدول المساء)
 */
async function fillRetailCustomersDatalist() {
  try {
    const { data: custs, error } = await db
      .from('customers')
      .select('name')
      .eq('type', 'detail')
      .order('name');

    if (error) throw error;

    const datalist = document.getElementById('retail-customers-list-main');
    if (!datalist) return;

    datalist.innerHTML = '';
    (custs || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      datalist.appendChild(opt);
    });
  } catch (err) {
    console.warn("تحذير: لم يتم جلب زبائن التجزئة:", err.message);
  }
}

/**
 * 6. جدول كريدي/تحصيل زبائن التجزئة داخل صفحة المساء (السطر الثاني في صندوق التصفية المالية)
 */
function addEveningCreditRow(custName = '', creditVal = '', collectVal = '', notes = '') {
  const tbody = document.getElementById('evening-credit-tbody');
  if (!tbody) return;

  eveningCreditRowCounter++;
  const rowId = 'ecr-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const rowHtml = `
    <tr id="${rowId}">
      <td style="padding: 4px; border: 1px solid #fed7aa; font-weight: bold;">${eveningCreditRowCounter}</td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="text" class="form-control ec-name" list="retail-customers-list-main"
          value="${custName}" placeholder="اسم الزبون..."
          style="font-size: 12px; padding: 4px;">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="number" step="any" class="ec-credit" value="${creditVal}" placeholder="0"
          style="font-size: 12px; padding: 4px; text-align: center; font-weight: bold; color: #c0392b; width: 100%;"
          oninput="recalcEveningCreditTotals()">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="number" step="any" class="ec-collect" value="${collectVal}" placeholder="0"
          style="font-size: 12px; padding: 4px; text-align: center; font-weight: bold; color: #27ae60; width: 100%;"
          oninput="recalcEveningCreditTotals()">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="text" class="ec-notes" value="${notes}" placeholder="ملاحظات"
          style="font-size: 12px; padding: 4px;">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa; text-align: center;">
        <button type="button" class="btn-action" style="background: #e74c3c; padding: 4px 8px; font-size: 11px;"
          onclick="removeEveningCreditRow('${rowId}')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </td>
    </tr>
  `;

  tbody.insertAdjacentHTML('beforeend', rowHtml);
  recalcEveningCreditTotals();
}

function removeEveningCreditRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    recalcEveningCreditTotals();
  }
}

/**
 * إعادة حساب مجموع الكريدي ومجموع التحصيل، وتحديث خانتي
 * "تحصيل الكريدي" و"كريدي اليوم الجديد" في السطر الأول تلقائياً
 */
function recalcEveningCreditTotals() {
  const rows = document.querySelectorAll('#evening-credit-tbody tr');
  let totalCredit = 0;
  let totalCollect = 0;

  rows.forEach(row => {
    totalCredit += Number(row.querySelector('.ec-credit')?.value) || 0;
    totalCollect += Number(row.querySelector('.ec-collect')?.value) || 0;
  });

  const totalCreditEl = document.getElementById('evening-credit-total');
  const totalCollectEl = document.getElementById('evening-collect-total');
  if (totalCreditEl) totalCreditEl.textContent = totalCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (totalCollectEl) totalCollectEl.textContent = totalCollect.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  document.getElementById('calc-new-credit').value = totalCredit;
  document.getElementById('calc-collected-credit').value = totalCollect;

  calculateEveningFinal();
}

/**
 * جلب عمليات كريدي/تحصيل محفوظة سابقاً لنفس الموزع/التاريخ (حالة إعادة فتح يوم مُغلق)
 */
async function loadEveningCreditRows(distName, distDate) {
  const tbody = document.getElementById('evening-credit-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  eveningCreditRowCounter = 0;

  try {
    const { data, error } = await db
      .from('retail_credits')
      .select('*')
      .eq('operation_date', distDate)
      .eq('distributor_name', distName)
      .order('id', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      data.forEach(op => {
        const isCredit = op.operation_type === 'credit';
        addEveningCreditRow(
          op.customer_name || '',
          isCredit ? (op.amount || '') : '',
          !isCredit ? (op.amount || '') : '',
          op.notes || ''
        );
      });
    } else {
      addEveningCreditRow();
    }
  } catch (err) {
    console.warn("تعذر جلب عمليات الكريدي لهذا اليوم:", err.message);
    addEveningCreditRow();
  }
}

/**
 * حفظ عمليات كريدي/تحصيل زبائن التجزئة بعد التصفية (الصافي بين الكريدي والتحصيل لكل زبون)
 */
async function saveEveningCreditOperations(distName, distDate) {
  const rows = document.querySelectorAll('#evening-credit-tbody tr');
  const netOps = [];

  rows.forEach(row => {
    const custName = row.querySelector('.ec-name')?.value.trim();
    const creditVal = Number(row.querySelector('.ec-credit')?.value) || 0;
    const collectVal = Number(row.querySelector('.ec-collect')?.value) || 0;
    const notes = row.querySelector('.ec-notes')?.value.trim();

    if (!custName) return;

    const net = collectVal - creditVal;
    if (net === 0) return; // لا فرق صافي، لا داعي لتسجيل عملية

    netOps.push({
      customer_name: custName,
      operation_date: distDate,
      operation_type: net > 0 ? 'collection' : 'credit',
      amount: Math.abs(net),
      distributor_name: distName,
      notes: notes || null
    });
  });

  if (netOps.length === 0) return { saved: 0, error: null };

  try {
    // حذف أي عمليات محفوظة سابقاً لنفس الموزع ونفس اليوم لتفادي التكرار عند إعادة الحفظ/التعديل
    await db.from('retail_credits')
      .delete()
      .eq('operation_date', distDate)
      .eq('distributor_name', distName);

    // تسجيل الزبائن الجدد في جدول customers إن لم يكونوا موجودين
    const uniqueCustNames = [...new Set(netOps.map(o => o.customer_name))];
    for (const custName of uniqueCustNames) {
      const { data: existing } = await db
        .from('customers')
        .select('id')
        .eq('name', custName)
        .maybeSingle();

      if (!existing) {
        await db.from('customers').insert([{
          name: custName,
          type: 'detail',
          old_credit: 0,
          last_invoice_seq: 0
        }]);
      }
    }

    const { error } = await db.from('retail_credits').insert(netOps);
    if (error) throw error;

    return { saved: netOps.length, error: null };
  } catch (err) {
    return { saved: 0, error: err.message };
  }
}

/**
 * 7. دوال جرد المساء
 */
async function loadEveningDeliveryData() {
  const distName = document.getElementById('evening-distributor').value;
  const distDate = document.getElementById('evening-date').value;

  if (!distName || !distDate) return;

  showLoader(true);
  try {
    const { data, error } = await db
      .from('retail_distributions')
      .select('*')
      .eq('dist_date', distDate)
      .eq('distributor_name', distName)
      .order('id', { ascending: false })
      .limit(1);

    if (error) throw error;

    const tbody = document.getElementById('evening-items-tbody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 15px; color: #e11d48; font-weight: bold;">لم يتم تسجيل خروج سلع لهذا الموزع في هذا اليوم.</td></tr>`;
      activeMorningRecord = null;
      await loadEveningCreditRows(distName, distDate);
      calculateEveningFinal();
      return;
    }

    activeMorningRecord = data[0];
    const items = activeMorningRecord.items || [];

    items.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold; text-align: right; padding-right: 15px;">${item.product_name}</td>
          <td style="font-weight: bold; color: #0369a1;">${item.out_qty}</td>
          <td>
            <input type="number" id="e-ret-${item.product_id}" class="form-control" style="width: 100px; margin: 0 auto; text-align: center;" value="${item.return_qty || 0}" min="0" max="${item.out_qty}" oninput="calcRowSold(${item.product_id}, ${item.out_qty}, ${item.retail_price})">
          </td>
          <td id="e-sold-${item.product_id}" style="font-weight: bold; color: #059669;">${item.out_qty - (item.return_qty || 0)}</td>
          <td style="font-weight: bold;">${item.retail_price} دج</td>
          <td id="e-val-${item.product_id}" style="font-weight: bold; color: #0f172a;">${(item.out_qty - (item.return_qty || 0)) * item.retail_price} دج</td>
        </tr>
      `;
    });

    const setFieldValue = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (Number(val) === 0) ? '' : val;
    };
    setFieldValue('calc-fuel', activeMorningRecord.fuel_expense);
    setFieldValue('calc-other-exp', activeMorningRecord.other_expenses);
    setFieldValue('calc-assistance', activeMorningRecord.assistance);

    // جلب عمليات كريدي/تحصيل هذا الموزع لهذا اليوم (إن وجدت) وتعبئة الجدول
    await loadEveningCreditRows(distName, distDate);

    calculateEveningFinal();

  } catch (err) {
    showAlert("خطأ في جلب بيانات المساء: " + err.message);
  } finally {
    showLoader(false);
  }
}

function calcRowSold(prodId, outQty, price) {
  const retInput = document.getElementById(`e-ret-${prodId}`);
  let retQty = Number(retInput?.value) || 0;
  if (retQty > outQty) { retQty = outQty; retInput.value = outQty; }
  if (retQty < 0) { retQty = 0; retInput.value = 0; }
  const sold = outQty - retQty;
  const totalVal = sold * price;
  const soldCell = document.getElementById(`e-sold-${prodId}`);
  const valCell = document.getElementById(`e-val-${prodId}`);
  if (soldCell) soldCell.innerText = sold;
  if (valCell) valCell.innerText = `${totalVal} دج`;
  calculateEveningFinal();
}

function calculateEveningFinal() {
  if (!activeMorningRecord) {
    document.getElementById('calc-sales-total').value = 0;
    document.getElementById('calc-final-amount').innerText = "0.00 دج";
    return;
  }
  let totalSales = 0;
  (activeMorningRecord.items || []).forEach(item => {
    const retInput = document.getElementById(`e-ret-${item.product_id}`);
    const retQty = Number(retInput?.value) || 0;
    const sold = Math.max(0, item.out_qty - retQty);
    totalSales += sold * item.retail_price;
  });

  const collected = Number(document.getElementById('calc-collected-credit').value) || 0;
  const newCredit = Number(document.getElementById('calc-new-credit').value) || 0;
  const fuel = Number(document.getElementById('calc-fuel').value) || 0;
  const other = Number(document.getElementById('calc-other-exp').value) || 0;
  const assist = Number(document.getElementById('calc-assistance').value) || 0;
  const finalAmount = (totalSales + collected) - (newCredit + fuel + other + assist);
  document.getElementById('calc-sales-total').value = totalSales;
  document.getElementById('calc-final-amount').innerText = `${finalAmount.toLocaleString('fr-FR')} دج`;
}

/**
 * 8. حفظ وإقفال جرد المساء
 */
async function saveEveningSettlement() {
  if (!activeMorningRecord) {
    showAlert("لا يوجد سجل صباحي محدد للإقفال.");
    return;
  }

  const updatedItems = (activeMorningRecord.items || []).map(item => {
    const retInput = document.getElementById(`e-ret-${item.product_id}`);
    const retQty = Number(retInput?.value) || 0;
    const sold = Math.max(0, item.out_qty - retQty);
    return { ...item, return_qty: retQty, sold_qty: sold };
  });

  const totalSales = Number(document.getElementById('calc-sales-total').value) || 0;
  const collected = Number(document.getElementById('calc-collected-credit').value) || 0;
  const newCredit = Number(document.getElementById('calc-new-credit').value) || 0;
  const fuel = Number(document.getElementById('calc-fuel').value) || 0;
  const other = Number(document.getElementById('calc-other-exp').value) || 0;
  const assist = Number(document.getElementById('calc-assistance').value) || 0;
  const finalAmount = (totalSales + collected) - (newCredit + fuel + other + assist);
  const alreadyClosed = activeMorningRecord.status === 'closed';

  showLoader(true);
  try {
    const { error } = await db
      .from('retail_distributions')
      .update({
        items: updatedItems,
        total_sales_value: totalSales,
        collected_credit: collected,
        new_credit: newCredit,
        fuel_expense: fuel,
        other_expenses: other,
        assistance: assist,
        final_amount: finalAmount,
        status: 'closed'
      })
      .eq('id', activeMorningRecord.id);

    if (error) throw error;

    if (!alreadyClosed) {
      const retailReceiptNumber = `TJZ-${activeMorningRecord.dist_date}-${activeMorningRecord.id}`;
      const opsToInsert = updatedItems.filter(item => item.sold_qty > 0).map(item => ({
        customer_name: activeMorningRecord.distributor_name,
        receipt_number: retailReceiptNumber,
        operation_type: 'بيع تجزئة',
        product_name: item.product_name,
        price: item.retail_price,
        quantity: item.sold_qty,
        operation_date: activeMorningRecord.dist_date
      }));

      if (opsToInsert.length > 0) {
        const { error: opsError } = await db.from('invoice_operations').insert(opsToInsert);
        if (opsError) throw opsError;
      }
    }

    // حفظ عمليات كريدي/تحصيل زبائن التجزئة بعد التصفية (الصافي لكل زبون)
    const saveResult = await saveEveningCreditOperations(activeMorningRecord.distributor_name, activeMorningRecord.dist_date);
    if (saveResult.error) {
      showAlert("تحذير: تم إقفال الجرد، لكن فشل حفظ كريدي زبائن التجزئة: " + saveResult.error);
    } else {
      showAlert(`تم إقفال الحساب بنجاح! (تم حفظ ${saveResult.saved} عملية كريدي/تحصيل)`);
    }

    switchRetailTab('report');
    await loadRetailReportTable();

  } catch (err) {
    showAlert("خطأ أثناء حفظ الإقفال: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 9. تقرير التجزئة (يضاف له عمودا البنزين والمصاريف/المساعدات بعد عمود الحالة)
 */
async function loadRetailReportTable() {
  showLoader(true);
  try {
    const { data: records, error } = await db
      .from('retail_distributions')
      .select('*')
      .order('dist_date', { ascending: false });

    if (error) throw error;

    const thead = document.getElementById('retail-report-thead');
    const tbody = document.getElementById('retail-report-tbody');
    const tfoot = document.getElementById('retail-report-tfoot');

    let prodHeaders = '';
    allProductsList.forEach(p => {
      prodHeaders += `<th style="background: #0284c7; color: white; min-width: 85px; font-size: 13px;">${p.name}</th>`;
    });

    thead.innerHTML = `
      <tr>
        <th style="background: #1e293b; color: white;">#</th>
        <th style="background: #0284c7; color: white;">التاريخ</th>
        <th style="background: #0284c7; color: white;">الموزع</th>
        <th style="background: #1e293b; color: white;">الحالة</th>
        <th style="background: #b45309; color: white; min-width: 80px;">البنزين</th>
        <th style="background: #b45309; color: white; min-width: 100px;">مصاريف/مساعدات</th>
        ${prodHeaders}
        <th style="background: #0f172a; color: white;">المجموع الصافي</th>
      </tr>
    `;

    tbody.innerHTML = '';
    const colTotals = {};
    allProductsList.forEach(p => colTotals[p.name] = 0);

    (records || []).forEach((r, idx) => {
      const pMap = {};
      (r.items || []).forEach(it => {
        pMap[it.product_name] = r.status === 'closed' ? it.sold_qty : it.out_qty;
      });

      let prodCols = '';
      allProductsList.forEach(p => {
        const qty = pMap[p.name] || 0;
        colTotals[p.name] += qty;
        prodCols += `<td style="font-weight: bold; ${qty > 0 ? 'color: #0369a1;' : 'color: #cbd5e1;'}">${qty > 0 ? qty : '-'}</td>`;
      });

      const fuelVal = Number(r.fuel_expense) || 0;
      const otherAssistVal = (Number(r.other_expenses) || 0) + (Number(r.assistance) || 0);

      tbody.innerHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.dist_date}</td>
          <td style="font-weight: bold; text-align: right; padding-right: 10px;">${r.distributor_name}</td>
          <td>
            <span style="padding: 3px 8px; border-radius: 10px; font-size: 12px; color: white; background: ${r.status === 'closed' ? '#059669' : '#eab308'};">
              ${r.status === 'closed' ? 'مغلق ومباع' : 'خروج صباح'}
            </span>
          </td>
          <td style="font-weight: bold; color: #b45309;">${fuelVal > 0 ? fuelVal.toLocaleString('fr-FR') : '-'}</td>
          <td style="font-weight: bold; color: #b45309;">${otherAssistVal > 0 ? otherAssistVal.toLocaleString('fr-FR') : '-'}</td>
          ${prodCols}
          <td style="font-weight: bold; color: #059669;">${(r.final_amount || 0).toLocaleString('fr-FR')} دج</td>
        </tr>
      `;
    });

    let footCols = '';
    allProductsList.forEach(p => {
      footCols += `<td style="background: #1e293b; color: #38bdf8; font-weight: bold;">${colTotals[p.name]}</td>`;
    });

    tfoot.innerHTML = `
      <tr style="border-top: 2px solid #0f172a;">
        <td colspan="6" style="background: #0f172a; color: white; font-weight: bold;">مجموع مبيعات التجزئة التراكمية:</td>
        ${footCols}
        <td style="background: #0f172a;"></td>
      </tr>
    `;

  } catch (err) {
    showAlert("خطأ في جلب تقرير التجزئة: " + err.message);
  } finally {
    showLoader(false);
  }
}
