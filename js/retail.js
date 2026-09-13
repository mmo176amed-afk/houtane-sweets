/**
 * =========================================================================
 * وحدة إدارة وتوزيع التجزئة وجرد الموزعين اليومي (Houtane Sweets)
 * الملف: js/retail.js
 * -- تعديل: عند إقفال حساب المساء، تُسجَّل الكميات المباعة كعمليات
 *    "بيع تجزئة" في جدول invoice_operations، لتظهر تلقائياً في عمود
 *    "مباعة تجزئة (-)" داخل جدول حالة المخزون (stock.js).
 * =========================================================================
 */

let allProductsList = [];
let activeMorningRecord = null;

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
        opsSummary[pName] = {
          produced: 0,
          wholesaleSold: 0,
          wasteAndGifts: 0,
          returned: 0,
          retailSold: 0
        };
      }

      const qty = Number(op.quantity) || 0;

      if (op.operation_type === 'سلعة منتجة') {
        opsSummary[pName].produced += qty;
      } else if (op.operation_type === 'وصل جديد (توزيع)') {
        opsSummary[pName].wholesaleSold += qty;
      } else if (op.operation_type === 'تالفة' || op.operation_type === 'هدايا') {
        opsSummary[pName].wasteAndGifts += qty;
      } else if (op.operation_type === 'مسترجعة') {
        opsSummary[pName].returned += qty;
      } else if (op.operation_type === 'بيع تجزئة') {
        opsSummary[pName].retailSold += qty;
      }
    });

    allProductsList = (prods || []).map(p => {
      const s = opsSummary[p.name] || {
        produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0
      };

      const baseStock = Number(p.current_stock) || 0;
      const realStock = (baseStock + s.produced + s.returned)
                       - (s.wholesaleSold + s.wasteAndGifts + s.retailSold);

      return {
        ...p,
        real_stock: realStock
      };
    });

    const { data: custs, error: cErr } = await db
      .from('customers')
      .select('name')
      .order('name');
      
    if (cErr) throw cErr;

        // تعبئة قوائم الموزعين (datalist للبحث السريع)
    const fillDatalist = (elId) => {
      const datalist = document.getElementById(elId);
      if (!datalist) return;
      datalist.innerHTML = '';
      (custs || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        datalist.appendChild(opt);
      });
    };

    fillDatalist('distributors-list-morning');
    fillDatalist('distributors-list');

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
 * 2. دالة التبديل بين التبويبات (الصباح / المساء / التقرير)
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
 * 3. دالة إضافة سطر جديد لخروج السلعة (تستثني المنتجات المختارة مسبقاً لمنع التكرار)
 */
function addMorningItemRow(selectedProdId = "", qty = "") {
  const container = document.getElementById('morning-items-container');
  const rowId = 'm-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const selectedProductIds = Array.from(container.querySelectorAll('.m-prod-select'))
    .map(sel => sel.value)
    .filter(val => val !== "");

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

/**
 * 4. دالة حذف السطر وإعادة إتاحة المنتج في بقية القوائم
 */
function removeMorningRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    refreshAllMorningSelectOptions();
  }
}

/**
 * 5. تحديث السعر والمخزن الحقيقي وإعادة فلترة القوائم لمنع التكرار
 */
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
  
  const selectedValues = Array.from(rows)
    .map(r => r.querySelector('.m-prod-select')?.value)
    .filter(val => val && val !== "");

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

/**
 * 6. فحص السطر الأخير وتوليد سطر جديد تلقائياً
 */
function handleAutoRowAdd(inputEl) {
  const currentRow = inputEl.closest('.invoice-item-row');
  const container = document.getElementById('morning-items-container');
  const allRows = container.querySelectorAll('.invoice-item-row');

  if (inputEl.value.trim() !== "" && currentRow === allRows[allRows.length - 1]) {
    const selectedCount = Array.from(container.querySelectorAll('.m-prod-select'))
      .filter(s => s.value !== "").length;

    if (selectedCount < allProductsList.length) {
      addMorningItemRow();
    }
  }
}

