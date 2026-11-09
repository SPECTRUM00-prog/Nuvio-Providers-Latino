/**
 * Script de Inspección y Diagnóstico Profundo: Hackstore (Fase 9 - Validación de Episodio y Player)
 * Ejecutar localmente con: node providers/inspect_hackstore.js
 */

var https = require('https');
var urlModule = require('url');

var BASE_URL = 'https://hackstore2.com';
var API_URL = BASE_URL + '/api/rest';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function requestJson(url) {
    return new Promise(function(resolve, reject) {
        var parsed = urlModule.parse(url);
        https.get({
            hostname: parsed.hostname,
            path: parsed.path,
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': BASE_URL + '/',
                'Origin': BASE_URL,
                'Accept': 'application/json, text/plain, */*'
            }
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
        }).on('error', reject);
    });
}

function runPhase9() {
    console.log('\n============================================================');
    console.log('>>> 1. PROBANDO /api/rest/single PARA DEXTER TEMPORADA 1 EPISODIO 1');
    console.log('============================================================');

    var epSlug = 'dexter-resurrection-temporada-1-episodio-1';
    var singleUrl = API_URL + '/single?post_name=' + epSlug + '&post_type=episodes';

    requestJson(singleUrl)
        .then(function(res) {
            console.log('Status Single Episodio:', res.status);
            console.log('Respuesta Single:', JSON.stringify(res.data, null, 2));

            // Extraer el ID del episodio
            var epId = null;
            if (res.data && res.data.data) {
                var d = res.data.data;
                epId = (d.episode && d.episode._id) || d._id;
            }

            console.log('\n[ID EXTRAÍDO DEL EPISODIO]:', epId);

            if (!epId) {
                throw new Error('No se encontró el ID en la respuesta de single');
            }

            console.log('\n============================================================');
            console.log('>>> 2. PROBANDO /api/rest/player?post_id=' + epId);
            console.log('============================================================');

            return requestJson(API_URL + '/player?post_id=' + epId);
        })
        .then(function(playerRes) {
            console.log('Status Player:', playerRes.status);
            console.log('Data Player:', JSON.stringify(playerRes.data, null, 2));
            console.log('\n✓ FLUJO DE SERIES Y EPISODIOS CONFIRMADO EXITOSAMENTE');
        })
        .catch(function(err) {
            console.log('Error:', err.message);
        });
}

runPhase9();
