const SITE_URL = "https://lamovie.org";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function findEpisodes() {
    console.log("=== DIAGNÓSTICO DE EPISODIOS EN LAMOVIE ===");

    // Prueba A: Buscar el episodio directamente en la API
    const queries = [
        "The Last of Us 1x1",
        "The Last of Us 1x01",
        "The Last of Us Temporada 1"
    ];

    for (const q of queries) {
        try {
            const url = `${SITE_URL}/wp-api/v1/search?postType=any&q=${encodeURIComponent(q)}&postsPerPage=5`;
            const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
            const json = await res.json();
            const posts = json?.data?.posts || [];
            console.log(`\n[A] Búsqueda: "${q}" -> Encontrados: ${posts.length}`);
            posts.forEach(p => console.log(`  - [${p.type || p.postType || 'post'}] ${p.title} (ID: ${p._id || p.id})`));
        } catch (e) {
            console.log(`Error buscando "${q}":`, e.message);
        }
    }

    // Prueba B: Inspeccionar el HTML de la serie en /series/the-last-of-us-2023/
    try {
        console.log("\n[B] Consultando HTML de la serie...");
        const res = await fetch(`${SITE_URL}/series/the-last-of-us-2023/`, {
            headers: { "User-Agent": USER_AGENT }
        });
        const html = await res.text();
        console.log(`Tamaño HTML: ${html.length} caracteres`);

        // Buscar IDs de episodios o temporadas en el HTML
        const episodeMatches = html.match(/(?:data-id|data-post|episode-id|id)=["'](\d+)["']/gi) || [];
        console.log(`IDs encontrados en atributos HTML:`, episodeMatches.slice(0, 10));

        // Buscar si hay variables JSON con episodios dentro de <script>
        const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
        scriptMatches.forEach((s, idx) => {
            if (s.includes("episode") || s.includes("season") || s.includes("vimeos") || s.includes("embed")) {
                console.log(`\n--- Script con datos #${idx + 1} ---`);
                console.log(s.substring(0, 300) + "...");
            }
        });

    } catch (e) {
        console.log("Error en HTML:", e.message);
    }
}

findEpisodes();
