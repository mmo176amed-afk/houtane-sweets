/**
 * =========================================================================
 * [الفقرة 5] واجهة الوصل، العمليات، الحسابات التلقائية، والبحث والتعديل (invoice_ops.js)
 * =========================================================================
 */

let currentInvoiceOperationType = 'وصل جديد (توزيع)';
let invoiceItemRowCount = 0;
let isEditMode = false;

/**
 * دالة مساعدة لتنسيق المبالغ المالية (فصل الآلاف + رقمين بعد الفاصلة)
 */
function formatMoney(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * دالة مساعدة لتحويل النص المنسق إلى رقم نقي
 */
function parseMoney(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // حذف المسافات واستبدال الفاصلة بالنقطة
  const cleaned = String(val).replace(/\s/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * 1. فتح شاشة الوصل وتهيئة الحقول
 */
function openInvoiceView() {
  showView('view-invoice-ops');
  cancelInvoiceEditMode();

  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('inv-date');
  if (dateInput) dateInput.value = today;

  const custSelect = document.getElementById('inv-customer-select');
  if (custSelect) {
    custSelect.innerHTML = '<option value="">-- اختر الزبون --</option>';
    customersCache.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.innerText = c.name;
      custSelect.appendChild(opt);
    });
  }

  document.getElementById('inv-num').value = '';
  document.getElementById('inv-old-credit-val').value = formatMoney(0);
  document.getElementById('inv-total-goods').value = formatMoney(0);
  document.getElementById('inv-adjustment-amount').value = '';
  document.getElementById('inv-grand-total').value = formatMoney(0);
  document.getElementById('inv-paid-amount').value = '';
  document.getElementById('inv-new-debt').value = formatMoney(0);
  document.getElementById('inv-notes').value = '';

  const container = document.getElementById('invoice-items-container');
  if (container) {
    container.innerHTML = '';
    invoiceItemRowCount = 0;
    addInvoiceItemRow();
    addInvoiceItemRow();
    addInvoiceItemRow();
  }
}

/**
 * 2. تغيير نوع العملية
 */
function setInvoiceOperationType(opType) {
  currentInvoiceOperationType = opType;
  const buttons = document.querySelectorAll('#view-invoice-ops .btn-op');
  buttons.forEach(btn => {
    if (btn.innerText.includes(opType.replace(/[()]/g, ''))) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * 3. تحديث القوائم المنسدلة لمنع تكرار المنتجات المختارة
 */
function refreshInvoiceDropdownOptions() {
  const allSelects = document.querySelectorAll('.inv-item-prod');
  const selectedIds = Array.from(allSelects)
    .map(s => s.value)
    .filter(val => val !== "");

  allSelects.forEach(select => {
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- اختر الحلوى --</option>';

    productsCache.forEach(p => {
      // إظهار المنتج إذا كان هو المختار حالياً في هذا السطر أو غير مختار في أي سطر آخر
      if (String(p.id) === currentVal || !selectedIds.includes(String(p.id))) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        if (String(p.id) === currentVal) opt.selected = true;
        select.appendChild(opt);
      }
    });
  });
}

/**
 * 4. إضافة سطر منتج داخل الوصل
 */
function addInvoiceItemRow(prodId = '', price = '', qty = '') {
  invoiceItemRowCount++;
  const container = document.getElementById('invoice-items-container');
  if (!container) return;

  const rowId = `inv-row-${invoiceItemRowCount}`;
  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.className = 'invoice-row-item';
  rowDiv.style = "display: flex; gap: 10px; align-items: center; margin-bottom: 8px;";

  rowDiv.innerHTML = `
    <button type="button" class="btn-action" style="background:#e74c3c; padding: 6px 12px;" onclick="removeInvoiceItemRow('${rowId}')">
      <i class="fa-solid fa-xmark"></i>
    </button>
    <div style="flex: 2;">
      <select class="form-control inv-item-prod" onchange="onInvoiceProductChanged(this, '${rowId}')">
        <option value="">-- اختر الحلوى --</option>
      </select>
    </div>
    <div style="width: 100px; text-align: center;">
      <span class="inv-item-stock" style="font-size: 13px; font-weight: bold; color: #c0392b;">مخزن: 0</span>
    </div>
    <div style="flex: 1;">
      <input type="number" step="0.01" class="form-control inv-item-price" placeholder="السعر" value="${price}" oninput="calculateInvoiceFinancials()">
    </div>
    <div style="flex: 1;">
      <input type="number" step="0.01" class="form-control inv-item-qty" placeholder="الكمية" value="${qty}" oninput="handleInvoiceQtyInput('${rowId}')">
    </div>
  `;

  container.appendChild(rowDiv);
  refreshInvoiceDropdownOptions();

  if (prodId) {
    const selectEl = rowDiv.querySelector('.inv-item-prod');
    selectEl.value = prodId;
    onInvoiceProductChanged(selectEl, rowId);
  }
}

/**
 * 5. معالجة إدخال الكمية والتوليد التلقائي للسطر الجديد
 */
function handleInvoiceQtyInput(currentRowId) {
  calculateInvoiceFinancials();

  const rows = document.querySelectorAll('.invoice-row-item');
  if (rows.length === 0) return;

  const lastRow = rows[rows.length - 1];
  if (lastRow.id === currentRowId) {
    const qtyVal = lastRow.querySelector('.inv-item-qty').value;
    const prodVal = lastRow.querySelector('.inv-item-prod').value;

    // إذا تم اختيار منتج وكتابة كمية في السطر الأخير، يفتح سطراً جديداً تلقائياً
    if (prodVal && qtyVal && Number(qtyVal) > 0) {
      addInvoiceItemRow();
    }
  }
}

/**
 * 6. حذف سطر منتج
 */
function removeInvoiceItemRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    refreshInvoiceDropdownOptions();
    calculateInvoiceFinancials();
  }
}

/**
 * 7. عند تغيير المنتج في السطر
 */
function onInvoiceProductChanged(selectEl, rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;

  const prodId = Number(selectEl.value);
  const found = productsCache.find(p => p.id === prodId);

  const priceInput = row.querySelector('.inv-item-price');
  const stockSpan = row.querySelector('.inv-item-stock');

  if (found) {
    if (!priceInput.value) priceInput.value = found.wholesalePrice || 0;
    stockSpan.innerText = `مخزن: ${found.currentStock || 0}`;
  } else {
    priceInput.value = '';
    stockSpan.innerText = 'مخزن: 0';
  }

  refreshInvoiceDropdownOptions();
  calculateInvoiceFinancials();
}

/**
 * 8. عند اختيار الزبون
 */
function onInvoiceCustomerChanged(custName) {
  const numInput = document.getElementById('inv-num');
  const oldCreditInput = document.getElementById('inv-old-credit-val');

  if (!custName) {
    if (numInput && !isEditMode) numInput.value = '';
    if (oldCreditInput) oldCreditInput.value = formatMoney(0);
    calculateInvoiceFinancials();
    return;
  }

  const custIndex = customersCache.findIndex(c => c.name === custName);
  const found = customersCache[custIndex];

  if (found && custIndex !== -1) {
    if (!isEditMode && numInput) {
      const currentYear = new Date().getFullYear();
      const customerCode = String(custIndex + 1).padStart(3, '0');
      const invoiceSeq = String((found.lastInvoiceSeq || 0) + 1).padStart(3, '0');
      numInput.value = `${currentYear}${customerCode}${invoiceSeq}`;
    }

    const oldDebt = Number(found.oldCredit) || 0;
    if (oldCreditInput) oldCreditInput.value = formatMoney(oldDebt);
  }
  calculateInvoiceFinancials();
}

/**
 * 9. الحساب التلقائي مع التنسيق المالي
 */
function calculateInvoiceFinancials() {
  let totalGoods = 0;

  const rows = document.querySelectorAll('.invoice-row-item');
  rows.forEach(row => {
    const price = Number(row.querySelector('.inv-item-price')?.value) || 0;
    const qty = Number(row.querySelector('.inv-item-qty')?.value) || 0;
    totalGoods += (price * qty);
  });

  const oldDebt = parseMoney(document.getElementById('inv-old-credit-val')?.value);
  const adjustment = parseMoney(document.getElementById('inv-adjustment-amount')?.value);
  const paid = parseMoney(document.getElementById('inv-paid-amount')?.value);

  const grandTotal = totalGoods + oldDebt + adjustment;
  const newDebt = grandTotal - paid;

  document.getElementById('inv-total-goods').value = formatMoney(totalGoods);
  document.getElementById('inv-grand-total').value = formatMoney(grandTotal);
  document.getElementById('inv-new-debt').value = formatMoney(newDebt);
}

/**
 * 10. البحث وجلب وصل سابق للتعديل
 */
async function searchAndLoadInvoice() {
  const searchNum = document.getElementById('inv-search-input').value.trim();
  if (!searchNum) {
    showAlert("يرجى إدخال رقم الوصل للبحث عنه!");
    return;
  }

  showLoader(true);
  try {
    const { data: inv, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('invoice_number', searchNum)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!inv) {
      showAlert("لم يتم العثور على أي وصل بهذا الرقم!");
      return;
    }

    const { data: items, error: itemsErr } = await db
      .from('invoice_operations')
      .select('*')
      .eq('invoice_number', searchNum);

    if (itemsErr) throw itemsErr;

    isEditMode = true;
    document.getElementById('btn-cancel-edit').style.display = 'inline-block';
    document.getElementById('edit-mode-indicator').style.display = 'inline-block';
    const submitBtn = document.getElementById('btn-submit-invoice');
    submitBtn.style.background = '#e67e22';
    submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> حفظ وتأكيد التعديلات';

    document.getElementById('inv-date').value = inv.invoice_date || '';
    document.getElementById('inv-customer-select').value = inv.customer_name || '';
    document.getElementById('inv-num').value = inv.invoice_number;
    document.getElementById('inv-paid-amount').value = inv.paid_amount || 0;
    document.getElementById('inv-notes').value = inv.notes || '';

    const cust = customersCache.find(c => c.name === inv.customer_name);
    document.getElementById('inv-old-credit-val').value = formatMoney(cust ? (cust.oldCredit || 0) : 0);

    const container = document.getElementById('invoice-items-container');
    container.innerHTML = '';
    invoiceItemRowCount = 0;

    if (items && items.length > 0) {
      items.forEach(it => {
        const prod = productsCache.find(p => p.name === it.product_name);
        addInvoiceItemRow(prod ? prod.id : '', it.price, it.quantity);
      });
    } else {
      addInvoiceItemRow();
    }

    calculateInvoiceFinancials();
    showAlert("تم جلب بيانات الوصل بنجاح، يمكنك التعديل ثم الضغط على حفظ التعديلات.");

  } catch (err) {
    showAlert("حدث خطأ أثناء البحث عن الوصل: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 11. إلغاء وضع التعديل
 */
function cancelInvoiceEditMode() {
  isEditMode = false;
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const indicator = document.getElementById('edit-mode-indicator');
  const submitBtn = document.getElementById('btn-submit-invoice');
  const searchInput = document.getElementById('inv-search-input');

  if (cancelBtn) cancelBtn.style.display = 'none';
  if (indicator) indicator.style.display = 'none';
  if (searchInput) searchInput.value = '';
  if (submitBtn) {
    submitBtn.style.background = '#27ae60';
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> تسجيل وتأكيد الوصل';
  }
}

/**
 * 12. الحفظ النهائي وترحيل البيانات
 */
async function submitCompleteInvoice() {
  const customerName = document.getElementById('inv-customer-select').value;
  const invoiceNum = document.getElementById('inv-num').value.trim();
  const invoiceDate = document.getElementById('inv-date').value;
  const grandTotal = parseMoney(document.getElementById('inv-grand-total').value);
  const paidAmount = parseMoney(document.getElementById('inv-paid-amount').value);
  const newDebt = parseMoney(document.getElementById('inv-new-debt').value);
  const notes = document.getElementById('inv-notes').value.trim();

  if (!customerName) {
    showAlert("يرجى اختيار اسم الزبون أولاً!");
    return;
  }
  if (!invoiceNum) {
    showAlert("يرجى التأكد من رقم الوصل!");
    return;
  }

  const rows = document.querySelectorAll('.invoice-row-item');
  const itemsToProcess = [];

  rows.forEach(row => {
    const prodSelect = row.querySelector('.inv-item-prod');
    const prodId = Number(prodSelect?.value);
    const price = Number(row.querySelector('.inv-item-price')?.value) || 0;
    const qty = Number(row.querySelector('.inv-item-qty')?.value) || 0;

    if (prodId && qty > 0) {
      const prodName = prodSelect.options[prodSelect.selectedIndex].text;
      itemsToProcess.push({ prodId, prodName, price, qty });
    }
  });

  showLoader(true);
  try {
    if (isEditMode) {
      await db.from('invoice_operations').delete().eq('invoice_number', invoiceNum);
      await db.from('invoices').delete().eq('invoice_number', invoiceNum);
    }

    for (const item of itemsToProcess) {
      await db.from('invoice_operations').insert([{
        customer_name: customerName,
        invoice_number: invoiceNum,
        operation_type: currentInvoiceOperationType,
        product_name: item.prodName,
        price: item.price,
        quantity: item.qty,
        operation_date: invoiceDate
      }]);

      if (!isEditMode) {
        const prod = productsCache.find(p => p.id === item.prodId);
        if (prod) {
          let currentStock = Number(prod.currentStock) || 0;
          let updatedStock = currentInvoiceOperationType === 'وصل جديد (توزيع)' ? currentStock - item.qty : currentStock + item.qty;
          await db.from('products').update({ current_stock: updatedStock }).eq('id', item.prodId);
        }
      }
    }

    const { error: invErr } = await db.from('invoices').insert([{
      customer_name: customerName,
      invoice_number: invoiceNum,
      invoice_amount: grandTotal,
      invoice_date: invoiceDate,
      paid_amount: paidAmount,
      debt: newDebt,
      notes: notes
    }]);

    if (invErr) throw invErr;

    const cust = customersCache.find(c => c.name === customerName);
    if (cust) {
      const updateData = { old_credit: newDebt };
      if (!isEditMode) {
        updateData.last_invoice_seq = (cust.lastInvoiceSeq || 0) + 1;
      }
      await db.from('customers').update(updateData).eq('id', cust.id);
    }

    showAlert(isEditMode ? "تم تحديث وحفظ بيانات الوصل بنجاح!" : "تم تسجيل وتأكيد الوصل وترحيله بنجاح!");

    cancelInvoiceEditMode();
    await preloadData();
    showDashboard();

  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ الوصل: " + err.message);
  } finally {
    showLoader(false);
  }
}
