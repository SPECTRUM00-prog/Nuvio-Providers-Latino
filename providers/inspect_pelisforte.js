/**
 * Script de Inspección y Diagnóstico Profundo: PelisForte (Fase 7 - Reverse Byse API y Series)
 * Ejecutar localmente con: node providers/inspect_pelisforte.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://www2.pelisforte.se';
var BYSE_BUNDLE_URL = 'https://byseraguci.com/assets/index-DocunfmE.js';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(targetUrl, headers) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Referer': BASE_URL + '/'
        }, headers || {});

        var startTime = Date.now();
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: reqHeaders,
            timeout: 8000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                    elapsed: Date.now() - startTime
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runAuditPhase7() {
    console.log('\n============================================================');
    console.log('>>> 1. INSPECCIONANDO RESULTADOS DE BÚSQUEDA (?s=paranorman)');
    console.log('============================================================');

    return request(BASE_URL + '/?s=paranorman')
        .then(function(res) {
            console.log('[STATUS BÚSQUEDA]: ' + res.status + ' (' + res.elapsed + ' ms)');
            
            // Buscar tarjetas de películas y series
            var linkRegex = /<a[^>]+href=["'](https?:\/\/[^"']*\/(?:pelicula|serie)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var matches = [];
            var m;
            while ((m = linkRegex.exec(res.body)) !== null) {
                var url = m[1];
                var inner = m[2].replace(/\s+/g, ' ');
                var titleMatch = inner.match(/class=["'][^"']*title[^"']*["'][^>]*>([^<]+)/i) ||
                                 inner.match(/alt=["']([^"']+)["']/i);
                var title = titleMatch ? titleMatch[1].trim() : 'Sin título';
                
                if (matches.filter(function(x) { return x.url === url; }).length === 0) {
                    matches.push({ url: url, title: title });
                }
            }

            console.log('[TARJETAS ENCONTRADAS]: ' + matches.length);
            matches.slice(0, 5).forEach(function(item) {
                console.log('  -> ' + item.title + ' | URL: ' + item.url);
            });

            console.log('\n============================================================');
            console.log('>>> 2. PROBANDO BÚSQUEDA DE SERIES (?s=dexter)');
            console.log('============================================================');

            return request(BASE_URL + '/?s=dexter');
        })
        .then(function(sRes) {
            console.log('[STATUS BÚSQUEDA SERIES]: ' + sRes.status);
            var seriesLinks = sRes.body.match(/https?:\/\/[^"']*\/(?:serie|series)\/[^"']+/gi) || [];
            var uniqueSeries = [];
            seriesLinks.forEach(function(u) {
                if (uniqueSeries.indexOf(u) === -1) uniqueSeries.push(u);
            });

            console.log('[SERIES DETECTADAS]: ' + uniqueSeries.length);
            uniqueSeries.slice(0, 3).forEach(function(u) {
                console.log('  -> Serie: ' + u);
            });

            console.log('\n============================================================');
            console.log('>>> 3. INSPECCIONANDO BUNDLE JS DE BYSE (Búsqueda de API)');
            console.log('============================================================');

            return request(BYSE_BUNDLE_URL, { 'Referer': 'https://byseraguci.com/' });
        })
        .then(function(byseRes) {
            console.log('[BYSE BUNDLE STATUS]: ' + byseRes.status + ' (' + byseRes.body.length + ' bytes)');
            var code = byseRes.body;

            // Buscar llamadas fetch / axios / rutas de api
            var apiMatches = code.match(/["']\/api\/[^"']+["']/g) || [];
            console.log('[ENDPOINTS /api/ EN BYSE]:', apiMatches);

            var postOrGet = code.match(/(?:fetch|axios(?:\.get|\.post)?)\s*\(\s*["']([^"']+)["']/g) || [];
            console.log('[LLAMADAS HTTP EN BYSE]:', postOrGet.slice(0, 6));

            // Buscar construcción de URLs m3u8 o mp4
            var streamPatterns = code.match(/["']([^"']*\.(?:m3u8|mp4)[^"']*)["']/g) || [];
            console.log('[PATRONES DE STREAM EN BYSE]:', streamPatterns.slice(0, 5));

            var fileCodeIndex = code.indexOf('/e/');
            if (fileCodeIndex !== -1) {
                console.log('\n[CONTEXTO /e/ EN BYSE]:');
                console.log(code.substring(Math.max(0, fileCodeIndex - 60), Math.min(code.length, fileCodeIndex + 200)).replace(/\s+/g, ' '));
            }
        })
        .catch(function(err) {
            console.log('Error:', err.message);
        });
}

runAuditPhase7();
