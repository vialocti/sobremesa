# Sobremesa

Sitio de conversación ciudadana: encuesta, foro moderado y propuestas de notas.
Es un sitio estático (HTML + CSS + JS) que guarda los datos en [Supabase](https://supabase.com).

```
index.html         Sitio público
admin.html         Panel de moderación (aprobar / rechazar / borrar)
privacidad.html    Aviso de privacidad
js/config.js       ← acá van los datos de tu proyecto de Supabase
js/common.js       Conexión y utilidades compartidas
js/app.js          Lógica del sitio
js/admin.js        Lógica del panel
supabase/schema.sql  Tablas y reglas de seguridad
```

## Puesta en marcha

### 1. Crear el proyecto en Supabase
1. Entrá a supabase.com → **New project** (el plan gratuito alcanza).
2. Elegí una región cercana (ej. *South America (São Paulo)*).

### 2. Crear las tablas
**SQL Editor → New query** → pegá todo `supabase/schema.sql` → **Run**.

### 3. Cerrar el registro de usuarios
**Authentication → Sign In / Providers → Email**: dejalo habilitado, pero
**desactivá "Allow new users to sign up"**. Así nadie puede crearse una cuenta
desde afuera. (Igual, solo modera quien esté en la tabla `admins`.)

### 4. Crear la cuenta de moderación
1. **Authentication → Users → Add user → Create new user** con email y contraseña
   (marcá *Auto Confirm User*).
2. En el **SQL Editor**:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu-email@ejemplo.com';
   ```
   Repetí esto por cada persona del equipo que modere.

### 5. Conectar el sitio
En **Project Settings → API** copiá la *Project URL* y la *anon public key* a
`js/config.js`. La anon key es pública a propósito. **Nunca** pegues la
`service_role` key.

### 6. Publicar
Cualquier hosting estático sirve. El más simple:
- **Netlify**: app.netlify.com → *Add new site → Deploy manually* → arrastrá la carpeta.
- **Cloudflare Pages** o **Vercel**: lo mismo, o conectando un repositorio de GitHub.

Después configurá tu dominio propio desde el panel del hosting.

### 7. Completar los textos marcados
Buscá `EDITAR` en los archivos:
- `index.html`: dominio en las etiquetas `og:` / `canonical`, texto de "Quiénes somos" y email de contacto.
- `privacidad.html`: email de contacto; revisar el texto con el equipo.

## Moderar
Entrá a `tudominio.org/admin.html` con la cuenta del paso 4.
- **Comentarios**: se publican cuando los aprobás.
- **Notas**: al publicarlas aparecen en la sección "Notas de la comunidad". El
  contacto que dejó la persona solo se ve en el panel.

## Probar en tu computadora
Abrí `index.html` en el navegador, o levantá un servidor local:
```
npx serve .
```

## Límites a tener en cuenta
- **Un voto por navegador**: se controla con un identificador guardado en el
  navegador. Alcanza para una encuesta de opinión, pero alguien con ganas
  (modo incógnito, otro navegador) puede votar más de una vez. No sirve para
  una votación vinculante.
- **Spam**: hay un campo trampa para bots y una espera de 30 segundos entre
  envíos, y además todo pasa por moderación. Si llega mucho spam, el siguiente
  paso es sumar [Cloudflare Turnstile](https://supabase.com/docs/guides/auth/auth-captcha).
- **Plan gratuito de Supabase**: los proyectos sin actividad durante 7 días se
  pausan. Se reactivan desde el panel. Con tráfico normal no pasa.
