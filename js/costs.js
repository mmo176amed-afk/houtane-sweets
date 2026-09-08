/**
 * =========================================================================
 * [الفقرة 7] حساب وتعديل تكلفة الإنتاج (البحث مباشرة من سجل التكاليف) (costs.js)
 * =========================================================================
 */

let costIngredientRowCount = 0;
let isCostEditMode = false;
let savedProductionCostsList = []; // قائمة المنتجات المسجلة في تكلفة الإنتاج

/**
 * 1. فتح واجهة تكلفة الإنتاج وجلب قائمة بطاقات التكلفة المسجلة
 */
async function showProductionCostView() {
  showView('view-cost-calculation');
  resetProductionCostForm();
  await loadSavedCostsDropdown();
}

/**
 * 2. جلب وتعبئة القائمة المنسدلة من جدول تكلفة الإنتاج حصراً (production_costs)
 */
async function loadSavedCostsDropdown() {
  try {
    const { data, error } = await db
      .from('production_costs')
      .select('product_name')
      .order('product_name', { ascending: true });

    if (error) throw error;

    savedProductionCostsList = data || [];
    const selectEl = document.getElementById('cost-product-select');
    if (selectEl) {
      selectEl.innerHTML = '<option value="">-- اختر منتجاً مسجلاً في التكلفة للتعديل --</option>';
      savedProductionCostsList.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.product_name;
        opt.innerText = item.product_name;
        selectEl.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("خطأ أثناء جلب قائمة التكاليف:", err);
  }
}

/**
 * 3. إعادة ضبط الاستمارة وتفريغ الحقول
 */
function resetProductionCostForm() {
  isCostEditMode = false;

  const selectEl = document.getElementById('cost-product-select');
  if (selectEl) selectEl.value = '';

  const nameInput = document.getElementById('cost-product-name');
  if (nameInput) nameInput.value = '';

  const statusMsg = document.getElementById('cost-status-msg');
  if (statusMsg) {
    statusMsg.innerText = '';
    statusMsg.style.color = '#27ae60';
  }

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
 * 4. إضافة سطر مكون داخل جدول التكلفة
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
 * 5. توليد سطر جديد تلقائياً عند كتابة السعر في السطر الأخير
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
 * 6. حذف سطر مكون
 */
function removeCostIngredientRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

/**
 * 7. جلب بطاقة التكلفة من جدول production_costs فور اختيار المنتج
 */
async function onCostProductSelectChanged(prodName) {
  if (!prodName) {
    resetProductionCostForm();
    return;
  }

  showLoader(true);
  try {
    const { data, error } = await db
      .from('production_costs')
      .select('*')
      .eq('product_name', prodName)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      isCostEditMode = true;

      // تثبيت اسم المنتج المختار في خانة الاسم
      document.getElementById('cost-product-name').value = data.product_name;

      // تفعيل وضع التعديل وتغيير لون الزر
      const statusMsg = document.getElementById('cost-status-msg');
      if (statusMsg) {
        statusMsg.style.color = '#e67e22';
        statusMsg.innerText = `✓ تم جلب بيانات (${data.product_name}) - يمكنك الآن تعديل أو حذف أو إضافة أي مكوّن.`;
      }

      const cancelBtn = document.getElementById('btn-cancel-cost-edit');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';

      const submitBtn = document.getElementById('btn-submit-cost');
      if (submitBtn) {
        submitBtn.style.background = '#e67e22';
        submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> حفظ وتحديث التعديلات';
      }

      // تعبئة خانات سطر التعليب
      const pkg = data.packaging_data || {};
      document.getElementById('pkg-total').value = pkg.total !== undefined ? pkg.total : '';
      document.getElementById('pkg-rem').value = pkg.remaining !== undefined ? pkg.remaining : '';
      document.getElementById('pkg-price').value = pkg.unit_price !== undefined ? pkg.unit_price : '';

      // تفريغ الأسطر الحالية وبناء المكونات المسجلة بدقة
      const container = document.getElementById('cost-ingredients-container');
      container.innerHTML = '';
      costIngredientRowCount = 0;

      const ingredientsList = Array.isArray(data.ingredients) ? data.ingredients : [];
      if (ingredientsList.length > 0) {
        ingredientsList.forEach(ing => {
          addCostIngredientRow(ing.name || '', ing.total || '', ing.remaining || '', ing.unit_price || '');
        });
      }
      // إضافة سطر فارغ في الأخير لتسهيل الإضافة المباشرة
      addCostIngredientRow();

    } else {
      showAlert("لم يتم العثور على بيانات هذا المنتج في تكلفة الإنتاج!");
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء جلب بيانات التكلفة: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 8. حفظ أو تحديث بطاقة التكلفة
 */
async function submitProductionCost() {
  const prodName = document.getElementById('cost-product-name').value.trim();
  if (!prodName) {
    showAlert("يرجى تحديد أو كتابة اسم المنتج أولاً!");
    return;
  }

  // تجميع المكونات من الأسطر
  const ingredients = [];
  const rows = document.querySelectorAll('.cost-row-item');
  rows.forEach(r => {
    const name = r.querySelector('.ing-name')?.value.trim();
    const total = parseFloat(r.querySelector('.ing-total')?.value) || 0;
    const rem = parseFloat(r.querySelector('.ing-rem')?.value) || 0;
    const price = parseFloat(r.querySelector('.ing-price')?.value) || 0;

    if (name) {
      ingredients.push({
        name: name,
        total: total,
        remaining: rem,
        unit_price: price
      });
    }
  });

  // بيانات سطر التعليب
  const pkgData = {
    total: parseFloat(document.getElementById('pkg-total')?.value) || 0,
    remaining: parseFloat(document.getElementById('pkg-rem')?.value) || 0,
    unit_price: parseFloat(document.getElementById('pkg-price')?.value) || 0
  };

  showLoader(true);
  try {
    if (isCostEditMode) {
      // تحديث السجل الموجود في جدول production_costs
      const { error } = await db
        .from('production_costs')
        .update({
          ingredients: ingredients,
          packaging_data: pkgData
        })
        .eq('product_name', prodName);

      if (error) throw error;
      showAlert(`تم تحديث تكلفة ومكونات (${prodName}) بنجاح!`);
    } else {
      // إدخال سجل تكلفة جديد
      const { error } = await db
        .from('production_costs')
        .upsert([{
          product_name: prodName,
          ingredients: ingredients,
          packaging_data: pkgData
        }], { onConflict: 'product_name' });

      if (error) throw error;
      showAlert(`تم حفظ تكلفة ومكونات (${prodName}) بنجاح!`);
    }

    resetProductionCostForm();
    await loadSavedCostsDropdown(); // تحديث القائمة بالمنتج الجديد/المعدل
    showDashboard();

  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ التكلفة: " + err.message);
  } finally {
    showLoader(false);
  }
}
