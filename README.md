# Lima Limón · CRM de call center

Next.js 15 + Postgres (Prisma) + WhatsApp Cloud API, listo para desplegar en Vercel.

## Qué hace

- **Login real** con contraseñas hasheadas (bcrypt) y sesión en cookie firmada (JWT, 12 h).
- **Tres roles**: `ADMIN` (vos: crea usuarios, ve todo, cambia las reglas de aviso), `CARGADOR` (sube y asigna contactos), `CALLER` (solo ve su cola y registra resultados).
- **Aviso push instantáneo** al caller cuando le cargan un contacto, con la web instalada como app en el celular. Telegram y WhatsApp quedan como respaldo opcional.
- **Recordatorios automáticos**: cada 10 min si la ficha sigue sin llamar, cada 20 min si marcó "no contestó", cada 25 min si marcó "volver a llamar". Todo editable desde el panel (pestaña *Avisos*).
- **Un solo mensaje por caller** aunque tenga 8 fichas vencidas, con horario de silencio y tope diario por ficha.
- **Auditoría** de cada acción y registro de cada aviso enviado (entregado / error).

## 1. Base de datos

Creá una Postgres en [Neon](https://neon.tech) o Supabase (ambas tienen plan gratis) y copiá la cadena de conexión.

```bash
npm install
cp .env.example .env      # completá DATABASE_URL y JWT_SECRET
npx prisma migrate dev --name inicial
npm run seed              # crea el usuario admin
npm run dev
```

## 2. Desplegar en Vercel

1. Subí el proyecto a GitHub → *Import Project* en Vercel.
2. En **Settings → Environment Variables** cargá todo lo del `.env.example`.
3. Deploy. El `build` corre `prisma migrate deploy` solo.
4. Entrá con `admin` y la contraseña del seed, **cambiala** y creá el resto del equipo.

## 3. Avisos push (canal principal)

La web es **instalable**: en Android aparece "Agregar a pantalla de inicio" y queda como una app más, con su icono y sin barra del navegador. Los avisos usan Web Push, el mismo estándar de Gmail o Slack: sin costo por mensaje, sin intermediarios y funcionan con la app cerrada.

1. Generá las llaves una sola vez:

```bash
npx web-push generate-vapid-keys
```

2. Pegá la pública en `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, la privada en `VAPID_PRIVATE_KEY` y tu mail en `VAPID_SUBJECT`, tanto en `.env` como en Vercel.
3. Cada persona entra al panel una vez y toca **Activar avisos**. Listo: ese dispositivo queda registrado.

**iPhone:** hay que instalar la web primero (Compartir → *Agregar a inicio*) y abrirla desde ese icono; recién ahí iOS deja pedir permiso. Es iOS 16.4 o superior. Android no necesita nada de eso. El panel ya le muestra a cada uno la instrucción que le corresponde.

Cómo llega el aviso: reemplaza al anterior en vez de apilar diez (`tag`), vibra, y queda fijo en la pantalla hasta que lo tocan (`requireInteraction`). Tocarlo abre directamente la ficha.

Si alguien limpia los datos del navegador o desinstala, su suscripción muere y el servidor la borra solo la próxima vez que intenta avisarle. Esa persona tiene que volver a tocar "Activar avisos" — vale la pena revisarlo cuando alguien deja de recibir.

## 4. Telegram (respaldo opcional)

El proyecto manda los avisos por **Telegram si el caller lo tiene vinculado**, y usa WhatsApp solo como respaldo. Telegram no cobra por mensaje, no exige plantillas aprobadas y deja poner botones abajo del aviso: el caller marca *Aceptó / No contestó / No quiso / Volver a llamar* sin abrir la web, y eso queda guardado en la misma base.

1. Abrí **@BotFather** en Telegram → `/newbot` → copiá el token en `TG_TOKEN`.
2. Inventá una cadena para `TG_SECRETO`.
3. Registrá el webhook una sola vez (reemplazá lo tuyo):

```bash
curl "https://api.telegram.org/bot<TG_TOKEN>/setWebhook" \
  -d "url=https://TU-DOMINIO.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TG_SECRETO>"
```

4. En el panel, pestaña *Usuarios*, tocá **Generar código** al lado de cada caller y pasáselo. Él le manda al bot `/start CODIGO` una sola vez y queda vinculado.

**Por qué el /start es obligatorio:** un bot de Telegram no puede escribirle primero a alguien que nunca le habló. Es la única fricción del canal, y es de una sola vez por persona.

Comandos del caller: `/cola` (ver sus pendientes con botones), `/pausa`, `/activar`.

Límites: unos 30 mensajes por segundo en total y 1 por segundo al mismo chat — para un call center de decenas de callers no lo vas a rozar.

## 5. WhatsApp (opcional, se cobra por mensaje)

1. Creá una app en [developers.facebook.com](https://developers.facebook.com) → producto **WhatsApp**.
2. Anotá el **Phone Number ID** (`WA_PHONE_ID`) y generá un **token permanente** de usuario de sistema (`WA_TOKEN`).
3. Creá una plantilla categoría **Utility** (ej. `aviso_contacto_asignado`) con tres variables:
   `Hola {{1}}, tenés {{2}} contacto(s) para llamar. El primero es {{3}}. Entrá al panel.`
   Esperá la aprobación de Meta (suele tardar minutos).
4. Webhook: `https://TU-DOMINIO.vercel.app/api/whatsapp/webhook`, con el `WA_VERIFY_TOKEN` que pusiste en el `.env`, suscripto al campo `messages`.

**El detalle que te ahorra plata:** Meta cobra cada plantilla entregada. Pero si el caller le escribe al número, se abre una **ventana de servicio de 24 h** y ahí los mensajes de texto libre no se cobran (esto rige hasta el 30/09/2026; después Meta empieza a cobrarlos también). El código ya detecta la ventana y elige el canal solo. Instrucción para el equipo: **cada caller manda "hola" al número al empezar el turno.** Con recordatorios cada 10 minutos, la diferencia entre ventana abierta y plantilla es de decenas de dólares por caller por mes.

Los callers pueden responder **BAJA** para apagar sus avisos y **ALTA** para volver a prenderlos.

## 6. El cron (importante)

El motor de recordatorios vive en `/api/cron/recordatorios` y `vercel.json` ya lo programa cada 5 minutos.

⚠️ **El plan Hobby de Vercel solo permite crons una vez por día** — un `*/5 * * * *` hace fallar el deploy. Tenés dos caminos:

- **Vercel Pro** (~USD 20/mes por miembro): habilita cadencia por minuto y el `vercel.json` funciona tal cual.
- **Cron externo gratis**: borrá el bloque `crons` del `vercel.json` y programá en [cron-job.org](https://cron-job.org), Upstash QStash o GitHub Actions un GET cada 5 minutos a
  `https://TU-DOMINIO.vercel.app/api/cron/recordatorios` con el header `Authorization: Bearer <CRON_SECRET>`.

## 7. Cosas que conviene que sepas

- Los recordatorios cada 10 minutos son agresivos: si el caller tiene 6 fichas, en una hora recibe 6 mensajes (agrupados, no 36). Probalo una semana con 10/20 y ajustá desde el panel; lo más común es terminar en 20/45.
- Meta baja la *calidad* del número si la gente marca los mensajes como spam, y con calidad baja te limita el volumen de envío. Por eso conviene que cada caller acepte recibirlos y tenga el "BAJA" disponible.
- Alternativa a Meta directo: Twilio o 360dialog cobran un extra por encima de la tarifa de Meta, pero te evitan el trámite de la app. Cambiar de proveedor toca un solo archivo: `src/lib/whatsapp.ts`.
- Antes de arrancar con volumen, revisá las reglas de llamadas en frío de tu país (registros de no-llamar, horarios permitidos, consentimiento). Las multas caen sobre la empresa que llama, no sobre el software.

## Estructura

```
prisma/schema.prisma        modelos: Usuario, Lead, Llamada, Aviso, Auditoria, Config
src/lib/auth.ts             login, sesión JWT, control de roles, auditoría
src/lib/push.ts             Web Push con llaves VAPID + limpieza de suscripciones muertas
public/sw.js                service worker: muestra el aviso con la app cerrada
src/app/panel/Avisador.tsx  pide permiso y registra el dispositivo
src/lib/telegram.ts         bot: fichas con botones de resultado
src/lib/avisos.ts           elige canal: push → Telegram → WhatsApp
src/lib/whatsapp.ts         envío por ventana o plantilla + registro de cada aviso
src/lib/notificaciones.ts   reglas de recordatorio, agrupado, horarios, topes
src/app/api/...             login, leads, resultados, usuarios, config, cron, webhook
src/app/api/telegram/...    webhook del bot: /start, /cola, botones de resultado
src/app/panel/Panel.tsx     interfaz por rol
```
