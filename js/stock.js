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
    const savedDate = localStorage.getItem('houtane_stock_stop_date') || new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('stock-stop-date');
    if (dateInput) dateInput.value = savedDate;

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
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 15px;">لا توجد منتجات مسجلة</td></tr>';
      return;
    }

    // 5. بناء الخلايا الـ 12 المتطابقة تماماً مع ترويسة الجدول
    productsCache.forEach((p, index) => {
      const evalDiff = p.retailPrice - p.wholesalePrice;
      const realColor = p.currentStock > 0 ? '#16a085' : (p.currentStock < 0 ? '#c0392b' : '#7f8c8d');

      tbody.innerHTML += `
        <tr>
          <!-- 1. الرقم -->
          <td style="font-weight: bold;">${index + 1}</td>

          <!-- 2. اسم المنتج -->
          <td style="font-weight: bold; text-align: right; padding-right: 10px;">${p.name}</td>

          <!-- 3. حالة المخزن (تعديل وحفظ فوري) -->
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
          <td style="background: #e8f8f5;">
            <strong style="color: ${realColor}; font-size: 16px;">${p.currentStock}</strong>
          </td>

          <!-- 12. فارق التقييم -->
          <td style="font-weight: bold; color: ${evalDiff >= 0 ? '#27ae60' : '#c0392b'};">
            ${evalDiff.toLocaleString()} دج
          </td>
        </tr>
      `;
    });

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
