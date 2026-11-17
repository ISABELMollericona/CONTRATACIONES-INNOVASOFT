# CHAVIX Contrataciones

Aplicación web en español para publicar sistemas CHAVIX, cotizar precios calculados en el servidor, registrar solicitudes con aceptación electrónica simple, recibir comprobantes privados y revisar pagos desde administración.

## Tecnología y persistencia

- Next.js + TypeScript.
- MongoDB Atlas mediante Mongoose.
- Inicio de sesión Google con sesión JWT de NextAuth.
- Render para publicar la aplicación.
- Cloudinary con entrega autenticada para comprobantes. El disco del servicio Render no se usa como almacenamiento persistente.

Las colecciones principales son `products`, `promotions`, `users`, `contracts` y `settings`. Cada contratación conserva su precio, promoción, calendario, condiciones aceptadas, firmante y hash SHA-256 como una copia inmutable de la oferta al crearla.

Desde el panel de administración puedes crear códigos de descuento con porcentaje o monto fijo, fechas de vigencia, modalidad, periodos iniciales y productos aplicables. Si marcas todos los productos, el código queda disponible para el catálogo completo. El sistema valida el código y recalcula el precio en el servidor al cotizar y crear el contrato.

En **Catálogo y precios**, usa **+ Agregar sistema** para crear productos y sus planes; activa **Publicado** y guarda el catálogo para mostrarlos. Las alertas por correo se envían a las direcciones de `ADMIN_EMAILS` cuando se crea una contratación, se carga un comprobante o se valida/rechaza un pago. Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD` en el entorno de despliegue; opcionalmente define `SMTP_FROM`. Para Gmail, usa una contraseña de aplicación, no la contraseña normal de la cuenta.

## Desarrollo local

1. Instala Node.js 22 y npm.
2. Copia `.env.example` a `.env.local` y completa las variables.
3. En Google Cloud Console, crea credenciales OAuth de tipo aplicación web y agrega `http://localhost:3000/api/auth/callback/google` como URI de redirección autorizada.
4. Crea una base de datos en MongoDB Atlas y coloca su URI en `MONGODB_URI`.
5. Instala dependencias y carga los productos de ejemplo:

   ```sh
   npm install
   npm run seed
   npm run dev
   ```

6. Ejecuta las validaciones:

   ```sh
   npm run typecheck
   npm run build
   ```

`npm run seed` es idempotente y no reemplaza los productos ni precios ya guardados.

### Probar todo en local sin Google ni Cloudinary

Para probar contratos, firma, comprobantes y administración con un MongoDB local:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/chavix_local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=un-secreto-largo
ADMIN_EMAILS=admin@chavix.test
LOCAL_DEV_LOGIN=true
```

- `LOCAL_DEV_LOGIN=true` muestra **"Entrar (prueba local)"**: pide un correo y entra sin contraseña. Los correos de `ADMIN_EMAILS` entran como administrador. **Solo funciona en desarrollo**; en producción se ignora.
- Sin Cloudinary configurado, en desarrollo los comprobantes se guardan en `.local-uploads/` (ignorada por git). En producción sigue siendo obligatorio Cloudinary.

## Firma y documento de identidad

Al contratar, el cliente indica su documento (CI con complemento y lugar de expedición, NIT, pasaporte u otro) y **dibuja su firma** con el mouse o el dedo. Si el cliente usa NIT, firma un representante con su propio documento de identidad.

Se guardan el trazo (PNG), el nombre y documento del firmante, la fecha y una huella SHA-256 de la firma, que también forma parte del hash del contrato. El PDF incluye un bloque **"Firma del cliente"** con la firma, el nombre, el documento (por ejemplo `CI 7654321-1A LP`), la fecha y las huellas. El panel de administración muestra el firmante y su documento, y enlaza al PDF firmado.

## Configuración de acceso

- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: credenciales OAuth de Google.
- `NEXTAUTH_URL`: URL pública final (por ejemplo, `https://tu-servicio.onrender.com`).
- `NEXTAUTH_SECRET`: secreto aleatorio largo para firmar sesiones.
- `ADMIN_EMAILS`: correos Google de administración separados por coma. Los demás usuarios autenticados se registran como clientes.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: conexión SMTP para las alertas administrativas. Los avisos llegan a los correos de `ADMIN_EMAILS`.
- `MONGODB_URI`: URI privada de MongoDB Atlas.
- `MONGODB_DB`: nombre de la base (por ejemplo `CONTRATACIONES_INNOVASOFT`). Si no lo pones ni va en la URI después de `.mongodb.net/`, MongoDB guarda todo en una base llamada `test`.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: cuenta de Cloudinary para guardar y entregar comprobantes de forma autenticada.

