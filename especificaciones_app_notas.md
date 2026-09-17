# Especificaciones — App de notas personal

## 1. Resumen

Aplicación de notas de uso personal (un solo usuario), sencilla, con texto, encabezados, listas con checkbox e imágenes. Guarda los datos en Google Drive del propio usuario para tener sincronización multidispositivo, funciona offline, y está pensada para dos entornos: escritorio (Windows) y móvil (iPhone).

No hay usuarios múltiples, no hay colaboración, no hay resolución de conflictos compleja: es una app personal.

## 2. Plataforma

**Progressive Web App (PWA)**, no app nativa.

- Se desarrolla en Windows con herramientas web estándar.
- Se instala en el iPhone desde Safari ("Compartir → Añadir a pantalla de inicio").
- Evita la necesidad de Mac/Xcode para compilar, evita cuentas de desarrollador, evita tiendas de aplicaciones.
- Debe funcionar en dos layouts:
  - **Escritorio**: 3 columnas (barra lateral, lista de notas, detalle) — ver mockup adjunto (`notas_desktop_mockup.html`).
  - **Móvil**: navegación apilada (lista → detalle a pantalla completa con botón de volver), estilo Apple Notas en iPhone. *Pendiente de mockup específico.*

### Consideraciones específicas de iOS
- El login de Google debe abrirse en Safari real, no en un webview embebido.
- Safari puede limpiar datos offline de una PWA tras un periodo largo de inactividad; no supone pérdida de datos porque todo está respaldado en Drive, pero puede requerir una resincronización al reabrir la app tras mucho tiempo.

## 3. Stack técnico

| Capa | Elección |
|---|---|
| Framework | React + Vite |
| PWA / service worker | `vite-plugin-pwa` |
| Base de datos local (offline-first) | Dexie.js (sobre IndexedDB) |
| Autenticación | Google Identity Services (OAuth 2.0) |
| Backend de datos | Google Drive API v3 (REST directo, sin SDK) |
| Estado de la app | Zustand |
| Estilos | Tailwind CSS |
| Tipografía | Inter, embebida (Google Fonts o self-host), sin selector de fuente |
| Hosting | Vercel o Netlify (capa gratuita) |

## 4. Almacenamiento en Google Drive

Estructura de carpetas dentro del Drive del usuario:

```
/MiAppNotas/
  /notes/
    <note_id>.json
  /images/
    <note_id>_<img_id>.jpg
```

- **Un archivo JSON por nota** (no un archivo único con todas las notas), para sincronizar de forma granular y minimizar transferencia de datos.
- Las imágenes se suben como archivos independientes a `/images/`; la nota solo guarda la referencia (`fileId` de Drive).
- Usar el scope `drive.file` (o `drive.appdata` si se quiere ocultar la carpeta del Drive visible del usuario) — a decidir en implementación.
- Sin coste: la API de Drive es gratuita dentro de las cuotas estándar (muy por encima de lo que una app personal puede llegar a consumir). El único coste posible es el de almacenamiento si se supera el límite gratuito de 15 GB compartido con Gmail/Fotos.

## 5. Offline-first y sincronización

1. **SQLite/IndexedDB local (vía Dexie) como fuente de verdad para la UI.** La app siempre lee y escribe aquí primero.
2. **Cola de sincronización**: cada cambio local (crear/editar/borrar nota o imagen) se marca como pendiente.
3. **Proceso de sync en segundo plano**:
   - Sube los cambios pendientes a Drive.
   - Descarga cambios remotos nuevos, usando `changes.list` de la API de Drive con un `pageToken` guardado (evita listar todo el Drive en cada sincronización).
   - Actualiza la base de datos local.
4. Sin necesidad de resolución de conflictos avanzada (última escritura gana es suficiente, dado el uso por un único usuario en, normalmente, un dispositivo a la vez).

## 6. Modelo de datos de una nota

Formato: **JSON estructurado por bloques** (no Markdown plano), para facilitar el renderizado y la futura extensión con nuevos tipos de bloque.

```json
{
  "id": "note_123",
  "title": "Compra semanal",
  "tag": "casa",
  "pinned": true,
  "deleted": false,
  "createdAt": "2026-09-10T09:00:00Z",
  "updatedAt": "2026-09-17T09:12:00Z",
  "blocks": [
    {
      "type": "heading",
      "content": "Plan de contenido"
    },
    {
      "type": "text",
      "content": "Texto normal, con soporte de **negrita** usando sintaxis Markdown simple dentro del string."
    },
    {
      "type": "checklist",
      "items": [
        { "text": "Leche de avena", "checked": true },
        { "text": "Tomates", "checked": false }
      ]
    },
    {
      "type": "image",
      "driveFileId": "1abc...xyz",
      "caption": ""
    }
  ]
}
```

### Tipos de bloque incluidos (versión inicial)
- `heading` — encabezado
- `text` — párrafo de texto
- `checklist` — lista con checkbox
- `image` — referencia a imagen en Drive

### Formato en línea
- **Negrita**: única opción de formato en línea, aplicable dentro de `text`, `heading` y los `items` de `checklist`. Se recomienda sintaxis Markdown simple (`**texto**`) guardada directamente en el string del bloque, en vez de un modelo de spans/rangos — mucho más simple de guardar, sincronizar y renderizar.
- No se incluyen cursiva, subrayado, tachado ni otros formatos, para no complicar el editor.

### Etiquetas
- Una única etiqueta por nota (no multi-etiqueta, no jerarquía de carpetas).
- Lista de etiquetas gestionada por el usuario, visible en la barra lateral con contador de notas.

## 7. Funcionalidades incluidas

- Crear, editar y eliminar notas (con papelera de recuperación, no borrado inmediato).
- Búsqueda full-text sobre título y contenido de bloques.
- Fijar notas (pin) — aparecen en sección separada arriba de la lista.
- Etiquetas simples (una por nota, sin jerarquía).
- Bloques: encabezado, texto, checklist, imagen.
- Negrita como único formato en línea.
- Fecha de última edición visible en lista y detalle.
- Modo oscuro (si el esfuerzo de implementación es bajo con el framework de estilos elegido).

## 8. Explícitamente fuera de alcance (por ahora)

Estos puntos se han descartado conscientemente para mantener la app simple. Se documentan aquí para no perderlos de vista, pero no se implementan en esta primera versión:

- Lista simple sin checkbox (viñetas/numerada)
- Separador/línea divisoria como bloque
- Bloque de enlace (URL)
- Bloque de código
- Tablas, citas con estilo especial, audio/vídeo
- Colaboración multiusuario o notas compartidas
- Cifrado end-to-end
- Historial de versiones
- Jerarquía de carpetas (solo etiquetas planas)

## 9. Referencias de diseño

- `notas_desktop_mockup.html` — mockup funcional de la interfaz de escritorio (HTML/CSS/JS autocontenido, sin dependencias de build), con paleta de color, tipografía Inter embebida, y las interacciones básicas de selección de nota, checklist y filtrado por etiqueta.
- Mockup de la versión móvil: pendiente de crear, sigue el patrón de navegación apilada (lista → detalle) en vez del layout de 3 columnas.
