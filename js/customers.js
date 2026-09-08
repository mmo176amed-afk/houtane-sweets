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
    showDashboard();
  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل الزبون: " + err.message);
  } finally {
    showLoader(false);
  }
}
