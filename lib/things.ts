// "My things": products the person owns, identified once (brand + model) so asking for help later skips the questions.
export type Thing = { id: number; name: string; model: string; photo?: string };

const KEY = "stepsight.things";
const MAX = 40;

export function loadThings(): Thing[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(things: Thing[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(things.slice(0, MAX)));
  } catch {} // storage full: keep working without saving
}

// Newest first; the same product (by model, else name) is updated instead of added twice.
export function addThing(thing: Omit<Thing, "id">): Thing[] {
  const same = (t: Thing) => (thing.model ? t.model.toLowerCase() === thing.model.toLowerCase() : t.name.toLowerCase() === thing.name.toLowerCase());
  const old = loadThings();
  const prev = old.find(same);
  const next = [{ ...prev, ...thing, photo: thing.photo ?? prev?.photo, id: prev?.id ?? Date.now() }, ...old.filter((t) => !same(t))];
  save(next);
  return next;
}

export function removeThing(id: number): Thing[] {
  const next = loadThings().filter((t) => t.id !== id);
  save(next);
  return next;
}
