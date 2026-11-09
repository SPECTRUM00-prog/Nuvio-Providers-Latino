/**
 * Script de Inspección y Diagnóstico Profundo: PelisPedia
 * Ejecutar localmente con: node providers/inspect_pelispedia.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://pelispedia.mov';
var EMBED_BASE = 'https://embed69.org';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function request(targetUrl, headers, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': BASE_URL + '/'
        }, headers || {});

        var startTime = Date.now();
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: reqHeaders,
            timeout: timeoutMs || 6000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    elapsed: Date.now() - startTime,
                    body: Buffer.concat(chunks).toString('utf8')
                });
            });
        });

        req.on('timeout', function() {
            req.destroy();
            reject(new Error('TIMEOUT'));
        });
        req.on('error', reject);
        req.end();
    });
}

function printSection(title) {
    console.log('\n============================================================');
    console.log('>>> ' + title);
    console.log('============================================================');
}

function runAudit() {
    printSection('1. CONECTIVIDAD BASE: ' + BASE_URL);

    return request(BASE_URL)
        .then(function(res) {
            console.log('[STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');
            console.log('[SERVER]: ' + (res.headers.server || 'N/A'));

            printSection('2. BÚSQUEDA WEB: /search?s=matrix');
            return request(BASE_URL + '/search?s=matrix');
        })
        .then(function(res) {
            console.log('[STATUS BÚSQUEDA]: ' + res.status + ' (' + res.elapsed + ' ms)');
            
            // Extraer enlaces a películas
            var linkRegex = /<a\s+[^>]*href=["']((?:https?:\/\/[^"']*)?\/(?:serie|pelicula|anime)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var results = [];
            var match;

            while ((match = linkRegex.exec(res.body)) !== null) {
                var rawLink = match[1];
                var fullLink = rawLink.indexOf('http') === 0 ? rawLink : (BASE_URL + rawLink);
                if (results.indexOf(fullLink) === -1) results.push(fullLink);
            }

            console.log('[ENLACES ENCONTRADOS]: ' + results.length);
            if (results.length === 0) {
                console.log('[PREVIEW HTML BÚSQUEDA]:\n' + res.body.substring(0, 300));
                throw new Error('No se encontraron enlaces en la búsqueda');
            }

            var sampleUrl = results[0];
            console.log('  -> Película muestra: ' + sampleUrl);

            printSection('3. INSPECCIÓN DE FICHA Y EXTRACCIÓN DE IFRAMES');
            return request(sampleUrl);
        })
        .then(function(res) {
            console.log('[STATUS FICHA]: ' + res.status + ' (' + res.elapsed + ' ms)');

            var iframeRegex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
            var playerIds = [];
            var m;

            while ((m = iframeRegex.exec(res.body)) !== null) {
                var src = m[1];
                var vidMatch = src.match(/\/vidurl\/([^\/]+)/i);
                if (vidMatch && playerIds.indexOf(vidMatch[1]) === -1) {
                    playerIds.push(vidMatch[1]);
                }
            }

            console.log('[PLAYER IDS EXTRAÍDOS]:', playerIds);
            if (playerIds.length === 0) {
                throw new Error('No se detectaron IDs en /vidurl/');
            }

            var pId = playerIds[0];
            var embedUrl = EMBED_BASE + '/f/' + pId;
            printSection('4. AUDITORÍA DE EMBED69: ' + embedUrl);

            return request(embedUrl, { 'Referer': EMBED_BASE + '/' });
        })
        .then(function(res) {
            console.log('[STATUS EMBED69]: ' + res.status + ' (' + res.elapsed + ' ms)');

            var hasChallenge = res.body.indexOf('POW_CHALLENGE') !== -1;
            var hasDifficulty = res.body.indexOf('POW_DIFFICULTY') !== -1;
            var hasDataLink = res.body.indexOf('dataLink') !== -1;

            console.log('[¿Contiene POW_CHALLENGE?]: ' + hasChallenge);
            console.log('[¿Contiene POW_DIFFICULTY?]: ' + hasDifficulty);
            console.log('[¿Contiene dataLink cifrado?]: ' + hasDataLink);

            if (!hasChallenge || !hasDataLink) {
                console.log('[PREVIEW RESPUESTA EMBED69]:\n' + res.body.substring(0, 400));
                throw new Error('La estructura de Embed69 no coincide con el reto PoW esperado');
            }

            printSection('✓ AUDITORÍA PELISPEDIA EXITOSA');
            console.log('PelisPedia y Embed69 están sincronizados y listos para resolver streams.');
        })
        .catch(function(err) {
            printSection('❌ ERROR EN DIAGNÓSTICO');
            console.log('Mensaje:', err.message);
            if (err.cause) console.log('Causa:', err.cause);
        });
}

runAudit();
