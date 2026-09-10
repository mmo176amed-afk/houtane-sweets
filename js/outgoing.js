/**
 * =========================================================================
 * جدول السلعة الخارجة - فواتير زبائن الجملة (js/outgoing.js)
 * =========================================================================
 */

async function loadOutgoingGoodsTable() {
  showView('view-outgoing-goods');
  showLoader(true);

  try {
    // 1. جلب المنتجات بنفس ترتيب جدول المخزن
    const { data: prods, error: pErr } = await db
      .from('products')
      .select('id, name')
      .order('id', { ascending: true });
    if (pErr) throw pErr;

    // 2. جلب جميع الفواتير
    const { data: invs, error: iErr } = await db
      .from('invoices')
      .select('*')
      .order('invoice_date', { ascending: true });
    if (iErr) throw iErr;

    // 3. جلب جميع عمليات التوزيع (السلع الخارجة للجملة)
    const { data: ops, error: oErr } = await db
      .from('invoice_operations')
      .select('*')
      .eq('operation_type', 'وصل جديد (توزيع)');
    if (oErr) throw oErr;

    const thead = document.getElementById('outgoing-thead');
    const tbody = document.getElementById('outgoing-tbody');
    const tfoot = document.getElementById('outgoing-tfoot');

    if (!thead || !tbody || !tfoot) return;

    // 4. بناء ترويسة الجدول المتطابقة مع شيت الإكسل
    let prodHeadersHtml = '';
    prods.forEach(p => {
      prodHeadersHtml += `
        <th style="background: #27ae60; color: white; min-width: 90px; padding: 10px 4px; font-size: 13px; border: 1px solid #1e8449;">
          ${p.name}
        </th>
      `;
    });

    thead.innerHTML = `
      <tr>
        <th style="background: #2c3e50; color: white; min-width: 50px; border: 1px solid #1a252f;">الرقم</th>
        <th style="background: #27ae60; color: white; min-width: 150px; border: 1px solid #1e8449;">إسم الزبون</th>
        <th style="background: #2c3e50; color: white; min-width: 120px; border: 1px solid #1a252f;">رقم الوصل</th>
        <th style="background: #2c3e50; color: white; min-width: 110px; border: 1px solid #1a252f;">التاريخ</th>
        ${prodHeadersHtml}
      </tr>
    `;

    if (!invs || invs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${4 + prods.length}" style="padding: 20px; text-align: center;">لا توجد فواتير مسجلة بعد</td></tr>`;
      tfoot.innerHTML = '';
      return;
    }

    // تهيئة كائن تجميع مجاميع الأعمدة السفلية لكل منتج
    const columnSums = {};
    prods.forEach(p => { columnSums[p.name] = 0; });

    // 5. رسم سطور الفواتير
    tbody.innerHTML = '';
    invs.forEach((inv, idx) => {
      // استخراج سلع هذا الوصل
      const invoiceOps = (ops || []).filter(o => o.invoice_number === inv.invoice_number);
      const rowProdMap = {};
      invoiceOps.forEach(o => {
        rowProdMap[o.product_name] = (rowProdMap[o.product_name] || 0) + (Number(o.quantity) || 0);
      });

      let prodColsHtml = '';
      prods.forEach(p => {
        const qty = rowProdMap[p.name] || 0;
        columnSums[p.name] += qty; // إضافة للمجموع الكلي للعمود

        prodColsHtml += `
          <td style="font-weight: bold; border: 1px solid #e2e8f0; ${qty > 0 ? 'background: #e8f8f5; color: #16a085; font-size: 15px;' : 'color: #ccc;'}">
            ${qty > 0 ? qty : ''}
          </td>
        `;
      });

      tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold; border: 1px solid #e2e8f0;">${idx + 1}</td>
          <td style="font-weight: bold; text-align: right; padding-right: 12px; border: 1px solid #e2e8f0;">${inv.customer_name}</td>
          <td style="font-weight: bold; font-family: monospace; color: #2980b9; border: 1px solid #e2e8f0;">${inv.invoice_number}</td>
          <td style="border: 1px solid #e2e8f0;">${inv.invoice_date}</td>
          ${prodColsHtml}
        </tr>
      `;
    });

    // 6. بناء سطر المجاميع النهائي (المجموع الكلي لكل منتج)
    let footerProdCols = '';
    prods.forEach(p => {
      const sum = columnSums[p.name];
      footerProdCols += `
        <td style="background: #1e293b; color: #2ecc71; font-weight: bold; font-size: 15px; border: 1px solid #0f172a;">
          ${sum}
        </td>
      `;
    });

    tfoot.innerHTML = `
      <tr style="border-top: 3px solid #0f172a;">
        <td colspan="4" style="background: #0f172a; color: white; font-weight: bold; font-size: 15px; text-align: center; padding: 10px;">
          المجموع الكلي (المنقول لحالة المخزن):
        </td>
        ${footerProdCols}
      </tr>
    `;

  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل جدول السلعة الخارجة: " + err.message);
  } finally {
    showLoader(false);
  }
}
