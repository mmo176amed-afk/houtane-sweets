/**
 * =========================================================================
 * وحدة إدارة وتوزيع التجزئة وجرد الموزعين اليومي (Houtane Sweets)
 * الملف: js/retail.js
 * =========================================================================
 */

let allProductsList = [];
let activeMorningRecord = null;

/**
 * 1. دالة فتح وتهيئة واجهة التجزئة وحساب الرصيد الحقيقي بالمخزن
 */
async function openRetailDistributionView() {
  showView('view-retail-dist');
  showLoader(true);

  try {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('morning-date').value = today;
    document.getElementById('evening-date').value = today;

    // 1. جلب المنتجات
    const { data: prods, error: pErr } = await db
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (pErr) throw pErr;

    // 2. جلب كافة بنود فواتير الوصل والعمليات لحساب الحركات
    const { data: invItems, error: iErr } = await db
      .from('invoice_items')
      .select('product_id, quantity, operation_type');
    
    // 3. جلب كافة حركات التجزئة
    const { data: retailRecs, error: rErr } = await db
      .from('retail_distributions')
      .select('items, status');

    // خريطة لتجميع الحركات لكل منتج بدقة
    const opsMap = {};
    (prods || []).forEach(p => {
      opsMap[p.id] = {
        produced: Number(p.stock_quantity) || 0,
        wholesale: 0,
        gifts_damaged: 0,
        returned: 0,
        retail: 0
      };
    });

    // حساب حركات الفواتير
    (invItems || []).forEach(item => {
      if (opsMap[item.product_id]) {
        const qty = Number(item.quantity) || 0;
        const op = item.operation_type || '';
        if (op.includes('توزيع') || op.includes('جملة') || op.includes('وصل جديد')) {
          opsMap[item.product_id].wholesale += qty;
        } else if (op.includes('منتجة')) {
          opsMap[item.product_id].produced += qty;
        } else if (op.includes('مسترجعة')) {
          opsMap[item.product_id].returned += qty;
        } else if (op.includes('تالفة') || op.includes('هدايا')) {
          opsMap[item.product_id].gifts_damaged += qty;
        }
      }
    });

    // حساب مبيعات التجزئة
    (retailRecs || []).forEach(rec => {
      (rec.items || []).forEach(it => {
        if (opsMap[it.product_id]) {
          const qty = rec.status === 'closed' ? (Number(it.sold_qty) || 0) : (Number(it.out_qty) || 0);
          opsMap[it.product_id].retail += qty;
        }
      });
    });

    // دمج الحساب الحقيقي مع كل منتج: (المنتجة + المسترجعة) - (جملة + تجزئة + هدايا وتالفة)
    allProductsList = (prods || []).map(p => {
      const ops = opsMap[p.id] || { produced: 0, wholesale: 0, gifts_damaged: 0, returned: 0, retail: 0 };
      const realStock = (ops.produced + ops.returned) - (ops.wholesale + ops.retail + ops.gifts_damaged);
      return {
        ...p,
        real_stock: realStock // الرصيد الحقيقي الدقيق بالمخزن
      };
    });

    // جلب قائمة الزبائن والموزعين
    const { data: custs, error: cErr } = await db.from('customers').select('name').order('name');
    if (cErr) throw cErr;

    const fillSelect = (elId) => {
      const select = document.getElementById(elId);
      select.innerHTML = '<option value="">-- اختر الموزع --</option>';
      (custs || []).forEach(c => {
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
      });
    };

    fillSelect('morning-distributor');
    fillSelect('evening-distributor');

    // تهيئة حاوية أسطر الصباح وإضافة سطر أولي
    const container = document.getElementById('morning-items-container');
    container.innerHTML = '';
    addMorningItemRow();

    switchRetailTab('morning');
  } catch (err) {
    showAlert("خطأ في تحميل بيانات التجزئة والمخزن: " + err.message);
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

  if (tab === 'report') {
    loadRetailReportTable();
  }
}

/**
 * 3. دالة إضافة سطر لسلع الصباح
 */
function addMorningItemRow(selectedProdId = "", qty = "") {
  const container = document.getElementById('morning-items-container');
  const rowId = 'm-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  let optionsHtml = '<option value="">-- اختر الحلوى --</option>';
  allProductsList.forEach(p => {
    const isSelected = String(p.id) === String(selectedProdId) ? 'selected' : '';
    optionsHtml += `<option value="${p.id}" ${isSelected}>${p.name}</option>`;
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
    <button type="button" class="btn-action" style="background: #e11d48; color: white; padding: 6px; height: 38px;" onclick="document.getElementById('${rowId}').remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
    
    <select class="form-control m-prod-select" onchange="onMorningProductSelect(this, '${rowId}')">
      ${optionsHtml}
    </select>

    <span class="m-stock-badge" style="color: #dc2626; font-weight: bold; font-size: 13px; text-align: center;">مخزن: 0</span>

    <input type="text" class="form-control m-price-input" readonly placeholder="السعر" style="text-align: center; background: #f8fafc;">

    <input type="number" class="form-control m-qty-input" min="1" placeholder="الكمية" value="${qty}" style="text-align: center;" oninput="handleAutoRowAdd(this)">
  `;

  container.appendChild(rowDiv);

  if (selectedProdId) {
    const selectEl = rowDiv.querySelector('.m-prod-select');
    onMorningProductSelect(selectEl, rowId);
  }
}

/**
 * 4. دالة تحديث السعر والرصيد الحقيقي بالمخزن عند اختيار المنتج
 */
function onMorningProductSelect(selectEl, rowId) {
  const prodId = selectEl.value;
  const row = document.getElementById(rowId);
  const stockBadge = row.querySelector('.m-stock-badge');
  const priceInput = row.querySelector('.m-price-input');

  if (!prodId) {
    stockBadge.innerText = 'مخزن: 0';
    priceInput.value = '';
    return;
  }

  const prod = allProductsList.find(p => String(p.id) === String(prodId));
  if (prod) {
    stockBadge.innerText = `مخزن: ${prod.real_stock !== undefined ? prod.real_stock : 0}`;
    priceInput.value = prod.retail_price || 0;
  }
}

/**
 * 5. فحص السطر الأخير وتوليد سطر جديد تلقائياً
 */
function handleAutoRowAdd(inputEl) {
  const currentRow = inputEl.closest('.invoice-item-row');
  const container = document.getElementById('morning-items-container');
  const allRows = container.querySelectorAll('.invoice-item-row');

  if (inputEl.value.trim() !== "" && currentRow === allRows[allRows.length - 1]) {
    addMorningItemRow();
  }
}

/**
 * 6. حفظ خروج السلعة للصباح
 */
async function saveMorningDelivery() {
  const distName = document.getElementById('morning-distributor').value;
  const distDate = document.getElementById('morning-date').value;

  if (!distName || !distDate) {
    showAlert("يرجى تحديد اسم الموزع والتاريخ أولاً.");
    return;
  }

  const rows = document.querySelectorAll('#morning-items-container .invoice-item-row');
  const items = [];

  rows.forEach(row => {
    const prodSelect = row.querySelector('.m-prod-select');
    const qtyInput = row.querySelector('.m-qty-input');
    const prodId = prodSelect ? prodSelect.value : null;
    const qty = Number(qtyInput ? qtyInput.value : 0);

    if (prodId && qty > 0) {
      const prod = allProductsList.find(p => String(p.id) === String(prodId));
      if (prod) {
        items.push({
          product_id: prod.id,
          product_name: prod.name,
          out_qty: qty,
          return_qty: 0,
          sold_qty: 0,
          retail_price: Number(prod.retail_price) || 0
        });
      }
    }
  });

  if (items.length === 0) {
    showAlert("يرجى اختيار منتج واحد على الأقل وتحديد الكمية الخارجة.");
    return;
  }

  showLoader(true);
  try {
    const { error } = await db.from('retail_distributions').insert([{
      dist_date: distDate,
      distributor_name: distName,
      items: items,
      status: 'morning'
    }]);

    if (error) throw error;

    showAlert("تم تثبيت خروج السلعة للصباح بنجاح!");
    document.getElementById('evening-distributor').value = distName;
    document.getElementById('evening-date').value = distDate;
    switchRetailTab('evening');
    loadEveningDeliveryData();

  } catch (err) {
    showAlert("فشل في حفظ البيانات: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 7. جلب بيانات استلام الصباح لعرضها في جرد المساء
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

    document.getElementById('calc-collected-credit').value = activeMorningRecord.collected_credit || 0;
    document.getElementById('calc-new-credit').value = activeMorningRecord.new_credit || 0;
    document.getElementById('calc-fuel').value = activeMorningRecord.fuel_expense || 0;
    document.getElementById('calc-other-exp').value = activeMorningRecord.other_expenses || 0;
    document.getElementById('calc-assistance').value = activeMorningRecord.assistance || 0;

    calculateEveningFinal();

  } catch (err) {
    showAlert("خطأ في جلب بيانات المساء: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 8. احتساب المباع وقيمته لحظياً
 */
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

/**
 * 9. حساب التصفية المالية والصافي
 */
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
 * 10. حفظ وتأكيد إقفال الحساب اليومي
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
    return {
      ...item,
      return_qty: retQty,
      sold_qty: sold
    };
  });

  const totalSales = Number(document.getElementById('calc-sales-total').value) || 0;
  const collected = Number(document.getElementById('calc-collected-credit').value) || 0;
  const newCredit = Number(document.getElementById('calc-new-credit').value) || 0;
  const fuel = Number(document.getElementById('calc-fuel').value) || 0;
  const other = Number(document.getElementById('calc-other-exp').value) || 0;
  const assist = Number(document.getElementById('calc-assistance').value) || 0;
  const finalAmount = (totalSales + collected) - (newCredit + fuel + other + assist);

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

    showAlert("تم إقفال الحساب وتحديث مبيعات التجزئة بنجاح!");
    switchRetailTab('report');

  } catch (err) {
    showAlert("خطأ أثناء حفظ الإقفال: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 11. جدول تقرير التجزئة الشامل
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
        <td colspan="4" style="background: #0f172a; color: white; font-weight: bold;">مجموع مبيعات التجزئة التراكمية:</td>
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
