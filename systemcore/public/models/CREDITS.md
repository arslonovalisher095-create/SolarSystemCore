# Источники 3D-моделей

## public/models/*.glb, public/models/nh/*.stl
NASA 3D Resources — https://github.com/nasa/NASA-3D-Resources (без авторских прав, NASA media usage guidelines).
Voyager, Pioneer 10, Parker Solar Probe, Juno; New Horizons — STL-детали из раздела 3D Printing.

## public/models/sr/*.glb
Сжатые (meshopt + квантование) модели из проекта Space Radar — https://github.com/Sara-Managed-Projects/space-radar
(код MIT; полная атрибуция каждой модели — в их CREDITS.md). Использованы без изменений.

| Файл | Происхождение |
| --- | --- |
| europa-clipper.glb | собственная модель NASA/JPL (public domain) |
| iss.glb, hubble.glb, jwst.glb, tess.glb, goes.glb, tdrs.glb, terra.glb, landsat8.glb, lro.glb, mro.glb, maven.glb, cassini.glb, galileo.glb, dawn.glb, rosetta.glb, osiris-rex.glb, chandra.glb, sdo.glb, soho.glb | NASA 3D Resources (public domain) |
| lucy.glb, psyche.glb, juice.glb | построены Space Radar по опубликованным размерам (MIT) |
| starlink-v1.glb, oneweb.glb, gps-iii.glb, noaa21.glb, sentinel-2.glb, tiangong.glb, soyuz-ms.glb, progress-ms.glb, dragon-crew.glb, gaia.glb | построены Space Radar по опубликованным размерам (MIT) |
| falcon9-upper.glb, falcon9-stage2.glb, delta2-stage.glb, atlas5-centaur.glb, centaur-d.glb, h2a-stage2.glb, kosmos3m-stage2.glb | отработавшие ступени, построены Space Radar по опубликованным размерам (MIT) |
| asteroid-*.glb, comet-67p.glb, dwarf-ceres.glb | модели форм по данным миссий и радарных наблюдений (NASA/JPL, ESA; см. CREDITS.md Space Radar) |

Модели на сцене увеличены относительно реального размера, иначе их не видно рядом с планетами.
Для объектов без собственной модели (большинство обломков и аппаратов) строится условная форма — это помечено в интерфейсе.

SPHEREx: открытой 3D-модели нет, используется процедурная модель по опубликованной схеме аппарата.
