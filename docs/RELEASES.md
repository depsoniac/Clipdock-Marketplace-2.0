# Como publicar releases de plugins

Para que ClipDock detecte updates automaticos:

1. Mantener el `.zip` con el nombre indicado por `release.assetPattern`.
2. Subirlo como asset de GitHub Release.
3. Usar tags semver: `v1.0.0`, `v1.0.1`, `v1.1.0`.
4. Si el zip cambia, crear release nuevo. No hace falta editar la tienda.

ClipDock consulta el ultimo release de GitHub y usa el primer asset que coincide con `release.assetPattern`.
