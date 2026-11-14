# webaplica

Sitio de venta de accesorios de computadora y punto de venta sencillo para webaplica, San Isidro, Lima. Está construido con HTML, CSS y JavaScript sin framework. El catálogo, vendedores y ventas usan el proyecto Supabase indicado.

## Archivos

- `index.html`, `styles.css`, `app.js`: sitio responsive y carrito de ventas.
- `supabase/functions/registrar-venta/index.ts`: valida productos y stock, obtiene precios desde la base de datos y registra una fila por producto en `ventas`. La función consulta el correo del vendedor y prepara el email con el detalle.

## Configuración de Supabase

El navegador usa la clave publicable (segura para cliente) del proyecto `mrsngiseezttrgrcqxlw`. El encabezado `Authorization` usa la clave JWT `anon` heredada para que la Edge Function pueda validar JWT (la clave publicable nueva no es un JWT). Ambas son credenciales públicas con rol `anon`; nunca se incluye una clave `service_role` o `sb_secret` en el navegador. La app necesita permiso público de solo lectura para las columnas de catálogo y vendedor. En el SQL Editor del proyecto ejecuta:

```sql
grant select (id_producto, descripcion, stock, precio) on public.producto to anon;
create policy "Catálogo visible para webaplica" on public.producto for select to anon using (true);

grant select (id_vendedor, nombre) on public.vendedor to anon;
create policy "Vendedores visibles para webaplica" on public.vendedor for select to anon using (true);
```

`ventas` permanece sin acceso directo para el navegador. Despliega `registrar-venta` con verificación JWT habilitada y configura los secretos del proveedor de correo en Edge Functions:

- `RESEND_API_KEY`: clave privada de Resend.
- `MAIL_FROM`: remitente verificado, por ejemplo `webaplica <ventas@tu-dominio.com>`.

La función usa las variables que Supabase inyecta para la conexión administrativa. El correo se envía al valor `correo` asociado al vendedor. Sin configurar Resend, la venta igualmente se graba y el punto de venta indica que el email está pendiente. El proveedor de correo debe autorizar el remitente antes de enviar en producción.

## Ejecutar

Abre `index.html` en un servidor estático (por ejemplo, Live Server). En la vista de catálogo únicamente aparecerán los productos realmente presentes en la tabla `producto` de Supabase.

