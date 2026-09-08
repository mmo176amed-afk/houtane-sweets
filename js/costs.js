/**
 * =========================================================================
 * [الفقرة 7] حساب وتعديل تكلفة الإنتاج (costs.js)
 * -- نسخة مصححة لتتوافق مع شكل جدول production_costs الفعلي في Supabase:
 *    (id, product_name, ingredient_name, total_qty, rem_qty, unit_price, created_at)
 *    أي: سطر مستقل لكل مكوّن، وليس عمود JSON واحد لكل منتج.
 *    التعليب يُخزَّن كسطر عادي حيث ingredient_name = "التعليب".
 * =========================================================================
 */

let costIngredientRowCount = 0;
let isCostEditMode = false;
const PACKAGING_NAME = "التعليب";

/**
 * 1. فتح شاشة التكلفة وجلب أسماء المنتجات مباشرة من قاعدة البيانات
 */
async function showProductionCostView() {
  showView('view-cost-calculation');
  resetProductionCostForm();
  showLoader(true);

  try {
    const { data: prods, error } = await db
      .from('products')
      .select('name')
      .order('name', { ascending: true });

    if (error) throw error;

    const selectEl = document.getElementById('cost-product-select');
    if (selectEl) {
      selectEl.innerHTML = '<option value="">-- اختر الحلوى --</option>';
      (prods || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.innerText = p.name;
        selectEl.appendChild(opt);
      });

      const newOpt = document.createElement('option');
      newOpt.value = "__NEW__";
      newOpt.innerText = "➕ [إضافة تكلفة لمنتج جديد...]";
      newOpt.style.color = "#27ae60";
      newOpt.style.fontWeight = "bold";
      selectEl.appendChild(newOpt);
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل قائمة الحلويات: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 2. تصفير الحقول
 */
function resetProductionCostForm() {
  isCostEditMode = false;

  const selectEl = document.getElementById('cost-product-select');
  if (selectEl) selectEl.value = '';

  const statusMsg = document.getElementById('cost-status-msg');
  if (statusMsg) statusMsg.innerText = '';

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
 * 3. إضافة سطر مكوّن
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
 * 4. توليد سطر جديد عند ملء السطر الأخير
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
 * 5. حذف سطر
 */
function removeCostIngredientRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

/**
 * 6. جلب بيانات المكونات فور اختيار الحلوى من القائمة المنسدلة
 *    -- مصححة: تقرأ عدة أسطر (سطر لكل مكوّن) بدل انتظار عمود JSON واحد
 */
async function onCostProductSelectChanged(prodName) {
  if (!prodName) {
    resetProductionCostForm();
    return;
  }

  if (prodName === "__NEW__") {
    const customName = prompt("اكتب اسم الحلوى الجديدة:");
    if (!customName || !customName.trim()) {
      document.getElementById('cost-product-select').value = '';
      return;
    }
    const selectEl = document.getElementById('cost-product-select');
    const opt = document.createElement('option');
    opt.value = customName.trim();
    opt.innerText = customName.trim();
    selectEl.insertBefore(opt, selectEl.lastElementChild);
    selectEl.value = customName.trim();
    prodName = customName.trim();
  }

  showLoader(true);
  try {
    // جلب كل الأسطر (المكونات) الخاصة بهذا المنتج دفعة واحدة
    const { data: rowsData, error } = await db
      .from('production_costs')
      .select('*')
      .eq('product_name', prodName)
      .order('id', { ascending: true });

    if (error) throw error;

    const statusMsg = document.getElementById('cost-status-msg');
    const cancelBtn = document.getElementById('btn-cancel-cost-edit');
    const submitBtn = document.getElementById('btn-submit-cost');

    const container = document.getElementById('cost-ingredients-container');
    container.innerHTML = '';
    costIngredientRowCount = 0;

    // تصفير حقول التعليب قبل التعبئة
    document.getElementById('pkg-total').value = '';
    document.getElementById('pkg-rem').value = '';
    document.getElementById('pkg-price').value = '';

    if (rowsData && rowsData.length > 0) {
      isCostEditMode = true;
      if (statusMsg) {
        statusMsg.style.color = '#e67e22';
        statusMsg.innerText = `✓ تم تحميل مكونات (${prodName}) - يمكنك التعديل والحفظ.`;
      }
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      if (submitBtn) {
        submitBtn.style.background = '#e67e22';
        submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> حفظ وتحديث التعديلات';
      }

      let addedIngredientRow = false;

      rowsData.forEach(row => {
        if (row.ingredient_name === PACKAGING_NAME) {
          // سطر التعليب يُعبّأ في حقوله الخاصة
          document.getElementById('pkg-total').value = row.total_qty ?? '';
          document.getElementById('pkg-rem').value = row.rem_qty ?? '';
          document.getElementById('pkg-price').value = row.unit_price ?? '';
        } else {
          addCostIngredientRow(
            row.ingredient_name || '',
            row.total_qty ?? '',
            row.rem_qty ?? '',
            row.unit_price ?? ''
          );
          addedIngredientRow = true;
        }
      });

      if (!addedIngredientRow) {
        addCostIngredientRow();
      }
      addCostIngredientRow(); // سطر إضافي فارغ لإضافة مكوّن جديد بسهولة

    } else {
      isCostEditMode = false;
      if (statusMsg) {
        statusMsg.style.color = '#27ae60';
        statusMsg.innerText = `المنتج (${prodName}) جاهز لإدخال مكوناته لأول مرة.`;
      }
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (submitBtn) {
        submitBtn.style.background = '#27ae60';
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ تكلفة الإنتاج';
      }

      addCostIngredientRow();
      addCostIngredientRow();
      addCostIngredientRow();
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء جلب تفاصيل التكلفة: " + err.message);
  } finally {
    showLoader(false);
  }
}

/**
 * 7. حفظ التكلفة في قاعدة البيانات
 *    -- مصححة: تحذف كل الأسطر القديمة الخاصة بالمنتج ثم تُدرج الأسطر الجديدة
 *    (سطر لكل مكوّن + سطر واحد للتعليب)، لأن الجدول لا يحتوي عمود JSON.
 */
async function submitProductionCost() {
  const selectEl = document.getElementById('cost-product-select');
  const prodName = selectEl.value;

  if (!prodName || prodName === "__NEW__") {
    showAlert("يرجى اختيار اسم الحلوى أولاً!");
    return;
  }

  const rowsToInsert = [];

  // 1) المكونات
  const rows = document.querySelectorAll('.cost-row-item');
  rows.forEach(r => {
    const name = r.querySelector('.ing-name')?.value.trim();
    const total = parseFloat(r.querySelector('.ing-total')?.value) || 0;
    const rem = parseFloat(r.querySelector('.ing-rem')?.value) || 0;
    const price = parseFloat(r.querySelector('.ing-price')?.value) || 0;

    if (name) {
      rowsToInsert.push({
        product_name: prodName,
        ingredient_name: name,
        total_qty: total,
        rem_qty: rem,
        unit_price: price
      });
    }
  });

  // 2) التعليب (يُحفظ كسطر عادي باسم ثابت "التعليب")
  const pkgTotal = parseFloat(document.getElementById('pkg-total')?.value) || 0;
  const pkgRem = parseFloat(document.getElementById('pkg-rem')?.value) || 0;
  const pkgPrice = parseFloat(document.getElementById('pkg-price')?.value) || 0;

  if (pkgTotal || pkgRem || pkgPrice) {
    rowsToInsert.push({
      product_name: prodName,
      ingredient_name: PACKAGING_NAME,
      total_qty: pkgTotal,
      rem_qty: pkgRem,
      unit_price: pkgPrice
    });
  }

  if (rowsToInsert.length === 0) {
    showAlert("يرجى إدخال مكوّن واحد على الأقل قبل الحفظ!");
    return;
  }

  showLoader(true);
  try {
    // حذف كل الأسطر القديمة لهذا المنتج أولاً (لضمان عدم بقاء مكونات محذوفة)
    const { error: deleteError } = await db
      .from('production_costs')
      .delete()
      .eq('product_name', prodName);

    if (deleteError) throw deleteError;

    // إدراج الأسطر الجديدة كاملة
    const { error: insertError } = await db
      .from('production_costs')
      .insert(rowsToInsert);

    if (insertError) throw insertError;

    showAlert(`تم حفظ تكلفة ومكونات (${prodName}) بنجاح!`);
    resetProductionCostForm();
    showDashboard();

  } catch (err) {
    showAlert("حدث خطأ أثناء حفظ التكلفة: " + err.message);
  } finally {
    showLoader(false);
  }
}
