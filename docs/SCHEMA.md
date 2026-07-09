# Esquema de plugin remoto

Campos principales:

- `id`: identificador interno estable.
- `slug`: carpeta dentro de `plugins/`.
- `name`, `summary`, `description`: textos visibles en la tienda.
- `images.logo`, `images.banner`: archivos junto al `plugin.json`.
- `repository`: repo real del plugin.
- `release.mode`: `github-latest-release`.
- `release.assetPattern`: nombre esperado del zip dentro del release.
- `type`: tipo de instalacion que ClipDock ya entiende, por ejemplo `adobe-cep` o `after-effects-script`.
- `installMode`: modo concreto, por ejemplo `download-adobe-cep` o `download-ae-script`.
- `installDirName`: carpeta interna en Documentos/ClipDock/Complementos.

Los creadores externos no necesitan agregar archivos especiales al repo si publican releases ordenados con el nombre esperado.
