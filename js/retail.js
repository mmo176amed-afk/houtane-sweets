/**
 * =========================================================================
 * وحدة توزيع التجزئة وجرد الموزعين وحساب الصافي (js/retail.js)
 * =========================================================================
 */

let allProductsList = [];
let activeMorningRecord = null;

async function openRetailDistributionView() {
  showView('view-retail-dist');
  showLoader(true);

  try {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('morning-date').value = today;
    document.getElementById('evening-date').value = today;

    // 1. جلب المنتجات والأسعار والمخزون
    const { data: prods, error: pErr } = await db.from('products').select('*').order('id', { ascending: true });
    if (pErr) throw pErr;
    allProductsList = prods || [];

    // 2. جلب قائمة الموزعين والزبائن
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

    renderMorningTable();
    switchRetailTab('morning');
  } catch (err) {
    showAlert("خطأ في تحميل بيانات التجزئة: " + err.message);
  } finally {
    showLoader(false);
  }
}

function switchRetailTab(tab) {
  document.getElementById('retail-sec-morning').style.display = tab === 'morning' ? 'block' : 'none';
  document.getElementById('retail-sec-evening').style.display = tab === 'evening' ? 'block' : 'none';
  document.getElementById('retail-sec-report').style.display = tab === 'report' ? 'block' : 'none';

  document.getElementById('btn-tab-morning').style.background = tab === 'morning' ? '#0284c7' : '#64748b';
  document.getElementById('btn-tab-evening').style.background = tab === 'evening' ? '#059669' : '#64748b';
  document.getElementById('btn-tab-report').style.background = tab === 'report' ? '#475569' : '#64748b';

  if (tab === 'report') loadRetailReportTable();
}

function renderMorningTable() {
  const tbody = document.getElementById('morning-items-tbody');
  tbody.innerHTML = '';

  allProductsList.forEach((p, idx) => {
    tbody.innerHTML += `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-weight: bold; text-align: right; padding-right: 15px;">${p.name}</td>
        <td style="color: #0284c7; font-weight: bold;">${p.stock_quantity || 0}</td>
        <td style="font-weight: bold;">${p.retail_price || 0} دج</td>
        <td>
          <input type="number" id="m-qty-${p.id}" data-id="${p.id}" data-price="${p.retail_price || 0}" data-name="${p.name}" class="form-control" style="width: 110px; margin: 0 auto; text-align: center;" min="0" placeholder="0">
        </td>
      </tr>
    `;
  });
}

// حفظ استلام الصباح
async function saveMorningDelivery() {
  const distName = document.getElementById('morning-distributor').value;
  const distDate = document.getElementById('morning-date').value;

  if (!distName || !distDate) {
    showAlert("يرجى تحديد الموزع والتاريخ.");
    return;
  }

  const items = [];
  allProductsList.forEach(p => {
    const input = document.getElementById(`m-qty-${p.id}`);
    const qty = Number(input?.value) || 0;
    if (qty > 0) {
      items.push({
        product_id: p.id,
        product_name: p.name,
        out_qty: qty,
        return_qty: 0,
        sold_qty: 0,
        retail_price: Number(p.retail_price) || 0
      });
    }
  });

  if (items.length === 0) {
    showAlert("يرجى كتابة كمية واحدة على الأقل للسلع الخارجة.");
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
    showAlert("فشل في الحفظ: " + err.message);
  } finally {
    showLoader(false);
  }
}

// جلب بيانات الصباح للمساء
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
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 15px; color: #e11d48;">لم يتم تسجيل خروج سلع لهذا الموزع في هذا اليوم.</td></tr>`;
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

// حساب المجموع الصافي فورياً
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

// حفظ وإقفال الحساب اليومي
async function saveEveningSettlement() {
  if (!activeMorningRecord) {
    showAlert("لا يوجد سجل صباحي محدد.");
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

    showAlert("تم إقفال الحساب وحفظ مبيعات التجزئة وتحديث الأرصدة بنجاح!");
    switchRetailTab('report');
  } catch (err) {
    showAlert("خطأ في الحفظ: " + err.message);
  } finally {
    showLoader(false);
  }
}

// عرض جدول تقرير التجزئة المطابق للإكسل
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
      prodHeaders += `<th style="background: #0284c7; color: white; min-width: 80px; font-size: 13px;">${p.name}</th>`;
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
          <td><span style="padding: 3px 8px; border-radius: 10px; font-size: 12px; color: white; background: ${r.status === 'closed' ? '#059669' : '#eab308'};">${r.status === 'closed' ? 'مغلق ومباع' : 'خروج صباح'}</span></td>
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
        <td colspan="4" style="background: #0f172a; color: white; font-weight: bold;">مجموع مبيعات التجزئة (لحالة المخزن):</td>
        ${footCols}
        <td style="background: #0f172a;"></td>
      </tr>
    `;
  } catch (err) {
    showAlert("خطأ في جلب التقرير: " + err.message);
  } finally {
    showLoader(false);
  }
}