/**
 * 7. حفظ وتثبيت خروج السلع للصباح
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
 * 8. جلب بيانات استلام الصباح لعرضها في جرد المساء
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

       // تعبئة الحقول: فارغة إذا كانت القيمة 0
    const setFieldValue = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (Number(val) === 0) ? '' : val;
    };
    setFieldValue('calc-collected-credit', activeMorningRecord.collected_credit);
    setFieldValue('calc-new-credit', activeMorningRecord.new_credit);
    setFieldValue('calc-fuel', activeMorningRecord.fuel_expense);
    setFieldValue('calc-other-exp', activeMorningRecord.other_expenses);
    setFieldValue('calc-assistance', activeMorningRecord.assistance);

    // ⬇️⬇️⬇️ جلب كريدي زبائن التجزئة ⬇️⬇️⬇️
    const tbodyCredit = document.getElementById('retail-credit-tbody');
    if (tbodyCredit) {
      tbodyCredit.innerHTML = '';
      
      // البحث عن الكريدي المحفوظ لهذا الموزع في هذا التاريخ
      const { data: existingCredits, error: credErr } = await db
        .from('retail_credits')
        .select('*')
        .eq('distributor_name', distName)
        .eq('credit_date', distDate);

      if (credErr) console.warn("تحذير: لم يتم جلب الكريدي:", credErr.message);

      if (existingCredits && existingCredits.length > 0) {
        // عرض الكريدي المحفوظ
        existingCredits.forEach(c => {
          addRetailCreditRow(
            c.customer_name || '',
            c.credit_amount || '',
            c.collection_amount || '',
            c.collection_date || '',
            c.notes || ''
          );
        });
      } else {
        // إضافة سطر واحد فارغ
        addRetailCreditRow();
      }
    }

    calculateRetailCreditTotals();
    calculateEveningFinal();

  } catch (err) {
    showAlert("خطأ في جلب بيانات المساء: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 9. احتساب المباع وقيمته فور تعديل الباقي
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
 * 10. حساب التصفية المالية والصافي المطلوب تسليمه
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
 * 11. إقفال الحساب اليومي وتأكيد مبيعات التجزئة
 *     -- تعديل: بعد الإقفال، تُنشأ تلقائياً عمليات "بيع تجزئة" في جدول
 *        invoice_operations لكل منتج تم بيعه، لتظهر في جدول حالة المخزون.
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

  // منع التكرار: إذا كان هذا السجل مُقفلاً بالفعل من قبل، لا نعيد إدراج العمليات مرة أخرى
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

    // === الإضافة الجديدة: تسجيل مبيعات التجزئة في invoice_operations ===
    // ليقرأها stock.js تحت عمود "مباعة تجزئة (-)" بنفس منطق باقي العمليات.
    // الأعمدة هنا مطابقة تماماً لما يستخدمه invoice_ops.js عند submitCompleteInvoice:
    // customer_name, invoice_number, operation_type, product_name, price, quantity, operation_date
    if (!alreadyClosed) {
      // رقم وصل اصطناعي وفريد لكل تصفية يومية، يجمع كل أسطرها معاً لتتبعها لاحقاً
      const retailReceiptNumber = `TJZ-${activeMorningRecord.dist_date}-${activeMorningRecord.id}`;

      const opsToInsert = updatedItems
        .filter(item => item.sold_qty > 0)
        .map(item => ({
          customer_name: activeMorningRecord.distributor_name,
          receipt_number: retailReceiptNumber,
          operation_type: 'بيع تجزئة',
          product_name: item.product_name,
          price: item.retail_price,
          quantity: item.sold_qty,
          operation_date: activeMorningRecord.dist_date
        }));

      if (opsToInsert.length > 0) {
        const { error: opsError } = await db
          .from('invoice_operations')
          .insert(opsToInsert);

        if (opsError) throw opsError;
      }
    }

    showAlert("تم إقفال الحساب وتحديث مبيعات التجزئة بنجاح!");
    switchRetailTab('report');

  } catch (err) {
    showAlert("خطأ أثناء حفظ الإقفال: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 12. جدول تقرير التجزئة الشامل المطابق للإكسل
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

/**
 * =========================================================================
 * [قسم جديد] كريدي زبائن التجزئة
 * =========================================================================
 */

/**
 * دالة إضافة سطر جديد لكريدي زبائن التجزئة
 */
