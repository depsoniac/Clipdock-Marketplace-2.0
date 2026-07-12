# ClipDock Marketplace 2.0

Tienda de complementos de ClipDock. La app lee **`catalog-resolved.json`** (un solo
archivo) y de ahi saca todo: nombres, imagenes, versiones y links de descarga.

## Lo importante: no editas versiones a mano

Un **robot** (GitHub Action) mantiene el catalogo solo. Tú solo describes cada plugin
una vez; el robot se encarga de leer el ultimo release de GitHub y rellenar version,
archivo, tamaño y firma SHA-256.

### Cada carpeta = un plugin

```
plugins/
  mi-plugin/
    plugin.json      <- ficha ESTATICA (lo unico que editas)
    assets/
      logo.png
      banner.png
```

En `plugin.json` va solo lo que no cambia (nombre, categoria, imagenes, descripcion)
y **de que repo es** (`repository` + `release.mode: "github-latest-release"`).
**No pongas** version, downloadUrl, sha256, etc.: eso lo rellena el robot.

Copia `plugins/_template/plugin.json` para empezar.

## Como agrego un plugin nuevo

1. Crea la carpeta `plugins/<mi-plugin>/` con su `plugin.json` (usa la plantilla) y sus `assets/`.
2. Sube el cambio. El robot corre solo y el plugin aparece en la tienda.

## Como saco un plugin de la tienda

Ponle en su `plugin.json`:

```json
"enabled": false
```

El robot lo omite y desaparece de la tienda (pero conservas la ficha por si lo quieres
volver a activar). Si lo quieres eliminar del todo, borra su carpeta.

## Como saco una version nueva de un plugin

Solo publica un **release nuevo** en el repo de ese plugin (con un ZIP como asset).
No tocas este marketplace: el robot lo detecta en la siguiente corrida (cada 6 h) y la
app avisa del update. Si quieres que sea **instantaneo**, mira
`docs/plugin-repo-notify.yml`.

## El robot (GitHub Action)

`.github/workflows/build-catalog.yml` corre `scripts/build-catalog.mjs`:

- al subir/editar un `plugin.json`, el `catalog.json` o el script,
- cada 6 horas,
- a mano desde la pestana **Actions**,
- o cuando un repo de plugin le avisa (`repository_dispatch`).

Genera `catalog-resolved.json` (lo que lee la app) y `plugins/index.json` (indice de
carpetas), y los sube solo. Es gratis: en repos publicos, Actions es ilimitado.

## Archivos

| Archivo | Que es | Quien lo edita |
|---|---|---|
| `plugins/<x>/plugin.json` | Ficha estatica de cada plugin | **Tú** |
| `catalog.json` | Config de la tienda (filtros, hero, textos) | Tú (rara vez) |
| `catalog-resolved.json` | Catalogo final que lee la app | **El robot** (no editar) |
| `plugins/index.json` | Indice de carpetas | **El robot** (no editar) |
| `scripts/build-catalog.mjs` | El robot | — |
