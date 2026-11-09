/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var http = require('http');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var API_URL = BASE_URL + '/api/rest';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(targetUrl, options) {
    options = options || {};
    var timeout = options.timeout || 6000;
    var startTime = Date.now();

    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var lib = parsed.protocol === 'https:' ? https : http;

        var reqHeaders = Object.assign({
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Referer': BASE_URL + '/',
            'Origin': BASE_URL
        }, options.headers || {});

        var req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.path,
            method: options.method || 'GET',
            headers: reqHeaders,
            timeout: timeout
        }, function(res) {
            var chunks = [];
            res.on('data', function(chunk) { chunks.push(chunk); });
            res.on('end', function() {
                var elapsed = Date.now() - startTime;
                var body = Buffer.concat(chunks).toString('utf8');
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    elapsed: elapsed,
                    body: body
                });
            });
        });

        req.on('timeout', function() {
            req.destroy();
            var err = new Error('ETIMEDOUT tras ' + timeout + 'ms');
            err.code = 'ETIMEDOUT';
            reject(err);
        });

        req.on('error', function(err) {
            reject(err);
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

function printDivider(label) {
    console.log('\n============================================================');
    console.log('>>> ' + label);
    console.log('============================================================');
}

function runAudit() {
    printDivider('1. AUDITORÍA DE CONECTIVIDAD BASE: ' + BASE_URL);

    return request(BASE_URL)
        .then(function(res) {
            console.log('[BASE STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');
            console.log('[SERVER]: ' + (res.headers['server'] || 'N/A'));
            if (res.headers['cf-ray']) console.log('[CLOUDFLARE RAY]: ' + res.headers['cf-ray']);

            printDivider('2. AUDITORÍA ENDPOINT: /api/rest/search?q=matrix');
            var searchUrl = API_URL + '/search?q=matrix';
            return request(searchUrl);
        })
        .then(function(res) {
            console.log('[SEARCH STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');
            if (res.status !== 200) {
                console.log('[SEARCH RESPONSE BODY PREVIEW]: ' + res.body.substring(0, 300));
                throw new Error('API Search falló con status HTTP ' + res.status);
            }

            var json;
            try {
                json = JSON.parse(res.body);
            } catch (e) {
                throw new Error('La respuesta de /search no es un JSON válido');
            }

            var items = (json && json.data && Array.isArray(json.data)) ? json.data : [];
            console.log('[SEARCH ÉXITO]: ' + items.length + ' resultados encontrados');

            if (items.length === 0) {
                console.log('[ALERTA]: 0 resultados en la búsqueda.');
                return null;
            }

            var firstItem = items[0];
            var slug = firstItem.slug || firstItem.post_name;
            console.log('  - Muestra #1: ' + (firstItem.title || firstItem.name || 'Sin título'));
            console.log('  - Slug: ' + slug);
            console.log('  - Tipo / ID: ' + (firstItem.type || 'N/A') + ' | ' + (firstItem._id || 'N/A'));

            printDivider('3. AUDITORÍA ENDPOINT: /api/rest/single?post_name=' + slug + '&post_type=movies');
            var singleUrl = API_URL + '/single?post_name=' + encodeURIComponent(slug) + '&post_type=movies';
            return request(singleUrl);
        })
        .then(function(res) {
            if (!res) return null;

            console.log('[SINGLE STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');
            var json = JSON.parse(res.body);
            var postId = (json && json.data && json.data._id) ? json.data._id : null;
            console.log('[POST ID EXTRAÍDO]: ' + postId);

            if (!postId) {
                throw new Error('No se pudo extraer _id del endpoint single');
            }

            printDivider('4. AUDITORÍA ENDPOINT: /api/rest/player?post_id=' + postId);
            var playerUrl = API_URL + '/player?post_id=' + postId;
            return request(playerUrl);
        })
        .then(function(res) {
            if (!res) return null;

            console.log('[PLAYER STATUS]: ' + res.status + ' (' + res.elapsed + ' ms)');
            var json = JSON.parse(res.body);
            var players = (json && json.data && Array.isArray(json.data)) ? json.data : [];
            console.log('[PLAYERS ENCONTRADOS]: ' + players.length);

            players.forEach(function(p, i) {
                console.log('  [' + i + '] Server: ' + (p.server || 'N/A') + ' | Lang: ' + (p.lang || 'N/A') + ' | URL: ' + (p.url || p.link));
            });

            printDivider('✓ AUDITORÍA COMPLETADA CON ÉXITO');
        })
        .catch(function(err) {
            printDivider('❌ ERROR DE AUDITORÍA');
            console.log('Mensaje: ' + err.message);
            if (err.code) console.log('Código de error: ' + err.code);
            if (err.cause) {
                console.log('Causa (err.cause):', err.cause);
            }
        });
}

runAudit();
