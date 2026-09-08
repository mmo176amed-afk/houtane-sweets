/**
 * =========================================================================
 * [الفقرة 8] واجهة عرض حالة المخزن الحالي وجدول المنتجات (stock.js)
 * =========================================================================
 */

/**
 * جلب وعرض بيانات المخزن الحالي في جدول منسق
 */
async function loadStockTable() {
  showView('view-stock-table');
  showLoader(true);
  try {
    const { data, error } = await db.from('products').select('*').order('id', { ascending: true });
    if (error) throw error;

    productsCache = (data || []).map(p => ({
      id: p.id,
      name: p.name,
      currentStock: Number(p.current_stock) || 0,
      wholesalePrice: Number(p.wholesale_price) || 0,
      retailPrice: Number(p.retail_price) || 0
    }));

    const tbody = document.getElementById('stock-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (productsCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد منتجات مسجلة</td></tr>';
    } else {
      productsCache.forEach(p => {
        tbody.innerHTML += `
          <tr>
            <td>${p.id}</td>
            <td style="font-weight: bold;">${p.name}</td>
            <td>${Number(p.wholesalePrice).toLocaleString()} دج</td>
            <td>${Number(p.retailPrice).toLocaleString()} دج</td>
            <td><strong style="color: ${p.currentStock > 0 ? 'var(--success)' : '#e74c3c'}; font-size: 16px;">${p.currentStock}</strong></td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل المخزون: " + err.message);
  } finally {
    showLoader(false);
  }
}
