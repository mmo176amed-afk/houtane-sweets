/**
 * =========================================================================
 * [الفقرة 6] واجهة جرد الباقي وحساب المباع وتصفية الحساب (inventory.js)
 * =========================================================================
 */

/**
 * فتح شاشة الجرد وتهيئة الحقول
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
 * تحميل السلع للجرد عند اختيار الزبون
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
 * حساب المباع لكل سطر في الجرد
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
 * حساب المجموع الكلي لشاشة الجرد
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
 * حفظ عملية الجرد وتحديث العمليات
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
    showDashboard();
  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ الجرد: " + err.message);
  } finally {
    showLoader(false);
  }
}
