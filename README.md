# 🌌 Nuvio-Spectrum-Latino

> *"Si comprar no es poseer, el acceso libre y la preservación digital son una necesidad."*  
> Suite de plugins de alto rendimiento sin dependencias externas en **Español Latino, Castellano y Anime** para **Nuvio Media Hub** (Windows Desktop, Android TV y Amazon FireTV).

---

## 📖 Manifiesto

Este proyecto proporciona scrapers de alto rendimiento para **Nuvio Media Hub** con varias resolución de streams en paralelo y compatibilidad estricta con diferentes dispositivos.

---

## 📦 Proveedores Incluidos & Estado

| ID del Scraper | Nombre | Películas | Series | Anime | Idiomas | Estado |
|---|---|:---:|:---:|:---:|---|:---:|
| `cinecalidad` | **CineCalidad** | ✅ | ✅ | ❌ | Latino | 🟢 100% Operativo |
| `lamovie` | **LaMovie** | ✅ | ✅ | ❌ | Latino / Sub | 🟢 100% Operativo |
| `sololatino` | **SoloLatino / Embed69** | ✅ | ✅ | ❌ | Latino / Castellano | 🟢 100% Operativo |
| `hackstore` | **HackStore2** | ✅ | ✅ | ❌ | Latino | 🟢 100% Operativo |
| `pelisplus` | **PelisPlus (TioPlus)** | ✅ | ✅ | ❌ | Latino | 🟢 100% Operativo |
| `animeav1` | **AnimeAV1** | ✅ | ✅ | ✅ | Sub / Latino | 🟢 100% Operativo |
| `animejara` | **AnimeJara** | ✅ | ✅ | ✅ | Sub / Latino / Castellano | 🟢 100% Operativo |
| `jkanime` | **JKAnime (AniList Engine)** | ✅ | ✅ | ✅ | Sub Español | 🟢 100% Operativo |

---

## ⚡ Servidores & Resolvers Nativos

Todos los reproductores son decodificados bit a bit en **JavaScript Puro**, sin librerías externas:

- **Zilla HLS** (`player.zilla-networks.com`) $\rightarrow$ Extracción directa `.m3u8` Full HD 1080p.
- **Vimeos** (`vimeos.net`, `p2.vimeos.zip`) $\rightarrow$ Desempaquetador Dean Edwards Base 36/62.
- **GoodStream** (`goodstream.one`) $\rightarrow$ Inspección de playlist maestra y CDN `.urlset`.
- **StreamWish / Hgcloud / Hlswish** (`hlswish.com`, `hgcloud.to`, `flaswish.com`) $\rightarrow$ Extracción HLS 1080p.
- **VidHide / Filelions / Minochinos** (`vidhide.com`, `filelions.top`, `callistanise.com`) $\rightarrow$ Extracción HLS 1080p.
- **Filemoon / Byse** (`filemoon.sx`, `bysekoze.com`) $\rightarrow$ Extracción directa HLS 1080p.
- **MP4Upload** (`mp4upload.com`) $\rightarrow$ Detección dinámica FHD 1080p y enlaces `.mp4`.
- **Streamtape** (`streamtape.com`) $\rightarrow$ Extracción de tokens `robotlink` `.mp4`.
- **Nyuu VIP** (`streamhj.top`) $\rightarrow$ Enlaces HLS y MP4 directos.
- **SoloLatino AES/PoW** $\rightarrow$ Minado síncrono de Proof-of-Work SHA-256 (< 4ms) y descifrado AES-256-CBC puro.

---

## 🛠️ Reglas Técnicas & Compatibilidad Hermes (FireTV / Android TV)

Los plugins de este repositorio cumplen estrictamente las restricciones del motor **Hermes JS** de React Native:

1. **Zero Asynchronous Dynamic Evaluation:** Prohibido el uso de `async / await` o generadores en los scrapers. Todos los flujos usan **Cadenas de Promesas tradicionales (`.then()` / `.catch()`)**.
2. **Zero Dependencies:** Sin `require('axios')`, `require('cheerio')`, `require('crypto')` ni `Buffer`.
3. **Criptografía Pura:** Implementación de Base64 URL-safe, SHA-256 y AES-256 en arrays tipados nativos (`Uint8Array` / `DataView`).
4. **Filtro Anti-Falsos Positivos:** Validación estricta por umbral de puntuación (`score >= 35`) contra la metadata de TMDB para evitar películas ajenas cuando no hay resultados.
5. **Detección Dinámica de Calidad:** Inspección real de directivas `#EXT-X-STREAM-INF` y tags de CDN para garantizar resoluciones legítimas (1080p / 720p / 4K).

---

## 🧪 Pruebas, Ejemplos de Uso & URL del Manifest

El repositorio incluye un **Runner & Auditor de Streams** que valida conectividad en vivo, mide latencia en milisegundos y verifica la respuesta `HTTP 200/206` de cada CDN.

```bash

# Probar una película con un proveedor
node test.js <TMDB_ID> movie <proveedor>

# Probar una serie con temporada y episodio
node test.js <TMDB_ID> tv <temporada> <episodio> <proveedor>

# Probar TODOS los proveedores en paralelo simultáneamente
node test.js <TMDB_ID> <movie|tv> [temporada] [episodio] all

# Probar TODOS los proveedores en paralelo simultáneamente
node test.js 533535 movie all

```

🔗 URL del Manifest para Nuvio Media Hub:

Para instalar o actualizar este repositorio en Nuvio Media Hub, agrega la
siguiente URL en la sección de Plugins:

https://raw.githubusercontent.com/SPECTRUM00-prog/Nuvio-Providers-Latino/main/manifest.json

⚖️ Disclaimer

- **Ningún contenido es alojado ni almacenado por este repositorio.**
- Los proveedores (scrapers) únicamente indexan y obtienen enlaces de contenido disponible públicamente en sitios web de terceros.
- Los usuarios finales son los únicos responsables del uso del software y del cumplimiento de las leyes locales aplicables en su región.
- Para asuntos, reclamaciones o avisos relacionados con derechos de autor (DMCA), comuníquese directamente con los servidores y servicios web donde se encuentra alojado el contenido real.
