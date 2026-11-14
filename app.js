const SUPABASE_URL = 'https://mrsngiseezttrgrcqxlw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_p3Rz1XF1DXQsgtiOoWCRAA_528gTMER';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const productGrid = document.querySelector('#product-grid');
const productSelect = document.querySelector('#product-select');
const sellerSelect = document.querySelector('#seller-select');
const cartItems = document.querySelector('#cart-items');
const cartTotal = document.querySelector('#cart-total');
const feedback = document.querySelector('#pos-feedback');
const authFeedback = document.querySelector('#auth-feedback');
const authForm = document.querySelector('#auth-form');
const authSwitch = document.querySelector('#auth-switch');
let authMode = 'signin';
const cart = new Map();
let products = [];
let currentFilter = 'all';
const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function categoryFor(name) {
  return /mouse|teclado|aud[ií]fono|headset|webcam|parlante|perif[eé]rico/i.test(name) ? 'perifericos' : 'computo';
}
function imageFor(name) {
  return /mouse/i.test(name)
    ? 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=800&q=80'
    : /laptop|computadora|notebook/i.test(name)
      ? 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80'
      : 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
}
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}
function setFeedback(message, error = false) {
  feedback.textContent = message;
  feedback.classList.toggle('error', error);
}

function setAuthFeedback(message, error = false) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle('error', error);
}

function updateAuthState(session) {
  const signedIn = Boolean(session?.user);
  const salesSection = document.querySelector('#ventas');
  const accessSection = document.querySelector('#acceso');
  const salesLink = document.querySelector('#sales-link');
  salesSection.hidden = !signedIn;
  accessSection.hidden = signedIn;
  salesLink.href = signedIn ? '#ventas' : '#acceso';
  salesLink.innerHTML = signedIn ? 'Punto de venta <span>↗</span>' : 'Iniciar sesión <span>↗</span>';
  document.querySelector('#signed-in-email').textContent = signedIn ? session.user.email : '';
  if (!signedIn) {
    cart.clear();
    renderCart();
  }
  if (window.location.hash === '#ventas' && !signedIn) window.location.hash = '#acceso';
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  document.querySelector('#auth-title').textContent = signingUp ? 'Crear cuenta' : 'Iniciar sesión';
  document.querySelector('#auth-submit').innerHTML = signingUp ? 'Crear cuenta <span>↗</span>' : 'Iniciar sesión <span>↗</span>';
  authSwitch.textContent = signingUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿Aún no tienes cuenta? Regístrate';
  document.querySelector('#auth-password').autocomplete = signingUp ? 'new-password' : 'current-password';
  setAuthFeedback('');
}

authSwitch.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.querySelector('#auth-submit');
  const email = document.querySelector('#auth-email').value.trim();
  const password = document.querySelector('#auth-password').value;
  submit.disabled = true;
  setAuthFeedback(authMode === 'signup' ? 'Creando cuenta…' : 'Iniciando sesión…');
  try {
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } });
      if (error) throw error;
      setAuthFeedback(data.session ? 'Cuenta creada. Ya puedes usar el punto de venta.' : 'Cuenta creada. Confirma tu correo y luego inicia sesión.');
      if (data.session) setAuthMode('signin');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthFeedback('Sesión iniciada.');
    }
  } catch (error) {
    setAuthFeedback(error.message || 'No se pudo completar el acceso.', true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#sign-out').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) setFeedback(`No se pudo cerrar la sesión: ${error.message}`, true);
  else window.location.hash = '#acceso';
});

supabase.auth.onAuthStateChange((_event, session) => updateAuthState(session));

async function loadCatalog() {
  const [{ data: catalog, error: productError }, { data: sellers, error: sellerError }] = await Promise.all([
    supabase.from('producto').select('id_producto, descripcion, stock, precio').order('descripcion'),
    supabase.from('vendedor').select('id_vendedor, nombre').order('nombre')
  ]);
  if (productError) {
    document.querySelector('#catalog-status').textContent = 'Catálogo no disponible';
    productGrid.innerHTML = '<div class="catalog-message">No se pudo cargar el catálogo. Revisa la conexión y los permisos de lectura de Supabase.</div>';
    setFeedback('No fue posible cargar los datos de Supabase.', true);
    return;
  }
  products = catalog || [];
  document.querySelector('#catalog-status').textContent = `${products.length} productos disponibles`;
  document.querySelector('#all-count').textContent = products.length;
  productSelect.innerHTML = '<option value="">Elige un producto</option>' + products.map(product => `<option value="${product.id_producto}">${escapeHtml(product.descripcion)} · ${money(product.precio)}</option>`).join('');
  if (sellerError || !sellers?.length) {
    sellerSelect.innerHTML = '<option value="">Vendedor no disponible</option>';
    setFeedback('No fue posible cargar el vendedor. Revisa los permisos de lectura en Supabase.', true);
  } else {
    sellerSelect.innerHTML = sellers.map(seller => `<option value="${seller.id_vendedor}">${escapeHtml(seller.nombre)}</option>`).join('');
  }
  renderProducts();
}

