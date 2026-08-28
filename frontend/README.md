# Frontend de Soportia

Cliente Angular 22 del API de Soportia. Las páginas están en `src/app/features`;
auth, layout, HTTP y modelos están en `src/app/core`.

El stack completo, el entorno, las cuentas demo y n8n se documentan en el
[`README.md`](../README.md) de la raíz.

```bash
npm install
npm start
```

El servidor de desarrollo usa `proxy.conf.json` para llegar a `http://localhost:8080`.
Las imágenes de producción las construye `frontend/Dockerfile` y nginx las sirve
en los puertos 4200/4243.
