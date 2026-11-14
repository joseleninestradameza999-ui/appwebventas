import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply({ success: false, error: 'Método no permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY');
    if (!url || !publicKey || !serviceKey) throw new Error('Falta configurar la conexión segura de Supabase.');

    const authorization = request.headers.get('Authorization');
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return reply({ success: false, error: 'Inicia sesión para registrar una venta.' }, 401);

    const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return reply({ success: false, error: 'Tu sesión no es válida. Inicia sesión nuevamente.' }, 401);

    const body = await request.json();
    const sellerId = Number(body.id_vendedor);
    const items = body.items;
    if (!Number.isInteger(sellerId) || !Array.isArray(items) || !items.length || items.length > 30) {
      return reply({ success: false, error: 'La venta debe incluir un vendedor y de 1 a 30 productos.' }, 400);
    }
    const normalized = new Map<number, number>();
    for (const item of items) {
      const id = Number(item.id_producto);
      const quantity = Number(item.cantidad);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
        return reply({ success: false, error: 'Hay productos o cantidades inválidos.' }, 400);
      }
      normalized.set(id, (normalized.get(id) ?? 0) + quantity);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: seller, error: sellerError }, { data: products, error: productsError }] = await Promise.all([
      admin.from('vendedor').select('id_vendedor, nombre, correo').eq('id_vendedor', sellerId).maybeSingle(),
      admin.from('producto').select('id_producto, descripcion, precio, stock').in('id_producto', [...normalized.keys()]),
    ]);
    if (sellerError || !seller) return reply({ success: false, error: 'El vendedor seleccionado no existe.' }, 404);
    if (productsError) throw productsError;
    if (!products || products.length !== normalized.size) return reply({ success: false, error: 'Uno de los productos ya no está disponible.' }, 409);

    const lines = products.map(product => {
      const quantity = normalized.get(Number(product.id_producto))!;
      if (quantity > Number(product.stock)) throw new Error(`Stock insuficiente para ${product.descripcion}.`);
      const price = Number(product.precio);
      return { id_vendedor: sellerId, id_producto: product.id_producto, cantidad: quantity, precio: price, total: price * quantity, descripcion: product.descripcion };
    });
    const saleRows = lines.map(({ descripcion: _description, ...row }) => row);
    const { data: saved, error: insertError } = await admin.from('ventas').insert(saleRows).select('id');
    if (insertError) throw insertError;

    let emailSent = false;
    let emailError: string | undefined;
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const mailFrom = Deno.env.get('MAIL_FROM');
    if (!resendKey || !mailFrom || !seller.correo) {
      emailError = 'Configura RESEND_API_KEY, MAIL_FROM y el correo del vendedor en Supabase.';
    } else {
      const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
      const grandTotal = lines.reduce((sum, line) => sum + line.total, 0);
      const rows = lines.map(line => `<tr><td style="padding:10px;border-bottom:1px solid #e7e9e3">${escapeHtml(line.descripcion)}</td><td style="padding:10px;text-align:center;border-bottom:1px solid #e7e9e3">${line.cantidad}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #e7e9e3">${currency.format(line.precio)}</td><td style="padding:10px;text-align:right;border-bottom:1px solid #e7e9e3">${currency.format(line.total)}</td></tr>`).join('');
      const mailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: mailFrom,
          to: [seller.correo],
          subject: `webaplica · Venta registrada ${saved?.[0]?.id ? `#${saved[0].id}` : ''}`,
          html: `<div style="font-family:Arial,sans-serif;color:#17212b;max-width:640px;margin:auto"><h2 style="color:#344d37">Venta registrada en webaplica</h2><p>Hola ${escapeHtml(seller.nombre)}, se registró una venta en tu punto de venta.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Producto</th><th>Cantidad</th><th align="right">Precio</th><th align="right">Total</th></tr></thead><tbody>${rows}</tbody></table><h3 style="text-align:right">Total: ${currency.format(grandTotal)}</h3><p style="color:#77817b;font-size:12px">San Isidro · Lima, Perú</p></div>`,
        }),
      });
      emailSent = mailResponse.ok;
      if (!emailSent) emailError = `El correo no se pudo enviar (Resend ${mailResponse.status}); la venta sí quedó registrada.`;
    }

    return reply({ success: true, email_sent: emailSent, email_error: emailError, sale_ids: saved?.map(row => row.id) ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al registrar la venta.';
    const status = message.startsWith('Stock insuficiente') ? 409 : 500;
    return reply({ success: false, error: message }, status);
  }
});
