/**
 * =========================================================================
 * [الفقرة 2] نظام تسجيل الدخول والخروج وجلب البيانات الأولية (auth.js)
 * =========================================================================
 * -- نسخة محدّثة (2026):
 *   1) handleLogin() يتحقق من جدول users في Supabase.
 *   2) يخزّن currentUser = { id, username, role }.
 *   3) يضيف دوال: logout()، checkUserRole()، requireLogin().
 *   4) preloadData() كما هو (لم يُمس).
 */

/**
 * 1. معالجة تسجيل الدخول والتحقق من الصلاحيات
 */
async function handleLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();

  if (!user || !pass) {
    showAlert("يرجى إدخال اسم المستخدم وكلمة المرور!");
    return;
  }

  showLoader(true);

  try {
    // البحث عن المستخدم في جدول users
    const { data: foundUser, error } = await db
      .from('users')
      .select('*')
      .eq('username', user)
      .eq('password', pass)
      .maybeSingle();

    if (error) throw error;

    if (!foundUser) {
      showAlert("اسم المستخدم أو كلمة المرور غير صحيحة!");
      return;
    }

    // تخزين بيانات المستخدم في المتغير العام
    currentUser = {
      id: foundUser.id,
      username: foundUser.username,
      role: foundUser.role
    };

    // تحديث شارة المستخدم في الواجهة
    const badge = document.getElementById('user-badge');
    if (badge) {
      badge.innerText = `${currentUser.username} (${currentUser.role})`;
    }

    // إظهار لوحة التحكم
    showView('view-dashboard');

    // تحميل البيانات الأولية
    await preloadData();

  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل الدخول: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 2. تسجيل الخروج وإعادة تعيين الحقول إلى الشاشة الافتتاحية
 */
function logout() {
  const confirmLogout = confirm("هل أنت متأكد من تسجيل الخروج؟");
  if (!confirmLogout) return;

  currentUser = null;

  const userInput = document.getElementById('login-user');
  const passInput = document.getElementById('login-pass');
  if (userInput) userInput.value = '';
  if (passInput) passInput.value = '';

  showView('view-login');
}

/**
 * 3. التحقق من صلاحيات المستخدم
 * @param {string} requiredRole - 'admin' أو 'user'
 * @returns {boolean}
 */
function checkUserRole(requiredRole = 'admin') {
  if (!currentUser) {
    showAlert("يجب تسجيل الدخول أولاً!");
    return false;
  }

  if (requiredRole === 'admin' && currentUser.role !== 'admin') {
    showAlert("هذه العملية تتطلب صلاحيات المدير!");
    return false;
  }

  return true;
}

/**
 * 4. التحقق من أن المستخدم مسجل الدخول
 */
function requireLogin() {
  if (!currentUser) {
    showAlert("يجب تسجيل الدخول أولاً!");
    showView('view-login');
    return false;
  }
  return true;
}

/**
 * 5. جلب المنتجات والزبائن إلى الذاكرة المؤقتة للتطبيق
 * (لم يُمس - نفس النسخة القديمة)
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
