/**
 * =========================================================================
 * [الفقرة 8] جدول حالة وحركة المخزن الشامل (13 عموداً) (stock.js)
 * =========================================================================
 * يقوم هذا الملف بجلب كافة المنتجات وسجل حركات السلع، ثم يطبق المعادلات الحسابية:
 * 1. حساب الكميات المنتجة، المباعة، التالفة، المسترجعة، ومبيعات التجزئة.
 * 2. حساب المخزون الحقيقي: (حالة المخزن + المنتجة + المسترجعة) - (المباعة جملة + الهدايا والتالفة + المباعة تجزئة).
 * 3. حساب فارق التقييم: (سعر التجزئة - سعر الجملة).
 * 4. إتاحة التعديل والحفظ الفوري لتاريخ الإدخال والتوقيف، وحالة المخزن الابتدائية.
 */

/**
 * دالة جلب وبناء جدول المخزن الشامل
 */
async function loadStockTable() {
  // إظهار شاشة المخزن وإظهار مؤشر التحميل
  showView('view-stock-table');
  showLoader(true);

  try {
    // خطوة 1: جلب كافة بيانات المنتجات من جدول products مرتبة تصاعدياً
    const { data: prods, error: prodErr } = await db
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (prodErr) throw prodErr;

    // خطوة 2: جلب كافة العمليات المسجلة من جدول invoice_operations لحساب الحركات
    const { data: ops, error: opsErr } = await db
      .from('invoice_operations')
      .select('*');

    if (opsErr) throw opsErr;

    // خطوة 3: تجميع وتصنيف الكميات لكل منتج حسب نوع العملية
    const opsSummary = {};
    (ops || []).forEach(op => {
      const pName = op.product_name;
      // إنشاء كائن تجميعي لكل منتج إذا لم يكن موجوداً
      if (!opsSummary[pName]) {
        opsSummary[pName] = {
          produced: 0,       // السلعة المنتجة (العمود 7)
          wholesaleSold: 0,  // المباعة في الجملة (العمود 8)
          wasteAndGifts: 0,  // الهدايا والتالفة (العمود 9)
          returned: 0,       // المسترجعة (العمود 10)
          retailSold: 0      // المباعة بالتجزئة (العمود 11)
        };
      }

      const qty = Number(op.quantity) || 0;
      // تصنيف العمليات حسب نوعها
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

    // خطوة 4: معالجة البيانات وتطبيق المعادلات الحسابية على المنتجات
    productsCache = (prods || []).map(p => {
      const s = opsSummary[p.name] || { produced: 0, wholesaleSold: 0, wasteAndGifts: 0, returned: 0, retailSold: 0 };
      const baseStock = Number(p.current_stock) || 0; // العمود 4: حالة المخزن الابتدائية

      // تطبيق المعادلة: (العمود 4 + العمود 7 + العمود 10) - (العمود 8 + العمود 9 + العمود 11)
      const realStock = (baseStock + s.produced + s.returned) - (s.wholesaleSold + s.wasteAndGifts + s.retailSold);

      return {
        id: p.id,
        name: p.name,
        stoppedDate: p.notes || '', // العمود 3: حقل التاريخ والتوقيف اليدوي
        baseStock: baseStock,       // العمود 4: المخزون الابتدائي
        wholesalePrice: Number(p.wholesale_price) || 0, // العمود 5: سعر الجملة
        retailPrice: Number(p.retail_price) || 0,       // العمود 6: سعر التجزئة
        produced: s.produced,                           // العمود 7: المنتجة
        wholesaleSold: s.wholesaleSold,                 // العمود 8: مباعة جملة
        wasteAndGifts: s.wasteAndGifts,                 // العمود 9: هدايا + تالفة
        returned: s.returned,                           // العمود 10: مسترجعة
        retailSold: s.retailSold,                       // العمود 11: مباعة تجزئة
        currentStock: realStock                         // العمود 12: الحقيقي في المخزن
      };
    });

    if (productsCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 15px;">لا توجد منتجات مسجلة</td></tr>';
      return;
    }

    // خطوة 5: رسم صفوف الجدول وعرض البيانات المنسقة
    productsCache.forEach((p, index) => {
      // حساب العمود 13: فارق التقييم = سعر التجزئة (عمود 6) - سعر الجملة (عمود 5)
      const evalDiff = p.retailPrice - p.wholesalePrice;
      const realColor = p.currentStock > 0 ? '#16a085' : (p.currentStock < 0 ? '#c0392b' : '#7f8c8d');

      tbody.innerHTML += `
        <tr>
          <!-- العمود 1: الرقم التسلسلي -->
          <td style="font-weight: bold;">${index + 1}</td>

          <!-- العمود 2: اسم المنتج -->
          <td style="font-weight: bold; text-align: right; padding-right: 10px;">${p.name}</td>

          <!-- العمود 3: تاريخ الإدخال / أوقفت يوم (إدخال وحفظ يدوي فوري) -->
          <td>
            <input type="text" value="${p.stoppedDate}" placeholder="أوقفت يوم: --/--/----" 
              style="width: 150px; text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; font-size: 13px;"
              onchange="updateProductStoppedDate(${p.id}, this.value)">
          </td>

          <!-- العمود 4: حالة المخزن (الابتدائي - تعديل وحفظ فوري) -->
          <td style="background: #f8fafc;">
            <input type="number" value="${p.baseStock}" 
              style="width: 70px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px;"
              onchange="updateBaseStockInline(${p.id}, this.value)">
          </td>

          <!-- العمود 5: سعر الجملة -->
          <td>${Number(p.wholesalePrice).toLocaleString()} دج</td>

          <!-- العمود 6: سعر التجزئة -->
          <td>${Number(p.retailPrice).toLocaleString()} دج</td>

          <!-- العمود 7: السلعة المنتجة (+) -->
          <td style="color: #27ae60; font-weight: bold;">${p.produced}</td>

          <!-- العمود 8: السلعة المباعة في الجملة (-) -->
          <td style="color: #e67e22; font-weight: bold;">${p.wholesaleSold}</td>

          <!-- العمود 9: هدايا + تالفة (-) -->
          <td style="color: #c0392b; font-weight: bold;">${p.wasteAndGifts}</td>

          <!-- العمود 10: السلعة المسترجعة (+) -->
          <td style="color: #2980b9; font-weight: bold;">${p.returned}</td>

          <!-- العمود 11: السلعة المباعة في التجزئة (-) -->
          <td style="color: #8e44ad; font-weight: bold;">${p.retailSold}</td>

          <!-- العمود 12: الحقيقي في المخزن (المعادلة الحسابية الصافية) -->
          <td style="background: #e8f8f5;">
            <strong style="color: ${realColor}; font-size: 16px;">${p.currentStock}</strong>
          </td>

          <!-- العمود 13: فارق التقييم (العمود 6 - العمود 5) -->
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
 * دالة حفظ تاريخ الإدخال والتوقيف اليدوي (العمود 3) مباشرة في قاعدة البيانات
 */
async function updateProductStoppedDate(productId, dateText) {
  showLoader(true);
  try {
    const { error } = await db
      .from('products')
      .update({ notes: dateText })
      .eq('id', productId);

    if (error) throw error;
    await preloadData();
  } catch (err) {
    showAlert("تعذر حفظ تاريخ التوقيف: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * دالة الحفظ الفوري عند تعديل خانة "حالة المخزن" (العمود 4) وتحديث الرصيد الحقيقي تلقائياً
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
    // إعادة تحميل البيانات وإعادة رسم الجدول بالقيم المحسوبة الجديدة
    await preloadData();
    await loadStockTable();
  } catch (err) {
    showAlert("تعذر تحديث المخزون الابتدائي: " + err.message);
  } finally {
    showLoader(false);
  }
}
