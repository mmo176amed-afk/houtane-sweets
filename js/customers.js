/**
 * =========================================================================
 * [الفقرة 4] واجهة إدارة الزبائن والموزعين (customers.js)
 * =========================================================================
 */

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

  // التحقق من عدم وجود زبون بنفس الاسم
  const existing = customersCache.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    showAlert("يوجد زبون مسجل بنفس الاسم مسبقاً!");
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
    await loadCustomersTable(); // تحديث الجدول مباشرة

  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل الزبون: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * تحميل قائمة الزبائن في الجدول
 */
async function loadCustomersTable() {
  showLoader(true);
  try {
    // جلب الزبائن من قاعدة البيانات مباشرة (للتأكد من أحدث البيانات)
    const { data: custs, error } = await db
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!custs || custs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding: 15px; text-align: center; color: #7f8c8d;">لا يوجد زبائن مسجلون بعد</td></tr>';
      return;
    }

    custs.forEach((c, idx) => {
      const credit = Number(c.old_credit) || 0;
      const creditColor = credit > 0 ? '#c0392b' : (credit < 0 ? '#2980b9' : '#27ae60');

      tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: bold; text-align: right; padding-right: 15px;">${c.name}</td>
          <td style="font-weight: bold; color: ${creditColor}; font-size: 15px;" dir="ltr">
            ${credit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} دج
          </td>
          <td>
            <button class="btn-action" style="background: #e67e22; padding: 5px 10px; font-size: 12px; margin-left: 5px;" 
              onclick="editCustomerCredit(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${credit})" title="تعديل الكريدي">
              <i class="fa-solid fa-pen"></i> تعديل
            </button>
            <button class="btn-action" style="background: #c0392b; padding: 5px 10px; font-size: 12px;" 
              onclick="deleteCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="حذف الزبون">
              <i class="fa-solid fa-trash"></i> حذف
            </button>
          </td>
        </tr>
      `;
    });

  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل قائمة الزبائن: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * تعديل كريدي زبون
 */
async function editCustomerCredit(custId, custName, currentCredit) {
  const newCreditStr = prompt(`تعديل الكريدي للزبون "${custName}":\n\nالكريدي الحالي: ${currentCredit} دج`, currentCredit);
  
  if (newCreditStr === null) return; // المستخدم ألغى

  const newCredit = parseFloat(newCreditStr);
  if (isNaN(newCredit)) {
    showAlert("يرجى إدخال رقم صحيح!");
    return;
  }

  showLoader(true);
  try {
    const { error } = await db
      .from('customers')
      .update({ old_credit: newCredit })
      .eq('id', custId);

    if (error) throw error;

    showAlert("تم تحديث الكريدي بنجاح!");
    await preloadData();
    await loadCustomersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء التعديل: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * حذف زبون (مع تأكيد)
 */
async function deleteCustomer(custId, custName) {
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