function addRetailCreditRow(custName = '', creditAmt = '', collectAmt = '', collectDate = '', notes = '') {
  const tbody = document.getElementById('retail-credit-tbody');
  if (!tbody) return;

  const rowId = 'rc-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  const rowHtml = `
    <tr id="${rowId}" style="background: #fff;">
      <td style="padding: 4px; border: 1px solid #fed7aa; font-weight: bold;">+</td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="text" class="form-control rc-cust-name" list="retail-customers-list" 
          placeholder="اكتب اسم زبون التجزئة..." value="${custName}" 
          style="font-size: 12px; padding: 4px;"
          oninput="onRetailCustomerInput(this)">
        <datalist id="retail-customers-list"></datalist>
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="number" step="any" class="form-control rc-credit-amt" 
          placeholder="0" value="${creditAmt}" 
          style="font-size: 12px; padding: 4px; text-align: center;"
          oninput="calculateRetailCreditTotals()">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="number" step="any" class="form-control rc-collect-amt" 
          placeholder="0" value="${collectAmt}" 
          style="font-size: 12px; padding: 4px; text-align: center;"
          oninput="calculateRetailCreditTotals()">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="date" class="form-control rc-collect-date" 
          value="${collectDate}" 
          style="font-size: 12px; padding: 4px;">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa;">
        <input type="text" class="form-control rc-notes" 
          placeholder="ملاحظات" value="${notes}" 
          style="font-size: 12px; padding: 4px;">
      </td>
      <td style="padding: 4px; border: 1px solid #fed7aa; text-align: center;">
        <button type="button" class="btn-action" 
          style="background: #e74c3c; padding: 4px 8px; font-size: 11px;" 
          onclick="removeRetailCreditRow('${rowId}')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </td>
    </tr>
  `;

  tbody.insertAdjacentHTML('beforeend', rowHtml);

  // تحديث أرقام الأسطر
  updateRetailCreditRowNumbers();

  // جلب قائمة زبائن التجزئة
  fillRetailCustomersDatalist();
}

/**
 * دالة حذف سطر من كريدي زبائن التجزئة
 */
function removeRetailCreditRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    updateRetailCreditRowNumbers();
    calculateRetailCreditTotals();
  }
}

/**
 * دالة تحديث أرقام الأسطر
 */
function updateRetailCreditRowNumbers() {
  const rows = document.querySelectorAll('#retail-credit-tbody tr');
  rows.forEach((row, idx) => {
    const firstCell = row.querySelector('td:first-child');
    if (firstCell) firstCell.textContent = idx + 1;
  });
}

/**
 * دالة حساب مجاميع الكريدي والتحصيل
 */
function calculateRetailCreditTotals() {
  let totalCredit = 0;
  let totalCollection = 0;

  const rows = document.querySelectorAll('#retail-credit-tbody tr');
  rows.forEach(row => {
    const creditInput = row.querySelector('.rc-credit-amt');
    const collectInput = row.querySelector('.rc-collect-amt');
    
    if (creditInput) totalCredit += Number(creditInput.value) || 0;
    if (collectInput) totalCollection += Number(collectInput.value) || 0;
  });

  const totalCreditEl = document.getElementById('retail-credit-total');
  const totalCollectionEl = document.getElementById('retail-collection-total');

  if (totalCreditEl) {
    totalCreditEl.textContent = totalCredit.toLocaleString('fr-FR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  if (totalCollectionEl) {
    totalCollectionEl.textContent = totalCollection.toLocaleString('fr-FR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }

  // إعادة حساب التصفية المالية
  if (typeof calculateEveningFinal === 'function') {
    calculateEveningFinal();
  }
}

/**
 * دالة عند إدخال اسم زبون التجزئة
 */
function onRetailCustomerInput(inputEl) {
  // نستخدم هذه الدالة للتحقق أو الإضافة التلقائية لاحقاً
  // حالياً، لا نفعل شيئاً
}

/**
 * دالة تعبئة قائمة زبائن التجزئة في الـ datalist
 */
async function fillRetailCustomersDatalist() {
  try {
    const { data: custs, error } = await db
      .from('customers')
      .select('name')
      .eq('type', 'detail')
      .order('name');

    if (error) throw error;

    // هناك عدة datalist في الصفحة (كل سطر له واحد)
    const allDatalists = document.querySelectorAll('#retail-customers-list');
    allDatalists.forEach(datalist => {
      datalist.innerHTML = '';
      (custs || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        datalist.appendChild(opt);
      });
    });

  } catch (err) {
    console.warn("تحذير: لم يتم جلب زبائن التجزئة:", err.message);
  }
}
