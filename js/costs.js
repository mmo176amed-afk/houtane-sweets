/**
 * =========================================================================
 * [الفقرة 7] حساب تكلفة الإنتاج والبحث التلقائي والتعديل (costs.js)
 * =========================================================================
 */

let costIngredientRowCount = 0;
let isCostEditMode = false;

/**
 * 1. فتح شاشة تكلفة الإنتاج وتغذية قائمة الاقتراحات بالمنتجات الموجودة في المخزن
 */
function showProductionCostView() {
  showView('view-cost-calculation');
  resetProductionCostForm();

  // تغذية قائمة الاقتراحات (Datalist) من أسماء المنتجات الموجودة في المخزن
  const datalist = document.getElementById('cost-products-datalist');
  if (datalist) {
    datalist.innerHTML = '';
    (productsCache || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      datalist.appendChild(opt);
    });
  }
}

/**
 * 2. إعادة ضبط وتصفير استمارة التكلفة
 */
function resetProductionCostForm() {
  isCostEditMode = false;
  document.getElementById('cost-product-name').value = '';
  document.getElementById('cost-status-msg').innerText = '';
  document.getElementById('pkg-total').value = '';
  document.getElementById('pkg-rem').value = '';
  document.getElementById('pkg-price').value = '';

  const cancelBtn = document.getElementById('btn-cancel-cost-edit');
  if (cancelBtn) cancelBtn.style.display = 'none';

  const submitBtn = document.getElementById('btn-submit-cost');
  if (submitBtn) {
    submitBtn.style.background = '#27ae60';
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ تكلفة الإنتاج';
  }

  const container = document.getElementById('cost-ingredients-container');
  if (container) {
    container.innerHTML = '';
    costIngredientRowCount = 0;
    addCostIngredientRow();
    addCostIngredientRow();
    addCostIngredientRow();
  }
}

/**
 * 3. إضافة سطر مكون داخل جدول التكلفة
 */
function addCostIngredientRow(name = '', total = '', rem = '', price = '') {
  costIngredientRowCount++;
  const container = document.getElementById('cost-ingredients-container');
  if (!container) return;

  const rowId = `cost-row-${costIngredientRowCount}`;
  const rowDiv = document.createElement('div');
  rowDiv.id = rowId;
  rowDiv.className = 'cost-row-item';
  rowDiv.style = "display: flex; gap: 10px; align-items: center; margin-bottom: 8px;";

  rowDiv.innerHTML = `
    <button type="button" class="btn-action" style="background:#e74c3c; padding: 6px 12px;" onclick="removeCostIngredientRow('${rowId}')">
      <i class="fa-solid fa-xmark"></i>
    </button>
    <div style="flex: 2;">
      <input type="text" class="form-control ing-name" placeholder="اسم المكون (فرينة، سكر...)" value="${name}">
    </div>
    <div style="flex: 1;">
      <input type="number" step="any" class="form-control ing-total" placeholder="الكمية الكلية" value="${total}">
    </div>
    <div style="flex: 1;">
      <input type="number" step="any" class="form-control ing-rem" placeholder="الباقي" value="${rem}">
    </div>
    <div style="flex: 1;">
      <input type="number" step="any" class="form-control ing-price" placeholder="سعر الوحدة (دج)" value="${price}" oninput="handleCostRowInput('${rowId}')">
    </div>
  `;

  container.appendChild(rowDiv);
}

/**
 * 4. توليد سطر جديد تلقائياً عند كتابة السعر في السطر الأخير
 */
function handleCostRowInput(currentRowId) {
  const rows = document.querySelectorAll('.cost-row-item');
  if (rows.length === 0) return;

  const lastRow = rows[rows.length - 1];
  if (lastRow.id === currentRowId) {
    const nameVal = lastRow.querySelector('.ing-name').value.trim();
    const priceVal = lastRow.querySelector('.ing-price').value;

    if (nameVal && priceVal !== "") {
      addCostIngredientRow();
    }
  }
}

/**
 * 5. حذف سطر مكون
 */
function removeCostIngredientRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

/**
 * 6. البحث التلقائي وجلب بيانات التكلفة المسجلة للمنتج
 */
