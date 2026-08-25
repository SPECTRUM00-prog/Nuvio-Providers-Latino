/**
 * Test Runner Avanzado & Validador de Streams para Nuvio Media Hub
 * 
 * Uso:
 *   node test.js <tmdbId> <movie|tv> [season] [episode] [provider|all]
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
const mediaType = args[1] || 'movie';
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
        providerInput = args[2] && args[2] !== 'null' ? args[2] : 'cinecalidad';
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

async function probeStreamUrl(stream) {
    const startTime = Date.now();
    const headers = stream.headers || { "User-Agent": "Mozilla/5.0" };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(stream.url, {
            method: 'GET',
            headers: {
                ...headers,
                "Range": "bytes=0-1024"
            },
            signal: controller.signal,
            redirect: 'follow'
        });

        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        const cType = res.headers.get('content-type') || 'unknown';

        let isValid = res.ok || res.status === 206 || res.status === 200;
        let details = `HTTP ${res.status} · ${latency}ms · ${cType}`;

        if (res.status === 403) {
            details += ` ${C.red}(Bloqueo 403: Referer requerido)${C.reset}`;
            isValid = false;
        } else if (res.status === 404) {
            details += ` ${C.red}(404: Enlace caído)${C.reset}`;
            isValid = false;
        }

        return { isValid, details };
    } catch (e) {
        return {
            isValid: false,
            details: `Error: ${e.name === 'AbortError' ? 'Timeout (6s)' : e.message}`
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

        const pStartTime = Date.now();
        try {
            const streams = await providerModule.getStreams(tmdbId, mediaType, season, episode);
            const pDuration = Date.now() - pStartTime;

            if (!Array.isArray(streams) || streams.length === 0) {
                console.log(`${C.red}❌ 0 streams encontrados (${pDuration}ms)${C.reset}\n`);
                continue;
            }

            console.log(`⚡ Scraper finalizado en ${C.bright}${pDuration}ms${C.reset}. Validando ${streams.length} stream(s) en vivo...\n`);

            for (let i = 0; i < streams.length; i++) {
                const s = streams[i];
                const probe = await probeStreamUrl(s);

                const icon = probe.isValid ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
                const qualBadge = `${C.bright}[${s.quality || 'Auto'}]${C.reset}`;

                console.log(`  [${i + 1}] ${icon} ${qualBadge} ${C.bright}${s.title || s.name}${C.reset}`);
                console.log(`      ${C.dim}URL:${C.reset}     ${s.url}`);
                if (s.headers && Object.keys(s.headers).length > 0) {
                    console.log(`      ${C.dim}Headers:${C.reset} ${JSON.stringify(s.headers)}`);
                }
                console.log(`      ${C.dim}Estado:${C.reset}  ${probe.isValid ? C.green : C.red}${probe.details}${C.reset}`);
                console.log();
            }

        } catch (err) {
            console.log(`${C.red}💥 Error en ejecución de ${pName}: ${err.message}${C.reset}\n`);
        }
    }

    console.log(`${C.cyan}======================= FIN DE PRUEBAS =======================${C.reset}\n`);
}

runTests();
