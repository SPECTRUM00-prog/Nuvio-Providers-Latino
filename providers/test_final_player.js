/**
 * Test definitivo del reproductor FastApi
 * Ejecución: node providers/test_final_player.js
 */

var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://lamovie.org/"
};

var url = "https://lamovie.org/wp-api/v1/player?postId=19173&demo=0";

console.log("Consultando endpoint definitivo:", url);

fetch(url, { headers: headers })
.then(function(res) { return res.json(); })
.then(function(json) {
    console.log("\n=======================================================");
    console.log(">>> RESPUESTA DE REPRODUCTORES Y SERVIDORES REALES <<<");
    console.log("=======================================================");
    console.log(JSON.stringify(json, null, 2));
})
.catch(function(err) {
    console.error("[-] Error:", err.message);
});
