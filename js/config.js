/**
 * =========================================================================
 * [الفقرة 1] ملف الإعدادات العامة والاتصال بقاعدة البيانات (config.js)
 * =========================================================================
 */

// 1. إعدادات الاتصال بـ Supabase
const SUPABASE_URL = 'https://ntvmrdwwnjqunsagritz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DQ6yB5s9oLL_jxiWZKB9gQ_Pa0uwIRW';

// تهيئة العميل
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Client Connected Successfully!");

// 2. المتغيرات العامة للذاكرة المؤقتة
let currentUser = null;
let productsCache = [];
let customersCache = [];

// 3. إعدادات كلمات السر للعمليات الحساسة
const SECURITY_CONFIG = {
  adminPassword: "123",        // كلمة السر العامة
  yearClosePassword: "123"     // كلمة السر المخصصة للإغلاق السنوي وتصفية السجل
};

// 4. دوال التحكم العامة في الواجهة
function showLoader(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('view-active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('view-active');

  if (viewId === 'view-add-product' && typeof populateProductDatalist === 'function') {
    populateProductDatalist();
  }
}

function showDashboard() {
  showView('view-dashboard');
}

function showAlert(message) {
  alert(message);
}
