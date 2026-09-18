/**
 * =========================================================================
 * [الفقرة 4] واجهة إدارة الزبائن والموزعين (customers.js)
 * =========================================================================
 */

let currentEditCustomerId = null;

/**
 * تسجيل زبون أو موزع جديد مع كل المعلومات
 */
async function submitCustomer() {
   if (!checkUserRole('admin')) {
    return;
  }
  const name = document.getElementById('c-name').value.trim();
  const type = document.getElementById('c-type').value;
  const credit = Number(document.getElementById('c-credit').value) || 0;
  const rc = document.getElementById('c-rc').value.trim();
  const nif = document.getElementById('c-nif').value.trim();
  const nis = document.getElementById('c-nis').value.trim();
  const bankName = document.getElementById('c-bank-name').value.trim();
  const bankAccount = document.getElementById('c-bank-account').value.trim();
  const address = document.getElementById('c-address').value.trim();

  if (!name) {
    showAlert("يرجى كتابة اسم الزبون!");
    return;
  }

  const existing = customersCache.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    showAlert("يوجد زبون مسجل بنفس الاسم مسبقاً!");
    return;
  }

  showLoader(true);
  try {
       const { error } = await db.from('customers').insert([{
      name: name,
      type: type,
      old_credit: credit,
      last_invoice_seq: 0,
      rc: rc || null,
      nif: nif || null,
      nis: nis || null,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      address: address || null,
      created_by: currentUser ? currentUser.username : 'unknown'
    }]);

    if (error) throw error;

    showAlert("تم تسجيل الزبون بنجاح!");
    
    // تفريغ الحقول
    document.getElementById('c-name').value = '';
    document.getElementById('c-type').value = 'gros';
    document.getElementById('c-credit').value = '';
    document.getElementById('c-rc').value = '';
    document.getElementById('c-nif').value = '';
    document.getElementById('c-nis').value = '';
    document.getElementById('c-bank-name').value = '';
    document.getElementById('c-bank-account').value = '';
    document.getElementById('c-address').value = '';

    await preloadData();
    await loadCustomersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل الزبون: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * تحميل قائمة الزبائن في الجدول
 * -- نسخة محدّثة (2026):
 *   1) إخفاء زبائن التجزئة (type = detail) من العرض فقط، دون حذفهم.
 *   2) تجميع كريدي زبائن التجزئة على اسم الموزع، وإضافته إلى old_credit الخاص به.
 *   3) عرض الموزعين وزبائن الجملة فقط.
 */