function renderProducts() {
  const shown = products.filter(product => currentFilter === 'all' || categoryFor(product.descripcion) === currentFilter);
  if (!shown.length) {
    productGrid.innerHTML = '<div class="catalog-message">Aún no hay productos en esta categoría.</div>';
    return;
  }
  productGrid.innerHTML = shown.map(product => `<article class="product-card">
    <div class="product-photo" style="background-image:url('${imageFor(product.descripcion)}')" role="img" aria-label="${escapeHtml(product.descripcion)}">
      <span class="product-tag">${categoryFor(product.descripcion) === 'perifericos' ? 'Periféricos' : 'Cómputo'}</span>
      <span class="product-stock">${Number(product.stock) > 0 ? `${escapeHtml(product.stock)} en stock` : 'Consultar stock'}</span>
    </div>
    <div class="product-info"><span class="product-category">webaplica · esencial</span><h3>${escapeHtml(product.descripcion)}</h3><p>Un accesorio confiable para completar tu espacio de trabajo.</p>
    <div class="product-buy"><span class="product-price">${money(product.precio)} <small>/ unidad</small></span><button class="product-add" type="button" data-add="${product.id_producto}" aria-label="Agregar ${escapeHtml(product.descripcion)} al carrito">+</button></div></div></article>`).join('');
}

function addProduct(productId, quantity) {
  const product = products.find(item => String(item.id_producto) === String(productId));
  const qty = Number(quantity);
  if (!product || !Number.isInteger(qty) || qty < 1) return setFeedback('Elige un producto e ingresa una cantidad válida.', true);
  const previous = cart.get(String(productId))?.cantidad || 0;
  if (previous + qty > Number(product.stock)) return setFeedback(`Solo hay ${product.stock} unidades de ${product.descripcion}.`, true);
  cart.set(String(productId), { product, cantidad: previous + qty });
  setFeedback('Producto agregado al carrito.');
  renderCart();
}

function renderCart() {
  const lines = [...cart.values()];
  if (!lines.length) cartItems.innerHTML = '<div class="empty-cart">Tu carrito está esperando productos.</div>';
  else cartItems.innerHTML = lines.map(({ product, cantidad }) => `<div class="cart-row"><span class="cart-product">${escapeHtml(product.descripcion)}<small>Venta por unidad</small></span><span>${cantidad}</span><span>${money(product.precio)}</span><span>${money(Number(product.precio) * cantidad)}</span><button class="remove-item" type="button" data-remove="${product.id_producto}" aria-label="Quitar ${escapeHtml(product.descripcion)}">×</button></div>`).join('');
  const total = lines.reduce((sum, { product, cantidad }) => sum + Number(product.precio) * cantidad, 0);
  cartTotal.textContent = money(total);
}

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  currentFilter = button.dataset.filter;
  renderProducts();
}));
productGrid.addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (button) addProduct(button.dataset.add, 1);
});
document.querySelector('#add-to-cart').addEventListener('click', () => addProduct(productSelect.value, document.querySelector('#quantity').value));
cartItems.addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (button) { cart.delete(button.dataset.remove); renderCart(); }
});
document.querySelector('#cancel-sale').addEventListener('click', () => {
  cart.clear(); renderCart(); setFeedback('Venta cancelada. El carrito está vacío.');
});
document.querySelector('#save-sale').addEventListener('click', async event => {
  if (!cart.size) return setFeedback('Agrega al menos un producto antes de grabar.', true);
  const saveButton = event.currentTarget;
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando…';
  setFeedback('Registrando venta en Supabase…');
  try {
    const { data, error } = await supabase.functions.invoke('registrar-venta', {
      body: { id_vendedor: Number(sellerSelect.value), items: [...cart.values()].map(({ product, cantidad }) => ({ id_producto: Number(product.id_producto), cantidad })) }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'No se pudo registrar la venta.');
    cart.clear(); renderCart();
    setFeedback(data.email_sent ? 'Venta registrada y correo enviado al vendedor.' : 'Venta registrada. El correo queda pendiente de configurar Resend en Supabase.');
    showToast('Venta guardada correctamente');
  } catch (error) {
    setFeedback(`No se pudo grabar la venta: ${error.message || 'revisa la conexión e inténtalo de nuevo.'}`, true);
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = 'Grabar venta <span>↗</span>';
  }
});
document.querySelector('#year').textContent = new Date().getFullYear();
supabase.auth.getSession().then(({ data: { session } }) => updateAuthState(session));
loadCatalog();
