# ShineUP Ops - PWA

Stack: React + TypeScript + Vite + Tailwind + Netlify Functions + Airtable

## Setup local

```bash
npm install
npm run dev
```

Para correr las Netlify Functions localmente necesitas Netlify CLI:
```bash
npm install -g netlify-cli
netlify dev
```

## Variables de entorno

En Netlify Dashboard → Site settings → Environment variables:

```
AIRTABLE_TOKEN = tu_token_de_airtable_aqui
```

Para desarrollo local, crea un archivo `.env` en la raiz:
```
AIRTABLE_TOKEN=tu_token_de_airtable_aqui
```

## Como encontrar tu Airtable Token

1. Ve a airtable.com → tu cuenta → Developer Hub
2. Personal access tokens → Create token
3. Scopes: data.records:read, data.records:write
4. Access: tu base ShineUpCleaningJobScheduler

## Como encontrar el Staff Record ID de prueba

1. Abre tu base en Airtable
2. Ve a la tabla Staff
3. Abre el registro de tu cleaner de prueba
4. El ID esta en la URL: .../tblgHwN1wX6u3ZtNY/recXXXXXXXXXX
5. Pega ese recXXXXXXXXXX en App.tsx → TEMP_USER.staffId

## Deploy en Netlify

1. Sube este repo a GitHub
2. Conecta en netlify.com → Import from GitHub
3. Build command: npm run build
4. Publish directory: dist
5. Agrega AIRTABLE_TOKEN en Environment variables
6. Deploy
