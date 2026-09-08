/**
 * =========================================================================
 * [الفقرة 2] نظام تسجيل الدخول والخروج وجلب البيانات الأولية (auth.js)
 * =========================================================================
 */

/**
 * معالجة تسجيل الدخول والتحقق من الصلاحيات
 */
async function handleLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  if (!user || !pass) {
    showAlert("يرجى إدخال اسم المستخدم وكلمة المرور!");
    return;
  }

  if (user === 'admin' && pass === '1234') {
    currentUser = { user: 'admin', role: 'Admin' };
    
    const badge = document.getElementById('user-badge');
    if (badge) badge.innerText = `${currentUser.user} (${currentUser.role})`;
    
    showView('view-dashboard');
    await preloadData();
  } else {
    showAlert("اسم المستخدم أو كلمة المرور غير صحيحة!");
  }
}

/**
 * تسجيل الخروج وإعادة تعيين الحقول إلى الشاشة الافتتاحية
 */
function logout() {
  currentUser = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showView('view-login');
}

/**
 * جلب المنتجات والزبائن إلى الذاكرة المؤقتة للتطبيق
 */
async function preloadData() {
  showLoader(true);
  try {
    // 1. جلب المنتجات المسجلة في جدول products
    const { data: prods, error: pErr } = await db.from('products').select('*').order('id', { ascending: true });
    if (pErr) console.warn("ملاحظة في المنتجات:", pErr.message);

    // 2. جلب أسماء المنتجات من جدول production_costs
    let costProds = [];
    try {
      const { data: cData } = await db.from('production_costs').select('product_name');
      if (cData) costProds = cData;
    } catch (e) {}

    const mainList = (prods || []).map(p => ({
      id: p.id,
      name: (p.name || '').trim(),
      currentStock: Number(p.current_stock) || 0,
      wholesalePrice: Number(p.wholesale_price) || 0,
      retailPrice: Number(p.retail_price) || 0
    }));

    if (costProds && costProds.length > 0) {
      const existingNames = new Set(mainList.map(p => p.name.toLowerCase()));
      costProds.forEach(cp => {
        const cName = (cp.product_name || '').trim();
        if (cName && !existingNames.has(cName.toLowerCase())) {
          existingNames.add(cName.toLowerCase());
          mainList.push({
            id: null,
            name: cName,
            currentStock: 0,
            wholesalePrice: 0,
            retailPrice: 0
          });
        }
      });
    }

    productsCache = mainList;

    // 3. جلب قائمة الزبائن من جدول customers
    const { data: custs, error: cErr } = await db.from('customers').select('*').order('id', { ascending: true });
    if (cErr) throw cErr;

    customersCache = (custs || []).map(c => ({
      id: c.id,
      name: c.name,
      oldCredit: Number(c.old_credit) || 0,
      lastInvoiceSeq: Number(c.last_invoice_seq) || 0
    }));

    if (typeof populateProductDatalist === 'function') {
      populateProductDatalist();
    }
  } catch (e) {
    console.error("Error preloading data:", e);
    showAlert("تفاصيل الخطأ: " + e.message);
  } finally {
    showLoader(false);
  }
}
