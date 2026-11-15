/**
 * Test Runner Avanzado & Auditor Integral para Nuvio Media Hub
 * Compatible con HTTP Streams (HLS/MP4), P2P Magnets (Nuvio Engine), Telemetría y Auditoría Hermes
 *
 * Uso:
 *   node test.js <tmdbId> <movie|tv> [season] [episode] [provider|all]
 *   node test.js <tmdbId> movie [provider]
 */

const fs = require('fs');
const path = require('path');

const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m"
};

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log(`${C.yellow}Uso:${C.reset} node test.js <tmdbId> <movie|tv> [season] [episode] [provider|all]`);
    process.exit(1);
}

const tmdbId = args[0];
const mediaType = (args[1] || 'movie').toLowerCase();
const isTv = mediaType === 'tv' || mediaType === 'series';

let season = null;
let episode = null;
let providerInput = 'cinecalidad';

if (isTv) {
    season = args[2] ? parseInt(args[2], 10) : 1;
    episode = args[3] ? parseInt(args[3], 10) : 1;
    providerInput = args[4] || 'cinecalidad';
} else {
    if (args[2] && isNaN(parseInt(args[2], 10)) && args[2] !== 'null') {
        providerInput = args[2];
    } else if (args[4]) {
        providerInput = args[4];
    } else {
        providerInput = args[2] && args[2] !== 'null' && isNaN(parseInt(args[2], 10)) ? args[2] : 'cinecalidad';
    }
}

let providersToTest = [];
const providersDir = path.join(__dirname, 'providers');

if (providerInput.toLowerCase() === 'all') {
    const files = fs.readdirSync(providersDir).filter(f => f.endsWith('.js') && !f.startsWith('inspect_') && !f.startsWith('test_'));
    providersToTest = files.map(f => f.replace('.js', ''));
} else {
    providersToTest = [providerInput.toLowerCase()];
}

function getHostSafe(urlStr) {
    try {
        return new URL(urlStr).hostname;
    } catch (_) {
        return urlStr;
    }
}

function shortenUrl(urlStr, maxLen = 88) {
    if (!urlStr || urlStr.length <= maxLen) return urlStr;
    return urlStr.slice(0, maxLen - 3) + '...';
}

/**
 * Auditoría estática rápida de compatibilidad con Hermes Engine (7 Reglas).
 */
