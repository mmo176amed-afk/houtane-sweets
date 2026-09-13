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
/**
 * 2. دالة طباعة وصل التسليم (تصميم احترافي - A5 على ورق A4)
 */
async function printOrderReceipt(invoiceNum, customerName) {
  showLoader(true);
  try {
    // جلب تفاصيل الفاتورة
    const { data: invData, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNum)
      .single();

        if (invErr) throw invErr;

    // جلب الكريدي القديم من customersCache
    const customer = customersCache.find(c => c.name === invData.customer_name);
    const oldCredit = customer ? (Number(customer.oldCredit) || 0) : 0;

    // جلب تفاصيل المنتجات
    const { data: items, error: itemsErr } = await db
      .from('invoice_operations')
      .select('*')
      .eq('receipt_number', invoiceNum);

    if (itemsErr) throw itemsErr;

    // حساب المجموع الكلي للمنتجات
    let totalGoods = 0;
    let itemsRowsHtml = '';

    if (items && items.length > 0) {
      items.forEach((it, idx) => {
        const lineTotal = Number(it.price) * Number(it.quantity);
        totalGoods += lineTotal;
        itemsRowsHtml += `
          <tr>
            <td style="border: 1px solid #000; padding: 4px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #000; padding: 4px; text-align: right; padding-right: 8px;">${it.product_name}</td>
            <td style="border: 1px solid #000; padding: 4px; text-align: center;">${it.quantity}</td>
            <td style="border: 1px solid #000; padding: 4px; text-align: center;">${Number(it.price).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="border: 1px solid #000; padding: 4px; text-align: center;">${lineTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      });
    } else {
      itemsRowsHtml = `<tr><td colspan="5" style="border: 1px solid #000; padding: 8px; text-align: center;">لا توجد منتجات</td></tr>`;
    }

       // تصميم الوصل HTML
    const receiptHtml = `
      <div class="receipt">
        <!-- الترويسة -->
        <div class="receipt-header">
          <div class="receipt-logo">
            <img src="https://mmo176amed-afk.github.io/houtane-sweets/logo.png" alt="Houtane Sweets" style="height: 60px;">
          </div>
          <div class="receipt-title">
            <h2 style="margin: 0; font-size: 20px;">حلويات هتان</h2>
            <p style="margin: 2px 0; font-size: 12px;">HOUTANE SWEETS</p>
          </div>
          <div class="receipt-type">
            <h3 style="margin: 0; font-size: 16px; color: #c0392b;">وصل تسليم</h3>
          </div>
        </div>

        <!-- معلومات الوصل -->
        <div class="receipt-info">
          <div class="info-row">
            <span class="info-label">التاريخ:</span>
            <span class="info-value">${invData.invoice_date || '-'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">رقم الوصل:</span>
            <span class="info-value" style="font-family: monospace; font-weight: bold;">${invData.invoice_number}</span>
          </div>
          <div class="info-row">
            <span class="info-label">اسم الزبون:</span>
            <span class="info-value">${invData.customer_name}</span>
          </div>
        </div>

        <!-- جدول المنتجات -->
        <table class="receipt-table">
          <thead>
            <tr>
              <th style="width: 8%;">الرقم</th>
              <th style="width: 42%;">التعيين</th>
              <th style="width: 12%;">الكمية</th>
              <th style="width: 18%;">سعر الوحدة</th>
              <th style="width: 20%;">السعر الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold; background: #f0f0f0;">Total</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; background: #f0f0f0;">
                ${totalGoods.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- ملخص الدفع -->
        <div class="receipt-summary">
          <table style="width: 60%; margin-right: auto; margin-left: auto; border-collapse: collapse;">
            <tr>
              <td style="border: 1px solid #000; padding: 5px; text-align: right; width: 60%;">مبلغ الوصل</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold;">
                ${Number(invData.invoice_amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; text-align: right;">كريدي قديم</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center;">
               ${oldCredit.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; text-align: right;">المبلغ المدفوع</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; color: green; font-weight: bold;">
                ${Number(invData.paid_amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; text-align: right; font-weight: bold;">الباقي</td>
              <td style="border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold; color: #c0392b;">
                ${Number(invData.debt || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </table>
        </div>

        <!-- التوقيع -->
        <div class="receipt-footer">
          <p style="text-align: center; font-size: 11px; margin-top: 10px;">شكراً لتعاملكم معنا</p>
        </div>
      </div>
    `;

    // فتح نافذة الطباعة
    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>وصل تسليم - ${invoiceNum}</title>
        <style>
                    @page {
            size: A4 landscape;
            margin: 3mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, sans-serif;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
          }
          .receipt {
            width: 49%;
            height: 200mm;
            background: white;
            padding: 4mm;
            display: flex;
            flex-direction: column;
            border: 1px dashed #999;
            page-break-inside: avoid;
          }
             .receipt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 6px;
            margin-bottom: 8px;
          }
          .receipt-title h2 {
            color: #c0392b;
          }
          .receipt-title p {
            color: #666;
            letter-spacing: 2px;
          }
          .receipt-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 15px;
            margin-bottom: 8px;
            font-size: 12px;
          }
          .info-row {
            display: flex;
            gap: 6px;
          }
          .info-label {
            font-weight: bold;
            color: #333;
          }
          .info-value {
            color: #000;
          }
          .receipt-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 8px;
          }
          .receipt-table th {
            background: #000;
            color: white;
            border: 1px solid #000;
            padding: 5px;
            font-size: 12px;
          }
          .receipt-summary {
            margin-top: 8px;
            font-size: 12px;
          }
          .receipt-footer {
            margin-top: auto;
            border-top: 1px dashed #999;
            padding-top: 5px;
          }
                    @media print {
            body {
              background: white;
            }
            .receipt {
              border: none;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        ${receiptHtml}
        ${receiptHtml}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);

  } catch (err) {
    showAlert("حدث خطأ أثناء إعداد وصل التسليم للطباعة: " + err.message);
    console.error(err);
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
