# ClipDock Marketplace 2.0

Este repo es el catalogo remoto de la tienda de ClipDock.

ClipDock lee `catalog.json`, despues `plugins/index.json`, y despues cada `plugins/<slug>/plugin.json`.
Cada manifest muestra nombre, descripcion, imagenes y reglas de instalacion. El archivo descargable real vive en el ultimo release del repo indicado en `repository`.

## Flujo

1. Crear el repo del plugin en GitHub.
2. Subir un release con un `.zip` que coincida con `release.assetPattern`.
3. No hace falta tocar ClipDock.
4. Si solo cambia el programa, publicar un release nuevo en su repo.
5. Si cambia la tarjeta de la tienda, editar el `plugin.json` de este marketplace.

## URL recomendada para ClipDock

`https://raw.githubusercontent.com/depsonopsito/Clipdock-Marketplace-2.0/main/catalog.json`