Agrega en Google Cloud Console el callback de producción `https://tu-servicio.onrender.com/api/auth/callback/google`. No incluyas secretos en el repositorio ni los pegues en el chat.

## Despliegue en Render

1. Sube este proyecto a un repositorio Git propio.
2. En Render, crea un **Blueprint** a partir del repositorio para leer `render.yaml`.
3. Completa las variables marcadas como `sync: false` en el panel seguro del servicio, incluidas las credenciales SMTP para habilitar las alertas por correo.
4. Usa la URL asignada por Render en `NEXTAUTH_URL` y registra el callback correspondiente en Google Cloud.
5. Desde un entorno con acceso a la base de datos configurada en `MONGODB_URI`, ejecuta `npm run catalog:apply` para cargar los precios y la promoción de los flyers. **Antes de ejecutarlo, confirma que `MONGODB_URI` apunta a la base de datos correcta**: este comando reemplaza precios, planes y textos de los productos, además de actualizar la promoción. Los contratos ya creados no se modifican.
6. Comprueba el acceso, una cotización, la carga de las dos fotos del carnet, la lectura y aceptación del contrato, y la revisión manual de un comprobante.

La app requiere Node.js 22. Configura la lista de acceso de red de Atlas de acuerdo con la salida de red de Render; usa un usuario de base de datos dedicado y permisos mínimos.

## SEO y buscabilidad

La página publica metadatos en español, enlaces canónicos, datos estructurados y los archivos `/robots.txt` y `/sitemap.xml`. Configura `NEXTAUTH_URL` con la URL pública final del sitio antes de desplegar para que los buscadores reciban las direcciones correctas. El archivo de verificación HTML de Google debe permanecer en `public/` para que siga disponible en la raíz del sitio.

Para solicitar que aparezca en Google, verifica el dominio en Google Search Console y envía `https://<dominio-publico>/sitemap.xml`; también puedes inspeccionar la página principal y solicitar su indexación. La indexación y la posición dependen de Google y pueden tardar; estos cambios no garantizan una posición específica ni que el sitio aparezca inmediatamente.

## Catálogo y promociones de los flyers

- **Vigencia de Black Friday:** del 12 al 30 de noviembre de 2026, hora de Bolivia (UTC-4).
- **Mensual unisucursal:** Bs 250/mes; 50% de descuento solo en el primer mes (Bs 125), después Bs 250/mes. Se puede contratar de 1 a 12 meses consecutivos, sin saltos.
- **Prepago anual unisucursal:** Bs 2.500 por 12 meses, equivalente a 2 meses gratis (precio de comparación Bs 3.000). Mantenimiento incluido.
- **Pago único unisucursal:** Bs 3.500 (precio de comparación Bs 4.500), 3 meses de garantía y mantenimiento de Bs 1.200/año después de la garantía.
- **Mensual multisucursal:** Bs 450/mes para matriz + 1 sucursal; 50% de descuento solo en el primer mes (Bs 225), después Bs 450/mes. Sucursal adicional: Bs 150/mes.
- **Prepago anual multisucursal:** Bs 4.500 por 12 meses para matriz + 1 sucursal (precio de comparación Bs 5.400). Sucursal adicional: Bs 1.500/año.
- **Pago único multisucursal:** Bs 7.000 para hasta 3 sucursales (precio de comparación Bs 9.000), 3 meses de garantía y mantenimiento de Bs 2.500/año después de la garantía. Sucursal adicional: Bs 2.000 en pago único.
- Los planes mensuales, anuales y de pago único de Farmacia incluyen instalación, capacitación y soporte remoto. El alcance Multisucursal incluye traspasos entre sucursales, precios por sucursal, almacén central y vista de todo el negocio.
- La configuración vigente también aplica la promoción mensual del 50% a **CHAVIX Celular** (plan mensual de Bs 250 y pago único de Bs 2.000), tal como estaba configurada antes de cargar los flyers. Los flyers compartidos muestran precios de Farmacia; confirma con CHAVIX si Celular debe conservar esta promoción antes de publicar.
- Los flyers detallan Farmacia. Las funciones de CHAVIX Celular no se presuponen: confirma con CHAVIX el alcance que debe mostrarse antes de completar esa ficha.

