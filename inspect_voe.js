// inspect_voe.js
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function run() {
    const url = "https://voe.sx/e/j6koo1mpucye";
    console.log("Fetching VOE URL:", url);
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Referer": url } });
        console.log("Status:", res.status);
        const html = await res.text();
        console.log("HTML length:", html.length);
        
        // Find scripts
        const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        console.log("Found scripts:", scriptMatch ? scriptMatch.length : 0);
        
        if (scriptMatch) {
            for (let s of scriptMatch) {
                if (s.includes("voe") || s.includes("hls") || s.includes("mp4") || s.includes("json") || s.includes("source") || s.includes("atob")) {
                    console.log("\n--- RELEVANT SCRIPT ---");
                    console.log(s.substring(0, 1000));
                }
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
