/**
 * =========================================================================
 * [الفقرة 9] سجل الفواتير والدفعات، خيارات الطباعة، والإغلاق السنوي (reports.js)
 * =========================================================================
 */

/**
 * 1. فتح شاشة سجل الفواتير وعرض البيانات مع أزرار الطباعة
 */
async function loadInvoicesTable() {
  showView('view-invoices-table');
  showLoader(true);

  try {
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 15px; color: #7f8c8d;">لا توجد فواتير مسجلة حتى الآن</td></tr>';
    } else {
      data.forEach((inv, index) => {
        const debtVal = Number(inv.debt) || 0;
        const debtColor = debtVal > 0 ? '#e74c3c' : (debtVal < 0 ? '#2980b9' : '#27ae60');

        tbody.innerHTML += `
          <tr>
            <td style="font-weight: bold;">${index + 1}</td>
            <td style="font-weight: bold;">${inv.customer_name || ''}</td>
            <td>${inv.invoice_number || ''}</td>
            <td style="font-weight: bold;">${Number(inv.invoice_amount || 0).toLocaleString()} دج</td>
            <td>${inv.invoice_date || '-'}</td>
            <td style="color: #27ae60; font-weight: bold;">${Number(inv.paid_amount || 0).toLocaleString()} دج</td>
            <td>${inv.invoice_date || '-'}</td>
            <td style="font-weight: bold; color: ${debtColor};">${debtVal.toLocaleString()} دج</td>
            <td style="color: #c0392b; font-size: 13px;">${inv.notes || ''}</td>
            
            <!-- أزرار الطباعة (وصل الطلب + فاتورة الطريق) -->
            <td style="white-space: nowrap;">
              <button class="btn-action" style="background: #2980b9; padding: 5px 8px; font-size: 12px; margin-left: 4px;" 
                onclick="printOrderReceipt('${inv.invoice_number}', '${inv.customer_name}')" title="طباعة وصل الطلب">
                <i class="fa-solid fa-receipt"></i> وصل الطلب
              </button>
              
              <button class="btn-action" style="background: #8e44ad; padding: 5px 8px; font-size: 12px;" 
                onclick="printRoadInvoice('${inv.invoice_number}', '${inv.customer_name}')" title="طباعة فاتورة الطريق">
                <i class="fa-solid fa-truck-moving"></i> فاتورة الطريق
              </button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل سجل الفواتير: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 2. دالة طباعة وصل الطلب (Bon de Commande / Livraison)
 */
async function printOrderReceipt(invoiceNum, customerName) {
  showLoader(true);
  try {
    const { data: items, error } = await db
      .from('invoice_operations')
      .select('*')
      .eq('invoice_number', invoiceNum);

    if (error) throw error;

    const printWindow = window.open('', '', 'width=800,height=600');
    let itemsRowsHtml = '';
    
    if (items && items.length > 0) {
      items.forEach((it, idx) => {
        itemsRowsHtml += `
          <tr>
            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${idx + 1}</td>
            <td style="border:1px solid #ddd; padding:8px;">${it.product_name}</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${it.quantity}</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${Number(it.price).toLocaleString()} دج</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${Number(it.quantity * it.price).toLocaleString()} دج</td>
          </tr>
        `;
      });
    }

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <title>وصل طلب - ${invoiceNum}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f2f2f2; border: 1px solid #ddd; padding: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Houtane Sweets - حلويات هتان</h2>
          <h3>وصل تسليم وطلب رقم: ${invoiceNum}</h3>
          <p><strong>اسم الزبون / الموزع:</strong> ${customerName}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>السعر الفردي</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml || '<tr><td colspan="5" style="text-align:center;">لا توجد تفاصيل سلع مسجلة لهذا الرقم</td></tr>'}
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);

  } catch (err) {
    showAlert("حدث خطأ أثناء إعداد وصل الطلب للطباعة: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 3. دالة طباعة فاتورة الطريق (Bon de Route / Facture)
 */
async function printRoadInvoice(invoiceNum, customerName) {
  showLoader(true);
  try {
    const { data: invData, error } = await db
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNum)
      .single();

    if (error) throw error;

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <title>فاتورة الطريق - ${invoiceNum}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #8e44ad; padding-bottom: 10px; margin-bottom: 20px; }
          .info-box { margin-bottom: 15px; font-size: 15px; line-height: 1.8; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
          th { background: #8e44ad; color: white; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Houtane Sweets - فاتورة الطريق والنقل</h2>
          <h4>رقم الوصل: ${invData.invoice_number} | التاريخ: ${invData.invoice_date || '-'}</h4>
        </div>
        <div class="info-box">
          <p><strong>الموزع / الزبون:</strong> ${invData.customer_name}</p>
          <p><strong>ملاحظات التوزيع:</strong> ${invData.notes || 'لا توجد'}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>المبلغ الإجمالي المطلوب</th>
              <th>المبلغ المدفوع</th>
              <th>الرصيد المتبقي (دين)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:bold;">${Number(invData.invoice_amount || 0).toLocaleString()} دج</td>
              <td style="color:green; font-weight:bold;">${Number(invData.paid_amount || 0).toLocaleString()} دج</td>
              <td style="color:red; font-weight:bold;">${Number(invData.debt || 0).toLocaleString()} دج</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);

  } catch (err) {
    showAlert("حدث خطأ أثناء إعداد فاتورة الطريق: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 4. دالة الإغلاق السنوي وتصفية الحسابات (محمية بكلمة سر)
 */
async function closeYearAndCarryOverDebt() {
  const enteredPass = prompt("عملية حساسة: أدخل كلمة المرور لتأكيد إغلاق السنة ونقل الديون وتفريغ سجل الفواتير:");
  
  if (enteredPass === null) return;
  
  if (enteredPass !== SECURITY_CONFIG.yearClosePassword) {
    showAlert("كلمة المرور غير صحيحة! تم إلغاء العملية.");
    return;
  }

  showLoader(true);
  try {
    const { data: allInvoices, error: invErr } = await db
      .from('invoices')
      .select('*')
      .order('id', { ascending: true });

    if (invErr) throw invErr;

    const customerFinalDebts = {};
    if (allInvoices && allInvoices.length > 0) {
      allInvoices.forEach(inv => {
        customerFinalDebts[inv.customer_name] = Number(inv.debt) || 0;
      });
    }

    for (const cust of customersCache) {
      const finalDebt = customerFinalDebts.hasOwnProperty(cust.name) 
        ? customerFinalDebts[cust.name] 
        : (cust.oldCredit || 0);

      await db.from('customers').update({
        old_credit: finalDebt,
        last_invoice_seq: 0
      }).eq('id', cust.id);
    }

    const { error: delErr } = await db.from('invoices').delete().neq('id', 0);
    if (delErr) throw delErr;

    showAlert("تم إغلاق السنة بنجاح! تم نقل الديون لبطاقات الزبائن وتفريغ سجل الفواتير للعام الجديد.");

    await preloadData();
    await loadInvoicesTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء إغلاق السنة: " + err.message);
  } finally {
    showLoader(false);
  }
}