function auditHermesCompatibility(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const noComments = raw
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1 ');

    const hasBackticks = noComments.includes('`');

    const stripped = noComments
        .replace(/'(?:\\.|[^'\\\r\n])*'/g, "''")
        .replace(/"(?:\\.|[^"\\\r\n])*"/g, '""')
        .replace(/([=(:,!&|?;\s])\/(?:\\.|[^/\\\r\n])+\/[gimsuy]*/g, '$1 ');

    const issues = [];
    if (/\b(?:async|await|yield)\b/.test(stripped) || /function\s*\*/.test(stripped)) {
        issues.push('Usa async/await o generadores');
    }
    if (/\brequire\s*\(/.test(stripped) || /\bBuffer\b/.test(stripped)) {
        issues.push('Usa require() o Buffer');
    }
    if (/\b(?:const|let)\b/.test(stripped) || hasBackticks) {
        issues.push('Usa const/let o backticks');
    }
    if (/\.(?:includes|startsWith|endsWith|padStart|padEnd)\s*\(/.test(stripped)) {
        issues.push('Usa includes/startsWith/padStart (prohibido en Hermes)');
    }
    if (!/\bfetchWithTimeout\b/.test(stripped) || !/\bclearTimeout\b/.test(stripped)) {
        issues.push('Falta fetchWithTimeout o clearTimeout');
    }

    return {
        passed: issues.length === 0,
        issues
    };
}

/**
 * Verifica que el objeto devuelto cumpla estrictamente el contrato de Nuvio.
 */
function validateStreamContract(stream) {
    const missing = [];
    if (!stream || typeof stream !== 'object') return { valid: false, missing: ['objeto inválido'] };
    if (!stream.name || typeof stream.name !== 'string') missing.push('name');
    if (!stream.title || typeof stream.title !== 'string') missing.push('title');
    if (!stream.quality || typeof stream.quality !== 'string') missing.push('quality');
    if (!stream.url || typeof stream.url !== 'string' || !/^(https?:\/\/|magnet:)/i.test(stream.url)) missing.push('url');
    if (stream.url && stream.url.startsWith('http') && (!stream.headers || typeof stream.headers !== 'object')) {
        missing.push('headers');
    }
    return { valid: missing.length === 0, missing };
}

/**
 * Envuelve global.fetch para auditar cada petición HTTP del provider sin alterar su flujo.
 */
function createFetchTracer() {
    const originalFetch = global.fetch;
    const traces = [];
    const pendingReads = [];

    global.fetch = async function(input, init) {
        const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
        const method = (init && init.method) || (input && input.method) || 'GET';
        const start = Date.now();

        const entry = {
            url: urlStr,
            host: getHostSafe(urlStr),
            method: method.toUpperCase(),
            status: null,
            ok: false,
            elapsed: 0,
            finalUrl: urlStr,
            wafBlocked: false,
            cfMitigated: null,
            bodyLength: null,
            error: null,
            causeCode: null
        };
        traces.push(entry);

        try {
            const res = await originalFetch(input, init);
            entry.elapsed = Date.now() - start;
            entry.status = res.status;
            entry.ok = res.ok;
            entry.finalUrl = res.url || urlStr;
            entry.cfMitigated = res.headers.get('cf-mitigated') || null;

            const cType = (res.headers.get('content-type') || '').toLowerCase();
            if (entry.cfMitigated === 'challenge' || res.status === 403 || res.status === 503) {
                if ((res.headers.get('server') || '').toLowerCase().includes('cloudflare') || entry.cfMitigated) {
                    entry.wafBlocked = true;
                }
            }

            if ((cType.includes('json') || cType.includes('html') || cType.includes('text')) && !urlStr.toLowerCase().includes('.m3u8')) {
                try {
                    const cloned = res.clone();
                    const readTask = cloned.text().then(txt => {
                        entry.bodyLength = txt.length;
                        if (txt.includes('cf-turnstile') || txt.includes('cf-browser-verification') || txt.includes('Just a moment...')) {
                            entry.wafBlocked = true;
                        }
                    }).catch(() => {});
                    pendingReads.push(readTask);
                } catch (_) {}
            }

            return res;
        } catch (err) {
            entry.elapsed = Date.now() - start;
            entry.error = err.name === 'AbortError' ? 'Timeout / AbortError' : (err.message || String(err));
            entry.causeCode = (err.cause && err.cause.code) || err.code || null;
            throw err;
        }
    };

    return {
        traces,
        async restore() {
            global.fetch = originalFetch;
            if (pendingReads.length > 0) {
                await Promise.race([
                    Promise.allSettled(pendingReads),
                    new Promise(r => setTimeout(r, 150))
                ]);
            }
        }
    };
}

/**
 * Resume la salud de red incluso cuando el scraper tuvo éxito (avisa de fallos parciales).
 */
function printNetworkHealthSummary(traces) {
    if (!traces || traces.length === 0) return;
    const okCount = traces.filter(t => t.ok).length;
    const failed = traces.filter(t => t.error || t.wafBlocked || (t.status && t.status >= 400));

    if (failed.length === 0) {
        console.log(`${C.dim}📡 Red: ${traces.length} peticiones · ${okCount} OK · 0 fallos${C.reset}\n`);
    } else {
        console.log(`${C.dim}📡 Red: ${traces.length} peticiones · ${okCount} OK · ${C.yellow}${failed.length} aviso(s)/fallo(s) secundarios:${C.reset}`);
        failed.slice(0, 3).forEach(t => {
            const detail = t.error ? `${t.error}${t.causeCode ? ' [' + t.causeCode + ']' : ''}` : `HTTP ${t.status}${t.wafBlocked ? ' (WAF)' : ''}`;
            console.log(`${C.dim}   ⚠ ${detail} -> ${shortenUrl(t.url, 72)}${C.reset}`);
        });
        console.log();
    }
}

/**
 * Analiza las trazas cuando el provider devuelve 0 streams o falla.
 */
function printFailureDiagnosis(pName, traces, fatalError) {
    console.log(`   ${C.yellow}${C.bright}🔎 Diagnóstico de fallo (${pName}):${C.reset}`);

    if (fatalError) {
        const cause = fatalError.cause && fatalError.cause.code ? ` [${fatalError.cause.code}]` : '';
        console.log(`   ${C.red}• Excepción fatal:${C.reset} ${fatalError.message}${cause}`);
    }

    if (!traces || traces.length === 0) {
        console.log(`   ${C.dim}• No se realizaron peticiones HTTP (posible filtro previo de idioma/género o error antes de fetch).${C.reset}\n`);
        return;
    }

    const tmdbTrace = traces.find(t => t.host.includes('themoviedb.org'));
    const netErrors = traces.filter(t => t.error);
    const wafErrors = traces.filter(t => t.wafBlocked || t.status === 403 || t.status === 429);
    const serverErrors = traces.filter(t => t.status && t.status >= 500);
    const notFoundErrors = traces.filter(t => t.status === 404);
    const okTraces = traces.filter(t => t.ok && !t.host.includes('themoviedb.org'));

    if (tmdbTrace && (!tmdbTrace.ok || tmdbTrace.error)) {
        const tCause = tmdbTrace.causeCode ? ` [${tmdbTrace.causeCode}]` : '';
        console.log(`   ${C.red}• Fallo en TMDB API:${C.reset} ${tmdbTrace.error || 'HTTP ' + tmdbTrace.status}${tCause}`);
    }

    if (netErrors.length > 0) {
        console.log(`   ${C.red}• Errores de red / DNS / Timeout (${netErrors.length}):${C.reset}`);
        netErrors.slice(0, 5).forEach(t => {
            const codeTag = t.causeCode ? ` [${t.causeCode}]` : '';
            console.log(`     - ${t.error}${codeTag} (${t.elapsed}ms) -> ${shortenUrl(t.url)}`);
        });
    }

    if (wafErrors.length > 0) {
        console.log(`   ${C.red}• Bloqueo WAF / Cloudflare / 403 (${wafErrors.length}):${C.reset}`);
        wafErrors.slice(0, 4).forEach(t => {
            console.log(`     - HTTP ${t.status || 'WAF'} en ${t.host} -> ${shortenUrl(t.url)}`);
        });
    }

    if (serverErrors.length > 0) {
        console.log(`   ${C.red}• Error del servidor remoto 5xx (${serverErrors.length}):${C.reset}`);
        serverErrors.slice(0, 4).forEach(t => {
            console.log(`     - HTTP ${t.status} en ${t.host} -> ${shortenUrl(t.url)}`);
        });
    }

    if (notFoundErrors.length > 0) {
        console.log(`   ${C.yellow}• Rutas / slugs no encontrados - 404 (${notFoundErrors.length}):${C.reset}`);
        notFoundErrors.slice(0, 5).forEach(t => {
            console.log(`     - HTTP 404 -> ${shortenUrl(t.url)}`);
        });
    }

    if (netErrors.length === 0 && wafErrors.length === 0 && serverErrors.length === 0) {
        if (okTraces.length === 0 && notFoundErrors.length === 0) {
            console.log(`   ${C.yellow}• Sin llamadas externas tras TMDB:${C.reset} el título fue descartado por filtro interno (ej. género/idioma no coincide o sin candidatos).`);
        } else if (okTraces.length > 0) {
            console.log(`   ${C.yellow}• Respuestas 200 OK sin streams extraídos (${okTraces.length}):${C.reset} revisar score (>=35), selectores HTML o locker sin enlaces.`);
            okTraces.slice(0, 5).forEach(t => {
                const sizeInfo = t.bodyLength !== null ? ` · ${t.bodyLength} bytes` : '';
                console.log(`     - [${t.method} ${t.status} · ${t.elapsed}ms${sizeInfo}] ${shortenUrl(t.finalUrl)}`);
            });
        }
    }

    console.log();
}

function classifyResolution(w, h) {
    if (w >= 3840 || h >= 2160) return '4K';
    if (w >= 1920 || h >= 1080) return '1080p';
    if (w >= 1280 || h >= 720) return '720p';
    if (w >= 854 || h >= 480) return '480p';
    return '360p';
}

async function probeStreamUrl(stream) {
    // 1. VALIDACIÓN ESPECIAL PARA ENLACES MAGNET (P2P / TORRENT / NUVIO ENGINE)
    if (stream.url && stream.url.startsWith('magnet:')) {
        const hashMatch = stream.url.match(/urn:btih:([a-zA-Z0-9]+)/i);
        const trMatches = stream.url.match(/tr=/gi) || [];
        const hash = hashMatch ? hashMatch[1].toLowerCase() : '';
        const validHash = /^[a-f0-9]{40}$/i.test(hash) || /^[a-z2-7]{32}$/i.test(hash);
        const trackers = trMatches.length;

        if (!validHash) {
            return {
                isValid: false,
                isP2P: true,
                details: `P2P inválido: InfoHash ausente o malformado (${hash || 'vacío'})`
            };
        }

        return {
            isValid: true,
            isP2P: true,
            details: `P2P Nuvio Engine · Hash válido (${hash.slice(0, 10)}...) · ${trackers} Tracker(s)`
        };
    }

    // 2. VALIDACIÓN PROFUNDA PARA ENLACES HTTP/HTTPS (HLS / MP4)
    const startTime = Date.now();
    const headers = stream.headers || { "User-Agent": "Mozilla/5.0" };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const isM3u8 = stream.url.toLowerCase().includes('.m3u8');
        const reqHeaders = { ...headers };
        if (!isM3u8) {
            reqHeaders["Range"] = "bytes=0-1024";
        }

        const res = await fetch(stream.url, {
            method: 'GET',
            headers: reqHeaders,
            signal: controller.signal,
            redirect: 'follow'
        });

        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        const cType = (res.headers.get('content-type') || 'unknown').toLowerCase();

        let isValid = res.ok || res.status === 206 || res.status === 200;
        let details = `HTTP ${res.status} · ${latency}ms · ${cType}`;
        let extraWarning = null;

        if (res.status === 403) {
            details += ` ${C.red}(Bloqueo 403: Referer/User-Agent rechazado)${C.reset}`;
            isValid = false;
        } else if (res.status === 404) {
            details += ` ${C.red}(404: Enlace caído)${C.reset}`;
            isValid = false;
        } else if (res.status === 410) {
            details += ` ${C.red}(410: Enlace expirado)${C.reset}`;
            isValid = false;
        } else if (res.status >= 500) {
            details += ` ${C.red}(Error del servidor CDN)${C.reset}`;
            isValid = false;
        } else if (cType.includes('text/html')) {
            details += ` ${C.red}(Falso 200: la CDN devolvió HTML en lugar de video)${C.reset}`;
            isValid = false;
        } else if (isValid && (isM3u8 || cType.includes('mpegurl'))) {
            // Verificar contenido real del manifiesto HLS
            const body = await res.text();
            if (!body || !body.includes('#EXTM3U')) {
                details += ` ${C.red}(Manifiesto inválido: falta #EXTM3U)${C.reset}`;
                isValid = false;
            } else {
                const variants = (body.match(/#EXT-X-STREAM-INF/g) || []).length;
                const segments = (body.match(/#EXTINF/g) || []).length;
                const resMatches = [...body.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)];

                if (resMatches.length > 0) {
                    let maxW = 0, maxH = 0;
                    resMatches.forEach(m => {
                        const w = parseInt(m[1], 10);
                        const h = parseInt(m[2], 10);
                        if (w > maxW || h > maxH) { maxW = w; maxH = h; }
                    });
                    const realQ = classifyResolution(maxW, maxH);
                    details += ` · #EXTM3U (${variants} var · Máx real ${maxW}x${maxH} = ${realQ})`;

                    if (stream.quality && stream.quality !== realQ) {
                        extraWarning = `Calidad reportada '${stream.quality}' difiere del M3U8 real '${realQ}'`;
                    }
                } else {
                    details += ` · #EXTM3U válido (${variants > 0 ? variants + ' var' : segments + ' segs'})`;
                }
            }
        } else if (isValid) {
            // Extraer tamaño total en MP4/directo si viene en Content-Range o Content-Length
            const cRange = res.headers.get('content-range') || '';
            const totalMatch = cRange.match(/\/(\d+)$/);
            const totalBytes = totalMatch ? parseInt(totalMatch[1], 10) : parseInt(res.headers.get('content-length') || '0', 10);
            if (totalBytes > 1048576) {
                const mb = (totalBytes / (1024 * 1024)).toFixed(1);
                details += ` · ${mb} MB`;
            }
        }

        return { isValid, isP2P: false, details, extraWarning };
    } catch (e) {
        const causeCode = e.cause && e.cause.code ? ` [${e.cause.code}]` : '';
        const reason = e.name === 'AbortError' ? 'Timeout (6s)' : `${e.message}${causeCode}`;
        return {
            isValid: false,
            isP2P: false,
            details: `Error: ${reason}`
        };
    }
}

async function runTests() {
    console.log(`\n${C.cyan}${C.bright}================================================================${C.reset}`);
    console.log(`${C.cyan}${C.bright}🧪 NUVIO MEDIA HUB — RUNNER & AUDITOR DE PROVEEDORES${C.reset}`);
    console.log(`${C.cyan}${C.bright}================================================================${C.reset}`);
    console.log(`🎯 TMDB ID:     ${C.bright}${tmdbId}${C.reset}`);
    console.log(`🎬 Tipo:        ${C.bright}${mediaType.toUpperCase()}${isTv ? ` (Temporada ${season} · Episodio ${episode})` : ''}${C.reset}`);
    console.log(`📦 Proveedores: ${C.bright}${providersToTest.join(', ')}${C.reset}\n`);

    for (const pName of providersToTest) {
        const filePath = path.join(providersDir, `${pName}.js`);
        if (!fs.existsSync(filePath)) {
            console.log(`${C.red}❌ Proveedor '${pName}' no encontrado en /providers/${pName}.js${C.reset}\n`);
            continue;
        }

        console.log(`----------------------------------------------------------------`);
        console.log(`▶ Probando: ${C.magenta}${C.bright}${pName.toUpperCase()}${C.reset}`);
        console.log(`----------------------------------------------------------------`);

        const hermesAudit = auditHermesCompatibility(filePath);
        if (hermesAudit.passed) {
            console.log(`🛡️  Hermes Audit: ${C.green}✓ ES5 estricto · Promesas puras · Zero-Deps · Timeout seguro${C.reset}`);
        } else {
            console.log(`🛡️  Hermes Audit: ${C.yellow}⚠ Advertencias: ${hermesAudit.issues.join(' | ')}${C.reset}`);
        }

        let providerModule = null;
        try {
            providerModule = require(filePath);
        } catch (loadErr) {
            console.log(`${C.red}❌ Error al cargar módulo '${pName}': ${loadErr.message}${C.reset}`);
            console.log(`${C.dim}   (Requiere migración a Zero-Dependencies / Hermes)${C.reset}\n`);
            continue;
        }

        if (typeof providerModule.getStreams !== 'function') {
            console.log(`${C.red}❌ El archivo no exporta la función getStreams()${C.reset}\n`);
            continue;
        }

        const tracer = createFetchTracer();
        const pStartTime = Date.now();
        let streams = [];
        let fatalErr = null;

        try {
            streams = await providerModule.getStreams(tmdbId, mediaType, season, episode);
        } catch (err) {
            fatalErr = err;
        } finally {
            await tracer.restore();
        }

        const pDuration = Date.now() - pStartTime;

        if (fatalErr) {
            console.log(`${C.red}💥 Error en ejecución de ${pName} (${pDuration}ms): ${fatalErr.message}${C.reset}`);
            printFailureDiagnosis(pName, tracer.traces, fatalErr);
            continue;
        }

        if (!Array.isArray(streams) || streams.length === 0) {
            console.log(`${C.red}❌ 0 streams encontrados (${pDuration}ms)${C.reset}`);
            printFailureDiagnosis(pName, tracer.traces, null);
            continue;
        }

        console.log(`⚡ Scraper finalizado en ${C.bright}${pDuration}ms${C.reset}. Validando ${streams.length} stream(s) en vivo...`);
        printNetworkHealthSummary(tracer.traces);

        for (let i = 0; i < streams.length; i++) {
            const s = streams[i];
            const contract = validateStreamContract(s);
            const probe = await probeStreamUrl(s);

            const icon = (probe.isValid && contract.valid) ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
            const qualBadge = `${C.bright}[${s.quality || 'Auto'}]${C.reset}`;

            console.log(`  [${i + 1}] ${icon} ${qualBadge} ${C.bright}${s.title || s.name}${C.reset}`);
            console.log(`      ${C.dim}URL:${C.reset}      ${s.url}`);
            if (s.headers && Object.keys(s.headers).length > 0) {
                console.log(`      ${C.dim}Headers:${C.reset}  ${JSON.stringify(s.headers)}`);
            }
            console.log(`      ${C.dim}Contrato:${C.reset} ${contract.valid ? C.green + '✓ Completo (name, title, quality, url, headers)' : C.red + '✗ Faltan campos: ' + contract.missing.join(', ')}${C.reset}`);
            console.log(`      ${C.dim}Estado:${C.reset}   ${probe.isValid ? C.green : C.red}${probe.details}${C.reset}`);
            if (probe.extraWarning) {
                console.log(`      ${C.yellow}⚠ Aviso:${C.reset}  ${C.yellow}${probe.extraWarning}${C.reset}`);
            }
            console.log();
        }
    }

    console.log(`${C.cyan}======================= FIN DE PRUEBAS =======================${C.reset}\n`);
}

runTests();
