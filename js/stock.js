/**
 * =========================================================================
 * [الفقرة 8] جدول حالة المخزن الشامل والحسابات التلقائية (stock.js)
 * =========================================================================
 */

async function loadStockTable() {
  showView('view-stock-table');
  showLoader(true);

  try {
       // 1. استرجاع تاريخ التوقيف المحفوظ في الأعلى
    const dateInput = document.getElementById('stock-stop-date');
    if (dateInput) {
      const savedDate = localStorage.getItem('houtane_stock_stop_date');
      if (savedDate) {
        // إذا كان هناك تاريخ محفوظ، استخدمه
        dateInput.value = savedDate;
      } else {
        // إذا لم يكن هناك تاريخ محفوظ، استخدم تاريخ اليوم (لأول مرة فقط)
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        localStorage.setItem('houtane_stock_stop_date', today);
      }
    }
    // 2. جلب المنتجات وجميع العمليات
    const { data: prods, error: prodErr } = await db
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (prodErr) throw prodErr;

    const { data: ops, error: opsErr } = await db
      .from('invoice_operations')
      .select('*');

    if (opsErr) throw opsErr;

    // 3. تجميع حركات السلع لكل منتج
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

    const tbody = document.getElementById('stock-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // إزالة أي سطر مجاميع سابق (إن وُجد) قبل إعادة البناء لتفادي التكرار
    const oldFooter = document.getElementById('stock-tfoot');
    if (oldFooter) oldFooter.remove();

    // 4. تطبيق المعادلات الحسابية
    productsCache = (prods || []).map(p => {
      const s = opsSummary[p.name] || { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
      const baseStock = Number(p.current_stock) || 0;

      // المعادلة: (حالة المخزن + المنتجة + المسترجعة) - (المباعة جملة + هدايا وتالفة + مباعة تجزئة)
      const realStock = (baseStock + s.produced + s.returned) - (s.wholesaleSold + s.wasteAndGifts + s.retailSold);

      return {
        id: p.id,
        name: p.name,
        baseStock: baseStock,
        wholesalePrice: Number(p.wholesale_price) || 0,
        retailPrice: Number(p.retail_price) || 0,
        produced: s.produced,
        wholesaleSold: s.wholesaleSold,
        wasteAndGifts: s.wasteAndGifts,
        returned: s.returned,
        retailSold: s.retailSold,
        currentStock: realStock
      };
    });

    if (productsCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 15px;">لا توجد منتجات مسجلة</td></tr>';
      return;
    }

       // 5. بناء الخلايا الـ 13 المتطابقة تماماً مع ترويسة الجدول
    // متغيرات تجميع المجاميع الإجمالية لكل عمود رقمي
    let totalProduced = 0;
    let totalWholesaleSold = 0;
    let totalWasteAndGifts = 0;
    let totalReturned = 0;
    let totalRetailSold = 0;
    let totalEvalDiff = 0;
    let totalValue = 0;

    productsCache.forEach((p, index) => {
      const evalDiff = p.retailPrice - p.wholesalePrice;
      const realColor = p.currentStock > 0 ? '#16a085' : (p.currentStock < 0 ? '#c0392b' : '#7f8c8d');

      // تنبيه المخزون المنخفض (أقل من 20 قطعة)
      const lowStockThreshold = 20;
      const isLowStock = p.currentStock > 0 && p.currentStock <= lowStockThreshold;
      const stockRowBg = p.currentStock <= 0 ? '#fde8e8' : (isLowStock ? '#fff3cd' : '');

      // تجميع المجاميع
      totalProduced += p.produced;
      totalWholesaleSold += p.wholesaleSold;
      totalWasteAndGifts += p.wasteAndGifts;
      totalReturned += p.returned;
      totalRetailSold += p.retailSold;
      totalEvalDiff += evalDiff;
      totalValue += (p.currentStock * p.wholesalePrice);

      tbody.innerHTML += `
        <tr style="background: ${stockRowBg};">

          <!-- 1. الرقم -->
          <td style="font-weight: bold;">${index + 1}</td>

          <!-- 2. اسم المنتج -->
          <td style="font-weight: bold; text-align: right; padding-right: 10px;">${p.name}</td>

          <!-- 3. حالة المخزن -->
          <td style="background: #f8fafc;">
            <input type="number" value="${p.baseStock}" 
              style="width: 75px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px;"
              onchange="updateBaseStockInline(${p.id}, this.value)">
          </td>

          <!-- 4. سعر الجملة -->
          <td>${Number(p.wholesalePrice).toLocaleString()} دج</td>

          <!-- 5. سعر التجزئة -->
          <td>${Number(p.retailPrice).toLocaleString()} دج</td>

          <!-- 6. المنتجة (+) -->
          <td style="color: #27ae60; font-weight: bold;">${p.produced}</td>

          <!-- 7. مباعة جملة (-) -->
          <td style="color: #e67e22; font-weight: bold;">${p.wholesaleSold}</td>

          <!-- 8. هدايا+تالفة (-) -->
          <td style="color: #c0392b; font-weight: bold;">${p.wasteAndGifts}</td>

          <!-- 9. مسترجعة (+) -->
          <td style="color: #2980b9; font-weight: bold;">${p.returned}</td>

          <!-- 10. مباعة تجزئة (-) -->
          <td style="color: #8e44ad; font-weight: bold;">${p.retailSold}</td>

          <!-- 11. الحقيقي في المخزن -->
          <td style="background: ${isLowStock ? '#ffe0b2' : '#e8f8f5'};">
            <strong style="color: ${realColor}; font-size: 16px;">${p.currentStock}</strong>
            ${isLowStock ? '<br><small style="color: #d35400; font-size: 11px;">⚠️ منخفض</small>' : ''}
          </td>

          <!-- 12. فارق التقييم -->
          <td style="font-weight: bold; color: ${evalDiff >= 0 ? '#27ae60' : '#c0392b'};">
            ${evalDiff.toLocaleString()} دج
          </td>

          <!-- 13. القيمة الإجمالية للمخزون -->
          <td style="font-weight: bold; color: #2980b9; background: #eaf2f8;">
            ${(p.currentStock * p.wholesalePrice).toLocaleString()} دج
          </td>
        </tr>
      `;
    });

    // 6. إضافة سطر المجاميع الثابت في آخر الجدول (tfoot)
    const table = document.getElementById('stock-table');
    if (table) {
      const tfoot = document.createElement('tfoot');
      tfoot.id = 'stock-tfoot';
      tfoot.innerHTML = `
        <tr style="background: #1e293b; color: white; font-weight: bold; border-top: 3px solid #0f172a;">
          <!-- 1 و2. الرقم + اسم المنتج -->
          <td colspan="2" style="padding: 8px; text-align: center;">المجاميع</td>

          <!-- 3. حالة المخزن (بدون معنى تراكمي، تُترك فارغة) -->
          <td></td>

          <!-- 4 و5. أسعار الجملة والتجزئة (بدون معنى تراكمي) -->
          <td></td>
          <td></td>

          <!-- 6. مجموع المنتجة -->
          <td style="color: #4ade80; padding: 8px;">${totalProduced.toLocaleString()}</td>

          <!-- 7. مجموع مباعة جملة -->
          <td style="color: #fdba74; padding: 8px;">${totalWholesaleSold.toLocaleString()}</td>

          <!-- 8. مجموع هدايا+تالفة -->
          <td style="color: #fca5a5; padding: 8px;">${totalWasteAndGifts.toLocaleString()}</td>

          <!-- 9. مجموع المسترجعة -->
          <td style="color: #7dd3fc; padding: 8px;">${totalReturned.toLocaleString()}</td>

          <!-- 10. مجموع مباعة تجزئة -->
          <td style="color: #d8b4fe; padding: 8px;">${totalRetailSold.toLocaleString()}</td>

          <!-- 11. الحقيقي (بدون معنى تراكمي، تُترك فارغة) -->
          <td></td>

          <!-- 12. مجموع فارق التقييم -->
          <td style="padding: 8px; color: ${totalEvalDiff >= 0 ? '#4ade80' : '#fca5a5'};">
            ${totalEvalDiff.toLocaleString()} دج
          </td>

          <!-- 13. مجموع القيمة الإجمالية -->
          <td style="padding: 8px; background: #0f172a; color: #38bdf8;">
            ${totalValue.toLocaleString()} دج
          </td>
        </tr>
      `;
      table.appendChild(tfoot);
    }

  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل جدول المخزون: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * حفظ تاريخ التوقيف
 */
function saveStockStopDate(dateVal) {
  localStorage.setItem('houtane_stock_stop_date', dateVal);
}

/**
 * تعديل وحفظ المخزون الابتدائي (العمود 3) مباشرة
 */
async function updateBaseStockInline(productId, newValue) {
  const val = parseFloat(newValue) || 0;
  showLoader(true);
  try {
    const { error } = await db
      .from('products')
      .update({ current_stock: val })
      .eq('id', productId);

    if (error) throw error;
    await preloadData();
    await loadStockTable();
  } catch (err) {
    showAlert("تعذر تحديث المخزون الابتدائي: " + err.message);
  } finally {
    showLoader(false);
  }
}
