/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 5 - Estructura de Post y Players)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var API_URL = BASE_URL + '/api/rest';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function request(targetUrl) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(targetUrl);
        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'Referer': BASE_URL + '/',
                'Origin': BASE_URL
            },
            timeout: 7000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
                } catch(e) {
                    resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function runPhase5() {
    console.log('\n============================================================');
    console.log('>>> 1. INSPECCIONANDO DETALLES DE PELÍCULA Y SU PLAYER');
    console.log('============================================================');

    request(API_URL + '/search?post_type=movies&query=matrix')
        .then(function(res) {
            var posts = (res.data && res.data.data && res.data.data.posts) || [];
            console.log('Películas encontradas:', posts.length);
            if (!posts.length) return;

            var p = posts[0];
            console.log('Campos del Post #1:');
            console.log('  - _id:', p._id);
            console.log('  - title:', p.title);
            console.log('  - slug / post_name:', p.slug || p.post_name);

            console.log('\n>>> 2. PROBANDO /api/rest/player?post_id=' + p._id);
            return request(API_URL + '/player?post_id=' + p._id)
                .then(function(playerRes) {
                    console.log('Status Player:', playerRes.status);
                    console.log('Data Player:', JSON.stringify(playerRes.data, null, 2).substring(0, 500));
                });
        })
        .then(function() {
            console.log('\n============================================================');
            console.log('>>> 3. PROBANDO BÚSQUEDA DE SERIES Y EPISODIOS');
            console.log('============================================================');

            return request(API_URL + '/search?post_type=series&query=loki')
                .then(function(res) {
                    var series = (res.data && res.data.data && res.data.data.posts) || [];
                    console.log('Series encontradas:', series.length);
                    if (!series.length) return;

                    var s = series[0];
                    console.log('Serie #1:');
                    console.log('  - _id:', s._id);
                    console.log('  - title:', s.title);
                    console.log('  - slug / post_name:', s.slug || s.post_name);

                    // Consultar el single de la serie para ver cómo estructura episodios
                    var singleUrl = API_URL + '/single?post_name=' + encodeURIComponent(s.slug || s.post_name) + '&post_type=series';
                    return request(singleUrl).then(function(sRes) {
                        console.log('Single Serie Status:', sRes.status);
                        if (sRes.data && sRes.data.data) {
                            var d = sRes.data.data;
                            var seasons = d.seasons || d.episodes || [];
                            console.log('¿Tiene temporadas/episodios en el single?:', Array.isArray(seasons) ? seasons.length : typeof seasons);
                        }
                    });
                });
        })
        .catch(function(err) {
            console.log('Error:', err.message);
        });
}

runPhase5();
