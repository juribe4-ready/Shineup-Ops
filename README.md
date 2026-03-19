# ShineUP Ops

App móvil PWA para el equipo de limpieza de ShineUP Cleaning Services (Columbus, OH).

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend (API) | Vercel Serverless Functions (`/api/*.js`) |
| Base de datos | Airtable (`appBwnoxgyIXILe6M`) |
| Auth | Supabase (`jpdajjiaukzilrxwcgtx.supabase.co`) |
| Storage (fotos/videos) | Cloudinary (`dw93dwwrh`) |
| Hosting | Vercel (`shineup-ops.vercel.app`) |
| Fuente | Poppins (Google Fonts) |

---

## Repositorio

`github.com/juribe4-ready/Shineup-Ops` — rama `main`

---

## Estructura de archivos

```
Shineup-Ops/
├── api/                          ← Vercel Serverless Functions
│   ├── getCleanings.js           ← Lista de limpiezas del día por staff
│   ├── getCleaningTasks.js       ← Detalle de limpieza + staff + equipment
│   ├── updateCleaning.js         ← Actualiza status, rating, startTime, etc.
│   ├── saveFileUrl.js            ← Guarda URL de Cloudinary en Airtable
│   ├── getIncidents.js           ← Incidentes por propiedad
│   ├── getInventory.js           ← Inventario del cliente por propiedad
│   ├── createIncident.js         ← Crea nuevo incidente
│   └── addInventory.js           ← Agrega registro de inventario
├── public/
│   ├── manifest.json             ← PWA manifest
│   ├── icon-192.png              ← Ícono PWA
│   └── icon-512.png              ← Ícono PWA
├── src/
│   ├── App.tsx                   ← Pantalla principal — lista de limpiezas
│   ├── main.tsx
│   ├── index.css
│   └── components/
│       ├── CleaningCard.tsx      ← Card de limpieza en la lista
│       └── CleaningChecklist.tsx ← Checklist completo (4 secciones)
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── vercel.json
└── service-worker.js             ← PWA offline cache
```

---

## Tablas de Airtable

| Tabla | ID |
|---|---|
| Cleanings | `tblabOdNknnjrYUU1` |
| Staff | `tblgHwN1wX6u3ZtNY` |
| Properties | `tbl1iETmcFP460oWN` |
| Equipment | `tblFOJpGUKpCC5hQO` |
| Incidents | `tbli8QbMBjUuzsCPw` |
| ClientInventory | `tblppdLDDnyT0eye9` |

### Campos clave en Cleanings
- `Assigned Staff` — array de record IDs de Staff
- `Property` — linked record a Properties
- `Status` — `Programmed` → `Opened` → `In Progress` → `Done`
- `Rating` — `⭐ Malo` / `⭐⭐ Normal` / `⭐⭐⭐ Bueno`
- `VideoInicial` — attachment (video de llegada)
- `Photos & Videos` — attachments (fotos/videos de cierre)
- `Start Time` / `End Time` — timestamps ISO
- `OpenComments` — notas de apertura
- `staffList` — texto plano con nombres del staff (campo fórmula)
- `Property Text` — texto plano con nombre de propiedad
- `Cleaning Type Text` — tipo de limpieza
- `Labor` — horas estimadas (para calcular tiempo de fin)

### Campos clave en Staff
- `Name` — nombre completo
- `Initials` — iniciales (ej: JU, PD)
- `Role` — `Cleaner`, `Manager`, `Admin`
- `Email` — correo electrónico

### Campos clave en Incidents
- `Name` — nombre del incidente
- `Comment` — descripción
- `Status` — `Reported`, `In Progress`, `Closed`
- `Property` — linked record a Properties
- `Cleaning ID` — linked record a Cleanings
- `Reported By` — linked record a Staff
- `Photos` — attachments
- `MediaURL` — URL de Cloudinary (texto plano) ← usar este para mostrar fotos

### Campos clave en ClientInventory
- `Status` — `Low`, `Out of Stock`, `Optimal`
- `Comment` — descripción del item
- `Property` — linked record a Properties
- `Cleanings` — linked record a Cleanings
- `Reported By` — linked record a Staff
- `Attachments` — attachments
- `MediaURL` — URL de Cloudinary (texto plano) ← usar este para mostrar fotos

---

## Variables de entorno (Vercel)

