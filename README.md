# webaplica

Sitio de venta de accesorios de computadora y punto de venta sencillo para webaplica, San Isidro, Lima. Está construido con HTML, CSS y JavaScript sin framework. El catálogo, vendedores y ventas usan el proyecto Supabase indicado.

## Archivos

- `index.html`, `styles.css`, `app.js`: sitio responsive y carrito de ventas.
- `supabase/functions/registrar-venta/index.ts`: valida productos y stock, obtiene precios desde la base de datos y registra una fila por producto en `ventas`. La función consulta el correo del vendedor y prepara el email con el detalle.

## Configuración de Supabase

El navegador usa la clave publicable (segura para cliente) del proyecto `mrsngiseezttrgrcqxlw`. Supabase Auth usa correo y contraseña. El punto de venta solo aparece con una sesión activa y la Edge Function `registrar-venta` vuelve a validar el usuario antes de usar su clave administrativa. No se incluye una clave `service_role` o `sb_secret` en el navegador. La app conserva lectura pública de solo lectura para las columnas de catálogo y vendedor. En el SQL Editor del proyecto ejecuta:

```sql
grant select (id_producto, descripcion, stock, precio) on public.producto to anon;
create policy "Catálogo visible para webaplica" on public.producto for select to anon using (true);

grant select (id_vendedor, nombre) on public.vendedor to anon;
create policy "Vendedores visibles para webaplica" on public.vendedor for select to anon using (true);
```

`ventas` permanece sin acceso directo para el navegador. Despliega `registrar-venta` con verificación JWT habilitada y configura los secretos del proveedor de correo en Edge Functions:

- `RESEND_API_KEY`: clave privada de Resend.
- `MAIL_FROM`: remitente verificado, por ejemplo `webaplica <ventas@tu-dominio.com>`.

El acceso por email está habilitado por defecto en Supabase. El formulario permite iniciar sesión y crear una cuenta; si el proyecto exige confirmar el correo, la persona debe confirmarlo antes de iniciar sesión. Para que los enlaces de confirmación regresen a la app, agrega el dominio de despliegue (y el origen local de desarrollo) a **Authentication → URL Configuration → Redirect URLs**. Cualquier cuenta Auth confirmada puede usar el punto de venta; desactiva el registro público desde la configuración de Auth si las cuentas deben ser creadas solo por el equipo.

La función usa las variables que Supabase inyecta para la conexión administrativa. El correo se envía al valor `correo` asociado al vendedor. Sin configurar Resend, la venta igualmente se graba y el punto de venta indica que el email está pendiente. El proveedor de correo debe autorizar el remitente antes de enviar en producción.

## Ejecutar

Abre `index.html` en un servidor estático (por ejemplo, Live Server). El catálogo permanece público y el punto de venta requiere sesión. En la vista de catálogo únicamente aparecerán los productos realmente presentes en la tabla `producto` de Supabase.
