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
 * فحص هل المنتج موجود مسبقاً لعرض بياناته للتعديل
 */
function checkProductExists(name) {
  const msg = document.getElementById('product-status-msg');
  const btn = document.getElementById('btn-save-prod');
  const wsInput = document.getElementById('p-wholesale');
  const rtInput = document.getElementById('p-retail');

  if (!name.trim()) {
    if (msg) msg.innerText = '';
    return;
  }

  const found = productsCache.find(p => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== null);
  if (found) {
    if (msg) {
      msg.style.color = '#e67e22';
      msg.innerText = `المنتج مسجل مسبقاً (مخزون: ${found.currentStock})`;
    }
    if (wsInput) wsInput.value = found.wholesalePrice;
    if (rtInput) rtInput.value = found.retailPrice;
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل المنتج';
  } else {
    if (msg) {
      msg.style.color = '#27ae60';
      msg.innerText = 'منتج جديد سيتم إضافته';
    }
    if (btn) btn.innerHTML = '<i class="fa-solid fa-save"></i> حفظ المنتج';
  }
}

/**
 * حفظ أو تعديل المنتج في جدول products
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
      const updatedStock = Number(existing.currentStock) + qty;
      await db.from('products').update({
        current_stock: updatedStock,
        wholesale_price: wholesale,
        retail_price: retail
      }).eq('id', existing.id);
      showAlert("تم تحديث بيانات المنتج بنجاح!");
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