async function loadCustomersTable() {
  showLoader(true);
  try {
    // 1. جلب كل الزبائن
    const { data: custs, error } = await db
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    // 2. جلب كل عمليات كريدي/تحصيل التجزئة لتجميعها على الموزع
    const { data: retailCredits, error: rcErr } = await db
      .from('retail_credits')
      .select('*');

    if (rcErr) throw rcErr;

    // 3. بناء خريطة: اسم الموزع -> مجموع صافي الكريدي
    //    credit = دين على زبون التجزئة (يُجمع)
    //    collection = تحصيل (يُطرح)
    const distributorNetCredit = {};
    (retailCredits || []).forEach(rc => {
      const distName = rc.distributor_name;
      if (!distName) return;
      if (!distributorNetCredit[distName]) {
        distributorNetCredit[distName] = 0;
      }
      const amount = Number(rc.amount) || 0;
      if (rc.operation_type === 'credit') {
        distributorNetCredit[distName] += amount;
      } else if (rc.operation_type === 'collection') {
        distributorNetCredit[distName] -= amount;
      }
    });

    // 4. بناء قائمة العرض:
    //    - كل زبون من نوع gros أو distributor (مع إضافة الكريدي المجمّع للموزع)
    //    - استبعاد زبائن detail تمامًا
    const rowsToShow = [];

    (custs || []).forEach(c => {
      // استبعاد زبائن التجزئة من العرض
      if (c.type === 'detail') return;

      let displayCredit = Number(c.old_credit) || 0;

      // إذا كان موزعًا، نضيف إليه مجموع كريدي زبائنه من retail_credits
      if (c.type === 'distributor' && distributorNetCredit[c.name]) {
        displayCredit += distributorNetCredit[c.name];
      }

            rowsToShow.push({
        id: c.id,
        name: c.name,
        type: c.type,
        credit: displayCredit,
        hasInfo: c.rc || c.nif || c.nis || c.bank_name || c.bank_account || c.address,
        createdBy: c.created_by || 'unknown',
        isAggregate: false
      });
    });

    // 5. إضافة الموزعين الذين لديهم كريدي في retail_credits ولم يكونوا مسجلين في customers
    //    (يظهرون كسطر مجمّع، بدون إمكانية التعديل أو الحذف)
    Object.keys(distributorNetCredit).forEach(distName => {
      const alreadyShown = rowsToShow.some(r => r.name === distName);
      if (!alreadyShown && distributorNetCredit[distName] !== 0) {
                rowsToShow.push({
          id: null,
          name: distName,
          type: 'distributor',
          credit: distributorNetCredit[distName],
          hasInfo: false,
          createdBy: '---',
          isAggregate: true
        });
      }
    });

    // 6. رسم الجدول
    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (rowsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #7f8c8d;">لا يوجد زبائن مسجلون بعد</td></tr>';
      return;
    }

    rowsToShow.forEach((c, idx) => {
      const credit = c.credit;
      const creditColor = credit > 0 ? '#c0392b' : (credit < 0 ? '#2980b9' : '#27ae60');

      const infoIndicator = c.hasInfo
        ? '<span style="color: #27ae60; font-size: 11px;" title="معلومات مكتملة">✅</span>'
        : '<span style="color: #e67e22; font-size: 11px;" title="معلومات ناقصة">⚠️</span>';

      const typeLabels = {
        'gros': 'زبون جملة',
        'distributor': 'موزع تجزئة',
        'detail': 'زبون تجزئة'
      };
      const typeLabel = typeLabels[c.type] || 'غير محدد';
      const typeColor = c.type === 'gros' ? '#2980b9' : (c.type === 'distributor' ? '#8e44ad' : '#e67e22');

      // أزرار الإجراءات: تُخفى للسطر المجمّع وللمستخدم غير المدير
      const isAdmin = currentUser && currentUser.role === 'admin';

      let actionsHtml = '';
      if (c.isAggregate) {
        // السطر المجمّع (الموزع) → لا أزرار
        actionsHtml = '<span style="color: #7f8c8d; font-size: 12px; font-style: italic;">مجموع تلقائي من زبائن التجزئة</span>';
      } else if (isAdmin) {
        // المدير → عرض الأزرار
        actionsHtml = `
          <button class="btn-action" style="background: #2980b9; padding: 5px 10px; font-size: 12px; margin-left: 3px;" 
            onclick="openCustomerModal(${c.id})" title="عرض / تعديل المعلومات">
            <i class="fa-solid fa-eye"></i> عرض / تعديل
          </button>
          <button class="btn-action" style="background: #c0392b; padding: 5px 10px; font-size: 12px;" 
            onclick="deleteCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="حذف الزبون">
            <i class="fa-solid fa-trash"></i> حذف
          </button>
        `;
      } else {
        // المستخدم العادي → زر عرض فقط (بدون تعديل ولا حذف)
        actionsHtml = `
          <button class="btn-action" style="background: #7f8c8d; padding: 5px 10px; font-size: 12px;" 
            onclick="openCustomerModal(${c.id})" title="عرض المعلومات فقط">
            <i class="fa-solid fa-eye"></i> عرض فقط
          </button>
        `;
      }
          tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: bold; text-align: right; padding-right: 15px;">
            ${c.name} ${infoIndicator}
          </td>
          <td style="font-weight: bold; color: ${typeColor}; font-size: 12px;">
            ${typeLabel}
          </td>
          <td style="font-weight: bold; color: #7c3aed; font-size: 12px;">
            ${c.createdBy}
          </td>
          <td style="font-weight: bold; color: ${creditColor}; font-size: 15px;" dir="ltr">
            ${credit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} دج
          </td>
          <td style="white-space: nowrap;">
            ${actionsHtml}
          </td>
        </tr>
      `;  
      
    });

  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل قائمة الزبائن: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * فتح النافذة المنبثقة لتعديل معلومات الزبون
 */
async function openCustomerModal(custId) {
  showLoader(true);
  try {
    const { data: cust, error } = await db
      .from('customers')
      .select('*')
      .eq('id', custId)
      .single();

    if (error) throw error;
    if (!cust) {
      showAlert("لم يتم العثور على الزبون!");
      return;
    }

    currentEditCustomerId = custId;

    // تعبئة الحقول
    document.getElementById('modal-c-name').value = cust.name || '';
    document.getElementById('modal-c-rc').value = cust.rc || '';
    document.getElementById('modal-c-nif').value = cust.nif || '';
    document.getElementById('modal-c-nis').value = cust.nis || '';
    document.getElementById('modal-c-bank-name').value = cust.bank_name || '';
    document.getElementById('modal-c-bank-account').value = cust.bank_account || '';
    document.getElementById('modal-c-address').value = cust.address || '';
    document.getElementById('modal-c-credit').value = cust.old_credit || 0;

    // إظهار النافذة
    const modal = document.getElementById('customer-modal');
    modal.style.display = 'flex';

  } catch (err) {
    showAlert("حدث خطأ أثناء جلب بيانات الزبون: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * إغلاق النافذة المنبثقة
 */
function closeCustomerModal() {
  document.getElementById('customer-modal').style.display = 'none';
  currentEditCustomerId = null;
}

/**
 * حفظ تعديلات معلومات الزبون
 */
async function saveCustomerInfo() {
   if (!checkUserRole('admin')) {
    return;
  }
  if (!currentEditCustomerId) return;

  const rc = document.getElementById('modal-c-rc').value.trim();
  const nif = document.getElementById('modal-c-nif').value.trim();
  const nis = document.getElementById('modal-c-nis').value.trim();
  const bankName = document.getElementById('modal-c-bank-name').value.trim();
  const bankAccount = document.getElementById('modal-c-bank-account').value.trim();
  const address = document.getElementById('modal-c-address').value.trim();
  const credit = Number(document.getElementById('modal-c-credit').value) || 0;

  showLoader(true);
  try {
    const { error } = await db
      .from('customers')
      .update({
        rc: rc || null,
        nif: nif || null,
        nis: nis || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        address: address || null,
        old_credit: credit
      })
      .eq('id', currentEditCustomerId);

    if (error) throw error;

    showAlert("تم حفظ التعديلات بنجاح!");
    closeCustomerModal();
    await preloadData();
    await loadCustomersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء الحفظ: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * حذف زبون
 */
async function deleteCustomer(custId, custName) {
  if (!checkUserRole('admin')) {
    return;
  }
  const confirmDelete = confirm(`هل أنت متأكد من حذف الزبون "${custName}"؟\n\nتحذير: هذا الإجراء لا يمكن التراجع عنه!`);
  
  if (!confirmDelete) return;

  showLoader(true);
  try {
    const { error } = await db
      .from('customers')
      .delete()
      .eq('id', custId);

    if (error) throw error;

    showAlert("تم حذف الزبون بنجاح!");
    await preloadData();
    await loadCustomersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء الحذف: " + err.message);
  } finally {
    showLoader(false);
  }
}
