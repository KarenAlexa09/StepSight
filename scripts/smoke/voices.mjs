const key = process.env.FISH_AUDIO_API_KEY;
const queries = process.argv.slice(2);
const seen = new Set();
for (const q of queries) {
  const url = `https://api.fish.audio/model?page_size=8&sort_by=task_count&language=en&title=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.log(q, res.status); continue; }
  const { items } = await res.json();
  for (const m of items) {
    if (seen.has(m._id)) continue;
    seen.add(m._id);
    console.log(`${m._id} | ${m.title} | ${m.like_count} likes | ${(m.tags || []).join(",")} | ${(m.description || "").slice(0, 70).replace(/\n/g, " ")}`);
  }
}
