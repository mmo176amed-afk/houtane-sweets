/**
 * =========================================================================
 * [الفقرة 13] تصدير الأرشيف السنوي إلى ملف Excel (export_archive.js)
 * =========================================================================
 * 9 صفحات:
 *   1) السلعة المنتجة
 *   2) السلعة المباعة (جملة)
 *   3) السلعة المباعة (تجزئة)
 *   4) حالة المخزون
 *   5) السلعة التالفة
 *   6) السلعة المسترجعة
 *   7) الهدايا
 *   8) كريدي زبائن الجملة والموزعين
 *   9) كريدي زبائن التجزئة
 */

/**
 * دالة رئيسية: تُصدِّر كل بيانات السنة إلى ملف Excel
 * @param {string} yearLabel - سنة الإغلاق (مثلاً "2026")
 * @returns {Promise<boolean>} - نجحت العملية أم لا
 */
async function exportYearArchiveToExcel(yearLabel = new Date().getFullYear()) {
  try {
    showAlert("جاري تجهيز ملف الأرشيف... يرجى الانتظار.");

    // ============================================
    // 1. جلب كل البيانات من قاعدة البيانات
    // ============================================
    const [productsRes, invoicesRes, opsRes, retailDistRes, retailCreditsRes, customersRes] = await Promise.all([
      db.from('products').select('*').order('id', { ascending: true }),
      db.from('invoices').select('*').order('id', { ascending: true }),
      db.from('invoice_operations').select('*').order('id', { ascending: true }),
      db.from('retail_distributions').select('*').order('id', { ascending: true }),
      db.from('retail_credits').select('*').order('id', { ascending: true }),
      db.from('customers').select('*').order('id', { ascending: true })
    ]);

    const products = productsRes.data || [];
    const invoices = invoicesRes.data || [];
    const operations = opsRes.data || [];
    const retailDistributions = retailDistRes.data || [];
    const retailCredits = retailCreditsRes.data || [];
    const customers = customersRes.data || [];

    // ============================================
    // 2. إنشاء ملف Excel جديد
    // ============================================
    const workbook = XLSX.utils.book_new();

    // ============================================
    // [الصفحة 1] السلعة المنتجة
    // ============================================
    const producedOps = operations.filter(op => op.operation_type === 'سلعة منتجة');
    const producedRows = producedOps.map((op, i) => ({
      'الرقم': i + 1,
      'التاريخ': op.operation_date || '-',
      'المستخدم': op.created_by || 'unknown',
      'المنتج': op.product_name || '-',
      'الكمية': Number(op.quantity) || 0,
      'سعر الوحدة': Number(op.price) || 0,
      'المجموع': (Number(op.quantity) || 0) * (Number(op.price) || 0)
    }));
    const producedSheet = XLSX.utils.json_to_sheet(producedRows.length ? producedRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, producedSheet, 'السلعة المنتجة');

    // ============================================
    // [الصفحة 2] السلعة المباعة (جملة)
    // ============================================
    const wholesaleRows = invoices.map((inv, i) => ({
      'الرقم': i + 1,
      'التاريخ': inv.invoice_date || '-',
      'المستخدم': inv.created_by || 'unknown',
      'اسم الزبون': inv.customer_name || '-',
      'رقم الفاتورة': inv.invoice_number || '-',
      'مبلغ الفاتورة': Number(inv.invoice_amount) || 0,
      'المدفوع': Number(inv.paid_amount) || 0,
      'الدين': Number(inv.debt) || 0,
      'الملاحظات': inv.notes || ''
    }));
    const wholesaleSheet = XLSX.utils.json_to_sheet(wholesaleRows.length ? wholesaleRows : [{ 'ملاحظة': 'لا توجد فواتير' }]);
    XLSX.utils.book_append_sheet(workbook, wholesaleSheet, 'السلعة المباعة (جملة)');

    // ============================================
    // [الصفحة 3] السلعة المباعة (تجزئة)
    // ============================================
    const closedDistributions = retailDistributions.filter(r => r.status === 'closed');
    const retailRows = closedDistributions.map((r, i) => ({
      'الرقم': i + 1,
      'التاريخ': r.dist_date || '-',
      'المستخدم': r.created_by || 'unknown',
      'الموزع': r.distributor_name || '-',
      'إجمالي المبيعات': Number(r.total_sales_value) || 0,
      'تحصيل الكريدي': Number(r.collected_credit) || 0,
      'كريدي اليوم': Number(r.new_credit) || 0,
      'البنزين': Number(r.fuel_expense) || 0,
      'مصاريف أخرى': Number(r.other_expenses) || 0,
      'المساعدات': Number(r.assistance) || 0,
      'المجموع الصافي': Number(r.final_amount) || 0
    }));
    const retailSheet = XLSX.utils.json_to_sheet(retailRows.length ? retailRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, retailSheet, 'السلعة المباعة (تجزئة)');

    // ============================================
    // [الصفحة 4] حالة المخزون
    // ============================================
    const stockRows = products.map((p, i) => ({
      'الرقم': i + 1,
      'اسم المنتج': p.name || '-',
      'المخزن (الابتدائي)': Number(p.current_stock) || 0,
      'سعر الجملة': Number(p.wholesale_price) || 0,
      'سعر التجزئة': Number(p.retail_price) || 0
    }));
    const stockSheet = XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{ 'ملاحظة': 'لا توجد منتجات' }]);
    XLSX.utils.book_append_sheet(workbook, stockSheet, 'حالة المخزون');

    // ============================================
    // [الصفحة 5] السلعة التالفة
    // ============================================
    const wasteOps = operations.filter(op => op.operation_type === 'تالفة');
    const wasteRows = wasteOps.map((op, i) => ({
      'الرقم': i + 1,
      'التاريخ': op.operation_date || '-',
      'المستخدم': op.created_by || 'unknown',
      'المنتج': op.product_name || '-',
      'الكمية': Number(op.quantity) || 0,
      'السعر': Number(op.price) || 0
    }));
    const wasteSheet = XLSX.utils.json_to_sheet(wasteRows.length ? wasteRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, wasteSheet, 'السلعة التالفة');

    // ============================================
    // [الصفحة 6] السلعة المسترجعة
    // ============================================
    const returnedOps = operations.filter(op => op.operation_type === 'مسترجعة');
    const returnedRows = returnedOps.map((op, i) => ({
      'الرقم': i + 1,
      'التاريخ': op.operation_date || '-',
      'المستخدم': op.created_by || 'unknown',
      'اسم الزبون المُرجِع': op.customer_name || '-',
      'المنتج': op.product_name || '-',
      'الكمية': Number(op.quantity) || 0,
      'السعر': Number(op.price) || 0
    }));
    const returnedSheet = XLSX.utils.json_to_sheet(returnedRows.length ? returnedRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, returnedSheet, 'السلعة المسترجعة');

    // ============================================
    // [الصفحة 7] الهدايا
    // ============================================
    const giftOps = operations.filter(op => op.operation_type === 'هدايا');
    const giftRows = giftOps.map((op, i) => ({
      'الرقم': i + 1,
      'التاريخ': op.operation_date || '-',
      'المستخدم': op.created_by || 'unknown',
      'اسم المستفيد': op.customer_name || '-',
      'المنتج': op.product_name || '-',
      'الكمية': Number(op.quantity) || 0,
      'السعر': Number(op.price) || 0
    }));
    const giftSheet = XLSX.utils.json_to_sheet(giftRows.length ? giftRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, giftSheet, 'الهدايا');

    // ============================================
    // [الصفحة 8] كريدي زبائن الجملة والموزعين
    // ============================================
    const wholesaleCustomers = customers.filter(c => c.type === 'gros' || c.type === 'distributor');
    const custRows = wholesaleCustomers.map((c, i) => ({
      'الرقم': i + 1,
      'الاسم': c.name || '-',
      'النوع': c.type === 'gros' ? 'زبون جملة' : 'موزع تجزئة',
      'RC': c.rc || '-',
      'NIF': c.nif || '-',
      'NIS': c.nis || '-',
      'الهاتف/العنوان': c.address || '-',
      'الكريدي النهائي': Number(c.old_credit) || 0
    }));
    const custSheet = XLSX.utils.json_to_sheet(custRows.length ? custRows : [{ 'ملاحظة': 'لا يوجد زبائن' }]);
    XLSX.utils.book_append_sheet(workbook, custSheet, 'كريدي زبائن الجملة والموزعين');

    // ============================================
    // [الصفحة 9] كريدي زبائن التجزئة
    // ============================================
    const retailCreditRows = retailCredits.map((rc, i) => ({
      'الرقم': i + 1,
      'التاريخ': rc.operation_date || '-',
      'المستخدم': rc.created_by || 'unknown',
      'اسم الزبون': rc.customer_name || '-',
      'الموزع': rc.distributor_name || '-',
      'النوع': rc.operation_type === 'credit' ? 'كريدي' : 'تحصيل',
      'المبلغ': Number(rc.amount) || 0,
      'ملاحظات': rc.notes || ''
    }));
    const retailCreditSheet = XLSX.utils.json_to_sheet(retailCreditRows.length ? retailCreditRows : [{ 'ملاحظة': 'لا توجد عمليات' }]);
    XLSX.utils.book_append_sheet(workbook, retailCreditSheet, 'كريدي زبائن التجزئة');

    // ============================================
    // 3. حفظ الملف على جهاز المستخدم
    // ============================================
    const fileName = `Houtane_Sweets_Archive_${yearLabel}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    return true;
  } catch (err) {
    console.error("خطأ في تصدير الأرشيف:", err);
    showAlert("حدث خطأ أثناء تصدير الأرشيف: " + err.message);
    return false;
  }
}
