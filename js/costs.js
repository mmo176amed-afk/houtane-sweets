/**
 * =========================================================================
 * [الفقرة 7] واجهة حساب تكلفة الإنتاج والتعليب (costs.js)
 * =========================================================================
 */

/**
 * تهيئة وفتح شاشة حساب تكلفة الإنتاج
 */
function showProductionCostView() {
  document.getElementById('cost-product-name').value = '';
  document.getElementById('pkg-total').value = '';
  document.getElementById('pkg-rem').value = '';
  document.getElementById('pkg-price').value = '';

  const container = document.getElementById('cost-ingredients-container');
  container.innerHTML = '';

  // إضافة 3 أسطر افتراضية للمكونات
  addIngredientRow();
  addIngredientRow();
  addIngredientRow();

  showView('view-cost-calculation');
}

/**
 * إضافة سطر مكون ديناميكي جديد في جدول تكلفة الإنتاج
 */
function addIngredientRow() {
  const container = document.getElementById('cost-ingredients-container');
  const row = document.createElement('div');
  const rowId = 'cost-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  
  row.id = rowId;
  row.className = 'cost-row';
  row.style = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap: 10px; margin-bottom: 10px; align-items: center;';

  row.innerHTML = `
    <input type="text" class="form-control ing-name" placeholder="اسم المكون (فرينة، سكر...)">
    <input type="number" class="form-control ing-total" placeholder="الكمية الكلية" style="text-align: center;">
    <input type="number" class="form-control ing-rem" placeholder="الباقي" style="text-align: center;">
    <input type="number" class="form-control ing-price" placeholder="سعر الوحدة (دج)" style="text-align: center;" oninput="handleAutoAddCostRow('${rowId}')">
    <button type="button" class="btn-action" style="background: #e74c3c; height: 38px;" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  container.appendChild(row);
}

/**
 * التحقق من الكتابة في خانة "سعر الوحدة" للسطر الأخير وإضافة سطر جديد تلقائياً
 */
function handleAutoAddCostRow(currentRowId) {
  const container = document.getElementById('cost-ingredients-container');
  const allRows = container.querySelectorAll('.cost-row');
  
  if (allRows.length === 0) return;

  const lastRow = allRows[allRows.length - 1];
  if (lastRow.id === currentRowId) {
    const priceInput = lastRow.querySelector('.ing-price');
    if (priceInput && Number(priceInput.value) > 0) {
      addIngredientRow();
    }
  }
}

/**
 * تجميع بيانات المكونات، حساب التكلفة، وإدراج المنتج في جدول المنتجات والمخزن
 */
async function submitProductionCost() {
  const pName = document.getElementById('cost-product-name').value.trim();
  if (!pName) {
    showAlert("يرجى كتابة اسم المنتج أولاً!");
    return;
  }

  // 1. تجميع المكونات وحساب تكلفة الاستهلاك
  const rows = document.querySelectorAll('#cost-ingredients-container .cost-row');
  const records = [];
  let totalIngredientsCost = 0;

  rows.forEach(r => {
    const name = r.querySelector('.ing-name').value.trim();
    const totalQty = parseFloat(r.querySelector('.ing-total').value) || 0;
    const remQty = parseFloat(r.querySelector('.ing-rem').value) || 0;
    const unitPrice = parseFloat(r.querySelector('.ing-price').value) || 0;

    if (name) {
      const consumedQty = Math.max(0, totalQty - remQty);
      totalIngredientsCost += (consumedQty * unitPrice);

      records.push({
        product_name: pName,
        ingredient_name: name,
        total_qty: totalQty,
        rem_qty: remQty,
        unit_price: unitPrice
      });
    }
  });

  // 2. تجميع وحساب سطر التعليب
  const pkgTotal = parseFloat(document.getElementById('pkg-total').value) || 0;
  const pkgRem = parseFloat(document.getElementById('pkg-rem').value) || 0;
  const pkgPrice = parseFloat(document.getElementById('pkg-price').value) || 0;

  const producedBoxes = Math.max(0, pkgTotal - pkgRem);
  const packagingCost = producedBoxes * pkgPrice;

  if (pkgTotal > 0) {
    records.push({
      product_name: pName,
      ingredient_name: 'التعليب',
      total_qty: pkgTotal,
      rem_qty: pkgRem,
      unit_price: pkgPrice
    });
  }

  if (records.length === 0) {
    showAlert("يرجى إدخال المكونات أولاً!");
    return;
  }

  // حساب التكلفة الإجمالية وتكلفة العلبة الواحدة
  const grandTotalCost = totalIngredientsCost + packagingCost;
  const unitCostPerBox = producedBoxes > 0 ? Math.round(grandTotalCost / producedBoxes) : 0;

  showLoader(true);
  try {
    const { error: costErr } = await db.from('production_costs').insert(records);
    if (costErr) throw costErr;

    const existing = productsCache.find(p => p.name.toLowerCase() === pName.toLowerCase() && p.id !== null);

    if (!existing) {
      await db.from('products').insert([{
        name: pName,
        current_stock: Math.round(producedBoxes),
        wholesale_price: Math.round(unitCostPerBox),
        retail_price: Math.round(unitCostPerBox)
      }]);
    } else {
      await db.from('products').update({
        current_stock: Number(existing.currentStock) + Math.round(producedBoxes)
      }).eq('id', existing.id);
    }

    await preloadData();

    showAlert(`تم حفظ تكلفة الإنتاج بنجاح!\n• عدد العلب المنتجة: ${producedBoxes}\n• التكلفة الإجمالية: ${grandTotalCost.toLocaleString()} دج\n• تكلفة العلبة: ${unitCostPerBox} دج\n• تم إدراج المنتج في المخزن والقوائم.`);
    showDashboard();
  } catch (err) {
    showAlert("حدث خطأ أثناء الحفظ: " + err.message);
  } finally {
    showLoader(false);
  }
}