El catálogo está definido en `src/lib/catalog-data.ts`. `npm run seed` carga productos de ejemplo de forma idempotente y **no** reemplaza los productos o precios existentes. `npm run catalog:apply` aplica explícitamente el catálogo anterior y actualiza la promoción. Úsalo solo contra la base de datos que deseas actualizar.

## Carnet, contrato y aceptación

- Antes de contratar, el cliente debe subir una foto legible del anverso y reverso del carnet de quien firma (JPG o PNG). El formulario comprime las imágenes; el servidor valida el formato y tamaño y las guarda en almacenamiento privado. En producción, configura Cloudinary. Solo administración puede acceder a las fotos.
- El cliente debe desplazarse hasta el final del contrato para habilitar la aceptación; cualquier cambio en la oferta vuelve a bloquearla. El servidor también exige la confirmación de lectura, la aceptación de términos, ambas fotos y la firma para crear el contrato.
- El texto completo contiene las partes, objeto, alcance del sistema, precios y promoción, instalación, garantía y mantenimiento, vigencia y renovación, obligaciones, datos y firma. El PDF se genera con la copia de cláusulas aceptada y el detalle de pagos guardados con el contrato.
- La aceptación registrada es una firma electrónica simple, no una firma digital certificada ni asesoramiento legal. Revisa y confirma con CHAVIX o asesoría legal las cláusulas comerciales antes de usar el contrato en producción.

## QR de pago por monto

En **Administración → Configuración general** se pueden subir un QR general y QR por monto (JPG o PNG, hasta 5 MB), previsualizarlos y ajustar el recorte cuadrado con zoom y posición. La fecha de vencimiento es opcional; se avisa en el panel cuando faltan 7 días o menos y cuando ya venció. La fecha se interpreta en hora de Bolivia. Al vencer, el QR deja de ofrecerse a los clientes: un QR por monto vencido no se reemplaza por el QR general; si vence el general, no se muestra como alternativa.

En producción, las imágenes subidas se guardan en Cloudinary, por lo que configura sus tres variables de entorno antes de cargar QR. En desarrollo sin Cloudinary se guardan en `public/qr/`. También se admiten archivos agregados manualmente a esa carpeta con el nombre exacto del monto, por ejemplo `public/qr/375.png`; los montos decimales usan guion bajo, por ejemplo `public/qr/562_50.png`. Si un monto no tiene QR exacto, se muestra el QR general vigente y se pide al cliente escribir el monto.

Para los precios base sin sucursales adicionales, los 28 montos posibles son: Bs 125, 225, 375, 625, 675, 875, 1.125, 1.375, 1.575, 1.625, 1.875, 2.000, 2.025, 2.125, 2.375, 2.475, 2.500, 2.625, 2.875, 2.925, 3.375, 3.500, 3.825, 4.275, 4.500, 4.725, 5.175 y 7.000. Las sucursales adicionales pueden generar otros importes.

`npm run qr:amounts` lista los importes y rutas de archivo según los productos, planes y promociones activos en la base de datos; requiere `MONGODB_URI`.

## Límites deliberados de esta versión

- La firma registrada es **electrónica simple** (trazo dibujado, documento de identidad, fecha y hash del contenido); no es una firma digital certificada con token o certificado de una entidad acreditada (ADSIB) ni asesoramiento sobre validez legal.
- La carga de un comprobante no confirma el pago. Solo un administrador lo puede validar o rechazar.
- No hay integración bancaria ni pago QR automático; la cuenta y la imagen QR se muestran como datos de transferencia.
- Las fotos del carnet y los comprobantes se guardan de forma privada; configura Cloudinary en producción antes de habilitar contrataciones y cargas.
- El PDF de contratación es un comprobante descargable generado a partir de la copia de condiciones y precios guardada al contratar.
- Esta entrega no configura servicios de correo, WhatsApp ni notificaciones automáticas.
