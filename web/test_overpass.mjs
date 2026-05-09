const BBOX = '-18.9437,47.4961,-18.8837,47.5761';
const BUILDING_QUERY = `[out:json][timeout:30];
(
  way["building"](${BBOX});
);
out body;
>;
out skel qt;`;

fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  },
  body: 'data=' + encodeURIComponent(BUILDING_QUERY)
}).then(async r => {
  console.log("Status:", r.status);
  const t = await r.text();
  console.log("First 200 chars:", t.substring(0, 200));
  console.log('length:', t.length);
}).catch(console.error);
