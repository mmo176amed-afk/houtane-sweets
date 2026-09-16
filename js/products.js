/**
 * =========================================================================
 * [الفقرة 3] واجهة إضافة وتعديل المنتجات (products.js)
 * =========================================================================
 */

/**
 * تعبئة قائمة المنتجات المقترحة أثناء البحث والكتابة
 */
function populateProductDatalist() {
  const datalist = document.getElementById('products-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  productsCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    datalist.appendChild(opt);
  });
}

/**
 * فحص هل المنتج موجود مسبقاً لعرض بياناته، وتغيير شكل الحقل حسب الحالة:
 * - منتج موجود: الكمية المُدخلة تُسجَّل كعملية "إنتاج جديد" (تضاف لعمود منتجة +)
 * - منتج جديد: الكمية المُدخلة هي المخزون الابتدائي
 */
function checkProductExists(name) {
  const msg = document.getElementById('product-status-msg');
  const btn = document.getElementById('btn-save-prod');
  const wsInput = document.getElementById('p-wholesale');
  const rtInput = document.getElementById('p-retail');
  const qtyLabel = document.getElementById('p-qty-label');

  if (!name.trim()) {
    if (msg) msg.innerText = '';
    if (qtyLabel) qtyLabel.innerText = 'الكمية المنتجة / الابتدائية';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ المنتج';
    return;
  }

  const found = productsCache.find(p => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== null);
  if (found) {
    if (msg) {
      msg.style.color = '#e67e22';
      msg.innerText = `منتج مسجل مسبقاً (المخزون الحالي: ${found.currentStock}) — الكمية هنا ستُضاف كإنتاج جديد، وليست استبدالاً`;
    }
    if (wsInput) wsInput.value = found.wholesalePrice;
    if (rtInput) rtInput.value = found.retailPrice;
    if (qtyLabel) qtyLabel.innerText = 'الكمية المنتجة (ستُضاف كعملية إنتاج جديدة)';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> تسجيل الإنتاج وتحديث الأسعار';
  } else {
    if (msg) {
      msg.style.color = '#27ae60';
      msg.innerText = 'منتج جديد سيتم إضافته';
    }
    if (qtyLabel) qtyLabel.innerText = 'الكمية المنتجة الابتدائية';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ المنتج';
  }
}

/**
 * حفظ منتج جديد في جدول products، أو تسجيل كمية إنتاج جديدة لمنتج موجود
 * (تُسجَّل كعملية "سلعة منتجة" في invoice_operations فتظهر في عمود "منتجة +"
 * بجدول حالة المخزون، بدل الكتابة المباشرة على المخزون الابتدائي)
 */
async function submitProduct() {
  const name = document.getElementById('p-name').value.trim();
  const qty = Number(document.getElementById('p-qty').value) || 0;
  const wholesale = Number(document.getElementById('p-wholesale').value) || 0;
  const retail = Number(document.getElementById('p-retail').value) || 0;

  if (!name) {
    showAlert("يرجى كتابة اسم المنتج!");
    return;
  }

  showLoader(true);
  try {
    const existing = productsCache.find(p => p.name.toLowerCase() === name.toLowerCase() && p.id !== null);

    if (existing) {
      // تحديث الأسعار فقط في بطاقة المنتج (لا نلمس current_stock هنا)
      await db.from('products').update({
        wholesale_price: wholesale,
        retail_price: retail
      }).eq('id', existing.id);

      // إن أُدخلت كمية، تُسجَّل كعملية إنتاج جديدة تُحسب في عمود "منتجة (+)"
      if (qty > 0) {
        const { error: opErr } = await db.from('invoice_operations').insert([{
          customer_name: 'إنتاج داخلي',
          invoice_number: `PROD-${Date.now()}`,
          operation_type: 'سلعة منتجة',
          product_name: existing.name,
          price: wholesale,
          quantity: qty,
          operation_date: new Date().toISOString().split('T')[0]
        }]);
        if (opErr) throw opErr;
      }

      showAlert(qty > 0
        ? "تم تحديث بيانات المنتج وتسجيل كمية الإنتاج الجديدة بنجاح!"
        : "تم تحديث بيانات المنتج بنجاح!");
    } else {
      await db.from('products').insert([{
        name: name,
        current_stock: qty,
        wholesale_price: wholesale,
        retail_price: retail
      }]);
      showAlert("تمت إضافة المنتج بنجاح!");
    }

    document.getElementById('p-name').value = '';
    document.getElementById('p-qty').value = '';
    document.getElementById('p-wholesale').value = '';
    document.getElementById('p-retail').value = '';

    await preloadData();
    showDashboard();
  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ المنتج: " + err.message);
  } finally {
    showLoader(false);
  }
}