| Variable | Descripción |
|---|---|
| `AIRTABLE_TOKEN` | Personal Access Token de Airtable |
| `B2_KEY_ID` | Backblaze B2 Key ID (no se usa actualmente) |
| `B2_APP_KEY` | Backblaze B2 App Key (no se usa actualmente) |
| `B2_BUCKET_NAME` | `shineup-ops` |
| `B2_ENDPOINT` | `s3.us-east-005.backblazeb2.com` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | `dw93dwwrh` |

---

## Flujo de la app (Cleaner)

```
Login (próximamente — Supabase Auth)
    ↓
Lista de limpiezas del día
    ↓
Tap en una limpieza → Checklist (4 secciones)
    ↓
DETALLE → Dirección, horario, staff, equipos, códigos de acceso, Book
    ↓
INICIO
  1. Sube video/foto inicial → Cloudinary → Airtable
  2. Instrucciones iniciales del cliente
  3. Califica estado (1-3 estrellas) → Airtable
  4. Empezar limpieza → Status: In Progress → Airtable
    ↓
REPORTE
  - Inventario del cliente (Low / Out of Stock + foto)
  - Incidentes (nombre + foto + descripción)
    ↓
CIERRE
  - Sube fotos/videos de cierre → Cloudinary → Airtable
  - Terminar limpieza → Status: Done → Airtable
```

---

## Lógica de tiempo estimado de fin

```
cleanerCount = staff donde role.includes('cleaner')
minutesRaw = Labor / max(cleanerCount, 1)
minutesRounded = ceil(minutesRaw / 15) * 15
adjustment = rating===1 ? +30 : rating===3 ? -30 : 0
totalMinutes = max(minutesRounded + adjustment, 45)
estimatedEnd = scheduledTime + totalMinutes
```

---

## Auth — Supabase (en construcción)

**Project URL:** `https://jpdajjiaukzilrxwcgtx.supabase.co`

### Roles
| Rol | Acceso |
|---|---|
| `admin` | Todo — gestión de usuarios, dashboard, checklist |
| `manager` | Dashboard operacional, ver todas las limpiezas |
| `cleaner` | Solo checklist de sus limpiezas del día |
| `client` | Portal de cliente — fotos, videos, incidentes de sus propiedades |

### Tabla profiles (Supabase)
```sql
profiles
├── id uuid (= auth.users.id)
├── email text
├── role text (admin | manager | cleaner | client)
├── staff_airtable_id text (record ID en tabla Staff de Airtable)
├── active boolean
├── invited_at timestamp
└── created_at timestamp
```

---

## Cloudinary

- **Cloud:** `dw93dwwrh`
- **Upload Preset:** `shineup-ops` (unsigned)
- **Carpeta:** `shineup-ops/`
- Fotos y videos < 100MB
- Para videos > 100MB: grabar en 1080p (iPhone: Configuración → Cámara → Grabar Video → 1080p a 30fps)

---

## Roadmap

### ✅ Completado
- PWA instalable (iPhone y Android)
- Lista de limpiezas del día con fotos
- Checklist completo con 4 secciones
- Upload de video inicial y fotos de cierre a Cloudinary
- Incidentes con foto → Airtable
- Inventario del cliente con foto → Airtable
- Rating y timestamps guardados en Airtable
- Modal de advertencia para videos grandes
- Iniciales del staff desde Airtable

### 🔄 En construcción
- Supabase Auth (login con Google + email)
- Protección de rutas por rol
- Página de admin — gestión de usuarios

### 📋 Próximo
- Vista semanal de limpiezas (cleaner)
- Dashboard admin con mapa y timeline en tiempo real
- Portal del cliente (fotos, videos, incidentes)
- Módulo de comunicación SMS (Twilio) con flujo de aprobación
- Módulo de programación (appointments desde web + TurnoverBnB)
- CRM

---

## Notas técnicas importantes

- Las URLs de Airtable (`v5.airtableusercontent.com`) expiran cada hora — usar siempre `MediaURL` (Cloudinary) para mostrar fotos en la app
- El campo `Photos & Videos` en Cleanings se llama exactamente así con espacios y `&`
- `getIncidents` y `getInventory` filtran en JavaScript (no con fórmulas de Airtable) porque los linked records no funcionan confiablemente en filtros de API
- El token de Airtable necesita scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
- Vercel tiene límite de 4.5MB en el body — por eso los archivos van directo a Cloudinary desde el browser (no pasan por Vercel)
- `vercel.json` tiene headers `Cross-Origin-Embedder-Policy: unsafe-none` para permitir imágenes de dominios externos