async function handleCostProductSearch(prodName) {
  const query = prodName.trim();
  if (!query) {
    document.getElementById('cost-status-msg').innerText = '';
    return;
  }

  try {
    const { data, error } = await db
      .from('production_costs')
      .select('*')
      .eq('product_name', query)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      // إذا كان المنتج موجوداً مسبقاً في قاعدة التكاليف، يتم تحميل بياناته وتفعيل وضع التعديل
      isCostEditMode = true;
      document.getElementById('cost-status-msg').style.color = '#e67e22';
      document.getElementById('cost-status-msg').innerText = '✓ تم جلب بيانات التكلفة السابقة (وضع التعديل)';

      const cancelBtn = document.getElementById('btn-cancel-cost-edit');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';

      const submitBtn = document.getElementById('btn-submit-cost');
      if (submitBtn) {
        submitBtn.style.background = '#e67e22';
        submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> حفظ وتحديث التعديلات';
      }

      // تعبئة سطر التعليب
      if (data.packaging_data) {
        document.getElementById('pkg-total').value = data.packaging_data.total || '';
        document.getElementById('pkg-rem').value = data.packaging_data.remaining || '';
        document.getElementById('pkg-price').value = data.packaging_data.unit_price || '';
      }

      // تعبئة سطور المكونات
      const container = document.getElementById('cost-ingredients-container');
      container.innerHTML = '';
      costIngredientRowCount = 0;

      if (data.ingredients && data.ingredients.length > 0) {
        data.ingredients.forEach(ing => {
          addCostIngredientRow(ing.name, ing.total, ing.remaining, ing.unit_price);
        });
      }
      addCostIngredientRow(); // سطر فارغ إضافي في النهاية

    } else {
      // منتج جديد لم يتم تسجيل تكلفته بعد
      isCostEditMode = false;
      document.getElementById('cost-status-msg').style.color = '#27ae60';
      document.getElementById('cost-status-msg').innerText = 'منتج جديد - جاهز لإدخال المكونات';
      
      const cancelBtn = document.getElementById('btn-cancel-cost-edit');
      if (cancelBtn) cancelBtn.style.display = 'none';

      const submitBtn = document.getElementById('btn-submit-cost');
      if (submitBtn) {
        submitBtn.style.background = '#27ae60';
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ تكلفة الإنتاج';
      }
    }
  } catch (err) {
    console.error("خطأ أثناء البحث عن تكلفة المنتج:", err);
  }
}

/**
 * 7. حفظ وتحديث بيانات التكلفة في قاعدة البيانات
 */
async function submitProductionCost() {
  const prodName = document.getElementById('cost-product-name').value.trim();
  if (!prodName) {
    showAlert("يرجى كتابة أو اختيار اسم المنتج أولاً!");
    return;
  }

  // تجميع المكونات
  const ingredients = [];
  const rows = document.querySelectorAll('.cost-row-item');
  rows.forEach(r => {
    const name = r.querySelector('.ing-name')?.value.trim();
    const total = parseFloat(r.querySelector('.ing-total')?.value) || 0;
    const rem = parseFloat(r.querySelector('.ing-rem')?.value) || 0;
    const price = parseFloat(r.querySelector('.ing-price')?.value) || 0;

    if (name) {
      ingredients.push({ name, total, remaining: rem, unit_price: price });
    }
  });

  // بيانات التعليب
  const pkgData = {
    total: parseFloat(document.getElementById('pkg-total')?.value) || 0,
    remaining: parseFloat(document.getElementById('pkg-rem')?.value) || 0,
    unit_price: parseFloat(document.getElementById('pkg-price')?.value) || 0
  };

  showLoader(true);
  try {
    if (isCostEditMode) {
      // تحديث البيانات الحالية
      const { error } = await db
        .from('production_costs')
        .update({
          ingredients: ingredients,
          packaging_data: pkgData,
          updated_at: new Date()
        })
        .eq('product_name', prodName);

      if (error) throw error;
      showAlert("تم تحديث بيانات تكلفة الإنتاج بنجاح!");
    } else {
      // إدخال سجل جديد
      const { error } = await db
        .from('production_costs')
        .insert([{
          product_name: prodName,
          ingredients: ingredients,
          packaging_data: pkgData
        }]);

      if (error) throw error;
      showAlert("تم حفظ بيانات تكلفة الإنتاج بنجاح!");
    }

    resetProductionCostForm();
    showDashboard();

  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ تكلفة الإنتاج: " + err.message);
  } finally {
    showLoader(false);
  }
}
