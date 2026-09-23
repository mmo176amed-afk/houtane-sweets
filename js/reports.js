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
    const oldCredit = Number(invData.old_credit) || 0;

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
 * 3. دالة طباعة فاتورة الطريق (Facture - تصميم احترافي)
 */
async function printRoadInvoice(invoiceNum, customerName) {
  showLoader(true);
  try {
    // 1. جلب تفاصيل الفاتورة
    const { data: invData, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNum)
      .single();

    if (invErr) throw invErr;

    // 2. جلب تفاصيل المنتجات
    const { data: items, error: itemsErr } = await db
      .from('invoice_operations')
      .select('*')
      .eq('receipt_number', invoiceNum);

    if (itemsErr) throw itemsErr;

    // 3. جلب معلومات الزبون
    const { data: custData, error: custErr } = await db
      .from('customers')
      .select('*')
      .eq('name', invData.customer_name)
      .maybeSingle();

    if (custErr) console.warn("تحذير: لم يتم جلب بيانات الزبون:", custErr);

    // 4. الحسابات المالية
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

    // الحسابات
    const totalHT = totalGoods;
    const tvaRate = 0.19;
    const totalTVA = totalHT * tvaRate;
    const totalTTC = totalHT + totalTVA;
    const timbreFiscal = totalTTC * 0.01; // 1% من TTC
    const netAPayer = totalTTC + timbreFiscal;

    // تحويل المبلغ إلى حروف (مبسط - فقط للأرقام الصحيحة)
    const netAPayerInt = Math.floor(netAPayer);
    const netAPayerCents = Math.round((netAPayer - netAPayerInt) * 100);
    const amountInWords = convertToArabicWords(netAPayerInt) + ` و ${netAPayerCents} سنتيم`;

    // معلومات الزبون
    const custRC = custData ? (custData.rc || '-') : '-';
    const custNIF = custData ? (custData.nif || '-') : '-';
    const custAddress = custData ? (custData.address || '-') : '-';

    // 5. تصميم الفاتورة
    const invoiceHtml = `
      <div class="invoice">
        
        <!-- ================= الترويسة ================= -->
        <div class="invoice-header">
          <div class="header-left">
            <img src="${COMPANY_INFO.logoUrl}" alt="Logo" style="height: 70px;">
          </div>
          <div class="header-center">
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">${COMPANY_INFO.name}</h2>
            <div style="font-size: 11px; margin-top: 5px; line-height: 1.6;">
              <div><strong>RC:</strong> ${COMPANY_INFO.rc}</div>
              <div><strong>NIF:</strong> ${COMPANY_INFO.nif}</div>
              <div><strong>NIS:</strong> ${COMPANY_INFO.nis}</div>
              <div><strong>N° art:</strong> ${COMPANY_INFO.art}</div>
              <div><strong>adress:</strong> ${COMPANY_INFO.address}</div>
            </div>
          </div>
        </div>

        <!-- ================= معلومات الزبون ================= -->
        <div class="client-info">
          <div style="border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px;">
            <strong>Client:</strong> ${invData.customer_name}
          </div>
          <div><strong>adress:</strong> ${custAddress}</div>
          <div style="display: flex; justify-content: space-between;">
            <div><strong>NIF:</strong> ${custNIF}</div>
            <div style="font-weight: bold; font-size: 12px;">${invData.invoice_date || '-'}</div>
          </div>
          <div><strong>RC:</strong> ${custRC}</div>
        </div>

        <!-- ================= جدول المنتجات ================= -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 6%;">N</th>
              <th style="width: 44%;">produit</th>
              <th style="width: 12%;">QNTE</th>
              <th style="width: 18%;">P U</th>
              <th style="width: 20%;">MONTANT</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
            <tr>
              <td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; font-size: 13px;">TOTALE</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold; font-size: 13px;">
                ${totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- ================= المجاميع ================= -->
        <div class="invoice-totals">
          <div style="display: flex; justify-content: space-between; gap: 15px;">
            
            <!-- العمود الأيسر: المجاميع -->
            <div style="flex: 1; font-size: 11px; line-height: 1.8;">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 3px 0;">
                <span>Total HT:</span>
                <strong>${totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 3px 0;">
                <span>Total TVA:</span>
                <strong>${totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 3px 0;">
                <span>Total TTC:</span>
                <strong>${totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; padding: 3px 0;">
                <span>Timbre fiscal:</span>
                <strong>${timbreFiscal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-top: 2px solid #000; padding: 4px 0; font-weight: bold; font-size: 12px;">
                <span>Net à payer :</span>
                <strong>${netAPayer.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>

            <!-- العمود الأيمن: جدول TVA -->
            <div style="flex: 1;">
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                  <tr>
                    <th style="border: 1px solid #000; padding: 4px; background: #f0f0f0;">Taux</th>
                    <th style="border: 1px solid #000; padding: 4px; background: #f0f0f0;">Montant HT</th>
                    <th style="border: 1px solid #000; padding: 4px; background: #f0f0f0;">Montant TVA</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="border: 1px solid #000; padding: 4px; text-align: center;">19%</td>
                    <td style="border: 1px solid #000; padding: 4px; text-align: center;">${totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="border: 1px solid #000; padding: 4px; text-align: center;">${totalTVA.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ================= طرق الدفع والمبلغ بالحروف ================= -->
        <div class="invoice-footer">
          <div style="font-size: 11px; margin-bottom: 4px;">
            <strong>mode de règlement :</strong> à terme
          </div>
          <div style="font-size: 11px; border-top: 1px solid #000; padding-top: 4px;">
            <strong>Arrêter la somme de la présente facture:</strong><br>
            ${amountInWords}
          </div>
          <div style="text-align: left; margin-top: 15px; font-size: 11px;">
            <strong>Cachet et signature</strong>
          </div>
        </div>

      </div>
    `;

    // 6. فتح نافذة الطباعة
    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(`
      <html dir="ltr" lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Facture - ${invoiceNum}</title>
        <style>
          @page {
            size: A4;
            margin: 8mm;
          }
          * {
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, sans-serif;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
            color: #000;
          }
          .invoice {
            width: 100%;
            padding: 5mm;
            font-size: 12px;
          }
          .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 1px solid #000;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .header-center {
            flex: 1;
            text-align: center;
          }
          .client-info {
            font-size: 11px;
            line-height: 1.5;
            margin-bottom: 8px;
            padding: 4px;
            border: 1px solid #000;
          }
          .invoice-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 6px;
          }
          .invoice-table th {
            background: #f0f0f0;
            color: #000;
            border: 1px solid #000;
            padding: 4px;
            font-size: 11px;
          }
          .invoice-totals {
            margin-top: 6px;
          }
          .invoice-footer {
            margin-top: 10px;
            padding-top: 6px;
            border-top: 1px solid #000;
          }
          @media print {
            body { background: white; }
          }
        </style>
      </head>
      <body>
        ${invoiceHtml}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);

  } catch (err) {
    showAlert("حدث خطأ أثناء إعداد فاتورة الطريق: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * دالة مساعدة: تحويل الأرقام إلى حروف عربية
 */
function convertToArabicWords(num) {
  if (num === 0) return "صفر";
  
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
                "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
                "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  function convertChunk(n) {
    let result = "";
    if (n >= 100) {
      result += hundreds[Math.floor(n / 100)] + " ";
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)];
      if (n % 10 > 0) result += " و" + ones[n % 10];
      result += " ";
    } else if (n > 0) {
      result += ones[n] + " ";
    }
    return result;
  }

  let result = "";
  
  const milliards = Math.floor(num / 1000000000);
  const millions = Math.floor((num % 1000000000) / 1000000);
  const milliers = Math.floor((num % 1000000) / 1000);
  const reste = num % 1000;

  if (milliards > 0) result += convertChunk(milliards) + "مليار ";
  if (millions > 0) result += convertChunk(millions) + "مليون ";
  if (milliers > 0) result += convertChunk(milliers) + "ألف ";
  if (reste > 0) result += convertChunk(reste);

  return result.trim() + " دينار جزائري";
}

/**
 * دالة مساعدة داخلية: تحذف كل صفوف جدول معيّن، وتتحقق فعلياً من أن الحذف
 * نجح (باستخدام select() على استعلام الحذف لمعرفة عدد الصفوف المحذوفة فعلياً).
 * إن كان عدد الصفوف المحذوفة صفراً بينما الجدول لم يكن فارغاً، فهذا يعني
 * غالباً أن صلاحيات RLS في Supabase تمنع الحذف بصمت دون أي رسالة خطأ.
 */
async function deleteAllRowsAndVerify(tableName) {
  // نتحقق أولاً هل الجدول يحتوي على صفوف أصلاً
  const { count: beforeCount, error: countErr } = await db
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countErr) throw countErr;

  if (!beforeCount || beforeCount === 0) {
    return { table: tableName, before: 0, deleted: 0, ok: true };
  }

  // الحذف مع طلب استرجاع الصفوف المحذوفة فعلياً للتحقق من نجاح العملية
  const { data: deletedRows, error: delErr } = await db
    .from(tableName)
    .delete()
    .neq('id', 0)
    .select('id');

  if (delErr) throw delErr;

  const deletedCount = (deletedRows || []).length;

  return {
    table: tableName,
    before: beforeCount,
    deleted: deletedCount,
    ok: deletedCount >= beforeCount
  };
}

/**
 * 4. دالة الإغلاق السنوي وتصفية الحسابات (محمية بكلمة سر)
 *    -- نسخة محدّثة:
 *       1) تحسب المخزون الحقيقي الحالي لكل منتج وتنقله إلى current_stock.
 *       2) تجمع كريدي زبائن التجزئة على الموزع (من retail_credits).
 *       3) تنقل ديون زبائن الجملة إلى old_credit.
 *       4) تصفّر last_invoice_seq للجميع.
 *       5) تحذف invoices و invoice_operations و retail_distributions و retail_credits
 *          مع التحقق الفعلي من نجاح كل عملية حذف (لاكتشاف مشاكل صلاحيات RLS).
 */
async function closeYearAndCarryOverDebt() {
   // ✅ حماية احتياطية (في حال تم استدعاء الدالة من Console)
  if (!checkUserRole('admin')) {
    return;
  }
  const enteredPass = prompt("عملية حساسة: أدخل كلمة المرور لتأكيد إغلاق السنة (سيتم حذف كل الفواتير وسجل العمليات، ونقل الديون والمخزون الحالي كنقطة بداية للعام الجديد):");

  if (enteredPass === null) return;

  if (enteredPass !== SECURITY_CONFIG.yearClosePassword) {
    showAlert("كلمة المرور غير صحيحة! تم إلغاء العملية.");
    return;
  }

  const confirmed = confirm("تحذير أخير: ستُحذف نهائياً جميع الفواتير وجميع عمليات المنتجات، وسيُصبح المخزون الحقيقي الحالي هو نقطة البداية للعام الجديد، وستُنقل ديون زبائن الجملة إلى بطاقاتهم، وسيُجمع كريدي زبائن التجزئة على الموزع. هذا الإجراء لا يمكن التراجع عنه إطلاقاً. هل أنت متأكد؟");
  if (!confirmed) return;

  // ✅ تصدير الأرشيف قبل الحذف
  showLoader(true);
  const exportSuccess = await exportYearArchiveToExcel(new Date().getFullYear());
  showLoader(false);
  
  if (!exportSuccess) {
    const proceedWithoutExport = confirm("فشل تصدير الأرشيف! هل تريد المتابعة إلى الحذف على أي حال؟\n\n(تحذير: لن يكون هناك نسخة احتياطية)");
    if (!proceedWithoutExport) {
      showAlert("تم إلغاء عملية إغلاق السنة.");
      return;
    }
  }

  showLoader(true);
  
  try {
    // ============ 1. جلب البيانات اللازمة ============
    const { data: allInvoices, error: invErr } = await db
      .from('invoices')
      .select('*')
      .order('id', { ascending: true });
    if (invErr) throw invErr;

    const { data: retailCredits, error: rcErr } = await db
      .from('retail_credits')
      .select('*');
    if (rcErr) throw rcErr;

    const { data: allCustomers, error: custErr } = await db
      .from('customers')
      .select('*');
    if (custErr) throw custErr;

    // ============ 2. حساب الديون النهائية ============
    // 2-أ. ديون زبائن الجملة من جدول invoices
    const wholesaleFinalDebts = {};
    (allInvoices || []).forEach(inv => {
      wholesaleFinalDebts[inv.customer_name] = Number(inv.debt) || 0;
    });

    // 2-ب. تجميع كريدي زبائن التجزئة على الموزع من retail_credits
    // credit = دين على الزبون (يُجمع)
    // collection = تحصيل (يُطرح)
    const distributorFinalDebts = {};
    (retailCredits || []).forEach(rc => {
      const distName = rc.distributor_name;
      if (!distName) return;
      if (!distributorFinalDebts[distName]) {
        distributorFinalDebts[distName] = 0;
      }
      const amount = Number(rc.amount) || 0;
      if (rc.operation_type === 'credit') {
        distributorFinalDebts[distName] += amount;
      } else if (rc.operation_type === 'collection') {
        distributorFinalDebts[distName] -= amount;
      }
    });

    // ============ 3. تحديث بطاقات الزبائن ============
    for (const cust of (allCustomers || [])) {
      let finalDebt = 0;

      if (cust.type === 'detail') {
        // زبون تجزئة: لا يُنقل دينه إلى بطاقته، يبقى صفرًا
        // (دينه سيُجمع على الموزع)
        finalDebt = 0;
      } else if (cust.type === 'gros' || cust.type === 'distributor') {
        // زبون جملة أو موزع: يُنقل دينه من invoices
        finalDebt = wholesaleFinalDebts.hasOwnProperty(cust.name)
          ? wholesaleFinalDebts[cust.name]
          : (cust.old_credit || 0);
      } else {
        // نوع آخر: يبقى كما هو
        finalDebt = cust.old_credit || 0;
      }

      const { error: updErr } = await db.from('customers').update({
        old_credit: finalDebt,
        last_invoice_seq: 0
      }).eq('id', cust.id);
      if (updErr) throw updErr;
    }

    // 3-ب. تحديث الموزعين الذين لديهم كريدي تجزئة مجمّع
    // (حتى لو لم يكونوا مسجلين كزبائن، نضيفهم أو نحدّثهم)
    for (const distName of Object.keys(distributorFinalDebts)) {
      const existingCust = (allCustomers || []).find(c => c.name === distName);
      const aggregatedCredit = distributorFinalDebts[distName];

      if (existingCust) {
        // موجود: نضيف الكريدي المجمّع إلى old_credit الحالي
        const newOldCredit = (Number(existingCust.old_credit) || 0) + aggregatedCredit;
        const { error: updErr } = await db.from('customers').update({
          old_credit: newOldCredit,
          last_invoice_seq: 0
        }).eq('id', existingCust.id);
        if (updErr) throw updErr;
      } else {
        // غير موجود: ننشئه كموزع تجزئة
        const { error: insErr } = await db.from('customers').insert([{
          name: distName,
          type: 'distributor',
          old_credit: aggregatedCredit,
          last_invoice_seq: 0
        }]);
        if (insErr) throw insErr;
      }
    }

    // ============ 4. نقل المخزون الحقيقي إلى current_stock ============
    const { data: prods, error: pErr } = await db.from('products').select('*');
    if (pErr) throw pErr;

    const { data: ops, error: opsErr } = await db.from('invoice_operations').select('*');
    if (opsErr) throw opsErr;

    const opsSummary = {};
    (ops || []).forEach(op => {
      const pName = op.product_name;
      if (!opsSummary[pName]) {
        opsSummary[pName] = { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
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

    for (const p of (prods || [])) {
      const baseStock = Number(p.current_stock) || 0;
      const s = opsSummary[p.name] || { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
      const realStock = (baseStock + s.produced + s.returned) - (s.wholesaleSold + s.wasteAndGifts + s.retailSold);

      const { error: stockErr } = await db.from('products').update({ current_stock: realStock }).eq('id', p.id);
      if (stockErr) throw stockErr;
    }

    // ============ 5. حذف الفواتير والعمليات مع التحقق الفعلي من نجاح الحذف ============
    // -- هذا هو الجزء الذي تم تعزيزه: كل عملية حذف تُتحقق منها فعلياً --
    const tablesToClear = ['invoice_operations', 'invoices', 'retail_distributions', 'retail_credits'];
    const deletionResults = [];

    for (const tbl of tablesToClear) {
      const res = await deleteAllRowsAndVerify(tbl);
      deletionResults.push(res);
    }

    // ملاحظة: لا نحذف customers

    // التحقق من وجود جداول لم يُحذف منها أي شيء رغم أنها لم تكن فارغة
    const failedTables = deletionResults.filter(r => !r.ok);

    if (failedTables.length > 0) {
      const failedNames = failedTables.map(f => `- ${f.table} (كان بها ${f.before} سطر، حُذف منها ${f.deleted} فقط)`).join('\n');
      showAlert(
        "⚠️ تم تنفيذ إغلاق السنة (المخزون والديون تم تحديثها بنجاح)، لكن فشل حذف البيانات من الجداول التالية:\n\n" +
        failedNames +
        "\n\nهذا يعني على الأرجح أن صلاحيات RLS في Supabase تمنع عمليات الحذف (DELETE) على هذه الجداول. " +
        "يرجى الذهاب إلى Supabase → Authentication → Policies، والتأكد من وجود سياسة (Policy) من نوع DELETE تسمح بالحذف على هذه الجداول."
      );
    } else {
      showAlert("تم إغلاق السنة بنجاح! المخزون الحقيقي أصبح نقطة البداية للعام الجديد، ونُقلت ديون زبائن الجملة إلى بطاقاتهم، وجُمع كريدي زبائن التجزئة على الموزعين، وتم تفريغ سجل الفواتير والعمليات بالكامل.");
    }

    await preloadData();
    await loadInvoicesTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء إغلاق السنة: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}
