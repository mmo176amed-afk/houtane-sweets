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

    // إخفاء/إظهار زر "إغلاق السنة" حسب الصلاحية
    const closeYearBtn = document.querySelector('button[onclick="closeYearAndCarryOverDebt()"]');
    if (closeYearBtn) {
      closeYearBtn.style.display = (currentUser.role === 'admin') ? 'inline-block' : 'none';
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
/**
 * =========================================================================
 * [الجزء ج] دوال إدارة المستخدمين (Users Management)
 * =========================================================================
 * 1) openUsersManagementView() - تفتح الصفحة (محمية للمدير فقط)
 * 2) loadUsersTable()          - تجلب المستخدمين من جدول users
 * 3) submitNewUser()           - تضيف مستخدمًا جديدًا
 * 4) deleteUser(id, name)      - تحذف مستخدمًا
 * 5) editUserPassword(id,name) - تعديل كلمة المرور
 */

/**
 * 1. فتح صفحة إدارة المستخدمين (محمية بكلمة سر المدير)
 */
async function openUsersManagementView() {
  // التحقق من أن المستخدم الحالي مدير
  if (!checkUserRole('admin')) {
    return;
  }

  // طلب كلمة سر إضافية لحماية الصفحة
  const enteredPass = prompt("هذه الصفحة محمية. أدخل كلمة سر المدير للتأكيد:");
  if (enteredPass === null) return; // إلغاء

  if (enteredPass !== SECURITY_CONFIG.adminPassword) {
    showAlert("كلمة السر غير صحيحة! تم إلغاء العملية.");
    return;
  }

  // فتح الصفحة
  showView('view-users-management');
  await loadUsersTable();
}

/**
 * 2. تحميل جدول المستخدمين من قاعدة البيانات
 */
async function loadUsersTable() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  showLoader(true);
  try {
    const { data, error } = await db
      .from('users')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #7f8c8d;">لا يوجد مستخدمون مسجلون بعد</td></tr>';
      return;
    }

    data.forEach((u, idx) => {
      const roleLabel = u.role === 'admin' ? 'مدير (Admin)' : 'مستخدم (User)';
      const roleColor = u.role === 'admin' ? '#c0392b' : '#2980b9';
      const isMainAdmin = u.username === 'admin';
      const createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-';

         // زر تعديل كلمة المرور (متاح للجميع)
      const editBtn = `
        <button class="btn-action" style="background: #f39c12; padding: 4px 8px; font-size: 12px; margin-left: 4px;" 
          onclick="editUserPassword(${u.id}, '${u.username.replace(/'/g, "\\'")}')" title="تعديل كلمة المرور">
          <i class="fa-solid fa-key"></i> تعديل
        </button>
      `;

      // زر الحذف (ممنوع للمستخدم الرئيسي admin)
      const deleteBtn = isMainAdmin
        ? ''
        : `
            <button class="btn-action" style="background: #e74c3c; padding: 4px 8px; font-size: 12px;" 
              onclick="deleteUser(${u.id}, '${u.username.replace(/'/g, "\\'")}')" title="حذف المستخدم">
              <i class="fa-solid fa-trash"></i> حذف
            </button>
          `;

      const actionsHtml = editBtn + deleteBtn;

      tbody.innerHTML += `
        <tr>
          <td style="font-weight: bold;">${idx + 1}</td>
          <td style="font-weight: bold;">${u.username}</td>
          <td style="font-family: monospace; color: #7f8c8d;">${u.password}</td>
          <td><span style="color: ${roleColor}; font-weight: bold;">${roleLabel}</span></td>
          <td>${createdAt}</td>
          <td style="white-space: nowrap;">${actionsHtml}</td>
        </tr>
      `;
    });

  } catch (err) {
    showAlert("حدث خطأ أثناء تحميل المستخدمين: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 3. تسجيل مستخدم جديد
 */
async function submitNewUser() {
  if (!checkUserRole('admin')) return;

  const username = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-pass').value.trim();
  const role = document.getElementById('new-user-role').value;

  if (!username || !password) {
    showAlert("يرجى إدخال اسم المستخدم وكلمة المرور!");
    return;
  }

  if (username.length < 3) {
    showAlert("اسم المستخدم يجب أن يكون 3 أحرف على الأقل!");
    return;
  }

  if (password.length < 4) {
    showAlert("كلمة المرور يجب أن تكون 4 أحرف على الأقل!");
    return;
  }

  showLoader(true);
  try {
    // التحقق من عدم وجود مستخدم بنفس الاسم
    const { data: existing } = await db
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      showAlert("يوجد مستخدم مسجل بنفس الاسم مسبقاً!");
      return;
    }

    // إضافة المستخدم الجديد
    const { error } = await db.from('users').insert([{
      username: username,
      password: password,
      role: role
    }]);

    if (error) throw error;

    showAlert("تم تسجيل المستخدم بنجاح!");

    // تفريغ الحقول
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-role').value = 'user';

    // إعادة تحميل الجدول
    await loadUsersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء تسجيل المستخدم: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 4. حذف مستخدم (مع منع حذف admin الرئيسي)
 */
async function deleteUser(userId, username) {
  if (!checkUserRole('admin')) return;

  if (username === 'admin') {
    showAlert("لا يمكن حذف المستخدم الرئيسي (admin)!");
    return;
  }

  // منع المستخدم من حذف نفسه
  if (currentUser && currentUser.id === userId) {
    showAlert("لا يمكنك حذف حسابك الحالي!");
    return;
  }

  const confirmed = confirm(`هل أنت متأكد من حذف المستخدم "${username}"؟\n\nتحذير: هذا الإجراء لا يمكن التراجع عنه!`);
  if (!confirmed) return;

  showLoader(true);
  try {
    const { error } = await db
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    showAlert("تم حذف المستخدم بنجاح!");
    await loadUsersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء الحذف: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

/**
 * 5. تعديل كلمة مرور مستخدم
 */
async function editUserPassword(userId, username) {
  if (!checkUserRole('admin')) return;

  const newPassword = prompt(`أدخل كلمة المرور الجديدة للمستخدم "${username}":`);

  if (newPassword === null) return; // إلغاء

  if (!newPassword || newPassword.trim().length < 4) {
    showAlert("كلمة المرور يجب أن تكون 4 أحرف على الأقل!");
    return;
  }

  showLoader(true);
  try {
    const { error } = await db
      .from('users')
      .update({ password: newPassword.trim() })
      .eq('id', userId);

    if (error) throw error;

    showAlert("تم تعديل كلمة المرور بنجاح!");
    await loadUsersTable();

  } catch (err) {
    showAlert("حدث خطأ أثناء التعديل: " + err.message);
    console.error(err);
  } finally {
    showLoader(false);
  }
}
