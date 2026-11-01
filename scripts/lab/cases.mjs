// What Timber should understand. Each case is a conversation: `say` first, then `answers` one per question.
// expect: mode, firstAsks (regex the first question must match), asksModel (false = must not ask brand/model first),
// notReady (vague request), query/name/model (regexes on the final result), manual (checks on the found manual, with --manual).
export const ASKS_MODEL = /brand|model|make|set number|marca|modelo/i;
const ASKS_WHICH = /which|what set|set number|yellow|blue|cuál|número/i;

export const cases = [
  // LEGO and other brick sets
  { cat: "lego", name: "clean my LEGO", say: "I want to clean my LEGO", answers: ["just loose bricks"], expect: { mode: "fix", query: [/lego|brick/i, /clean|wash/i] } },
  { cat: "lego", name: "limpiar mi Lego", lang: "es", say: "Quiero limpiar mi Lego", answers: ["son piezas sueltas"], expect: { mode: "fix", query: [/lego|brick/i, /clean|wash/i] } },
  { cat: "lego", name: "dusty display model", say: "My LEGO Millennium Falcon is all dusty", answers: ["75192"], expect: { mode: "fix", query: [/lego|falcon/i, /dust|clean/i] } },
  { cat: "lego", name: "clean a built set, photo", lang: "es", say: "Quiero limpiar mi Lego", image: "yellow-pot", answers: ["la amarilla"], expect: { mode: "fix", query: [/clean|dust|wash/i] } },
  { cat: "lego", name: "dusty bricks, photo only", image: "bricks-dusty", answers: ["clean them"], expect: { mode: "fix", query: [/clean|wash/i] } },
  {
    cat: "lego",
    name: "set with two builds",
    say: "I want to build LEGO 10349 Happy Plants",
    answers: ["the yellow one"],
    expect: { mode: "build", firstAsks: ASKS_WHICH, query: [/10349|happy plants/i, /yellow|dracaena/i], manual: { host: /lego\.com/i, parts: true } },
  },
  { cat: "lego", name: "build this, photo", say: "I want to build this", image: "yellow-pot", answers: ["LEGO 10349 Happy Plants"], expect: { mode: "build", query: [/10349|happy plants/i, /yellow|dracaena|pineapple/i], manual: { host: /lego\.com/i, parts: true } } },
  { cat: "lego", name: "set number unknown", say: "I want to build a LEGO set", answers: ["Botanicals Orchid 10311"], expect: { mode: "build", firstAsks: ASKS_WHICH, query: [/10311|orchid/i] } },
  { cat: "lego", name: "armar set en español", lang: "es", say: "Quiero armar el Lego 10311 Orquídea", answers: [], expect: { mode: "build", asksModel: false, query: [/10311|orchid/i] } },
  { cat: "lego", name: "piece fell off", say: "A piece fell off my LEGO Technic Ford Mustang 10265 and I don't know where it goes", answers: [], expect: { mode: "build", query: [/10265|mustang/i], manual: { host: /lego\.com/i, parts: true } } },

  // Repairs
  { cat: "repair", name: "washer error code", say: "My washing machine shows error E21", answers: ["Bosch Serie 4 WAN28201GB"], expect: { mode: "fix", firstAsks: ASKS_MODEL, query: [/bosch/i, /e21/i] } },
  { cat: "repair", name: "washer error, photo", say: "What does this mean?", image: "washer-error", answers: ["Bosch Serie 4 WAN28201GB"], expect: { mode: "fix", query: [/e21/i] } },
  { cat: "repair", name: "flat bike tire", say: "How do I fix a flat tire on my bike?", answers: ["a normal road bike"], expect: { mode: "fix", asksModel: false, query: [/tire|tyre|tube|puncture/i] } },
  { cat: "repair", name: "bike chain, photo only", image: "bike-chain", answers: ["put it back on"], expect: { mode: "fix", asksModel: false, query: [/chain/i] } },
  { cat: "repair", name: "cadena de la bici", lang: "es", say: "Se me cayó la cadena de la bici", answers: ["una bici normal"], expect: { mode: "fix", asksModel: false, query: [/chain/i] } },
  { cat: "repair", name: "clogged sink", say: "My kitchen sink is clogged", answers: [], expect: { mode: "fix", asksModel: false, query: [/sink|drain/i] } },
  { cat: "repair", name: "brand only", say: "My Bose headphones won't pair", answers: ["QuietComfort 45"], expect: { mode: "fix", firstAsks: ASKS_MODEL, query: [/bose/i, /45/, /pair/i] } },
  { cat: "repair", name: "dead lamp bulb", say: "My table lamp stopped working, I think the bulb died", answers: ["a normal E27 bulb"], expect: { mode: "fix", asksModel: false, query: [/bulb|lamp/i] } },

  // Cleaning and maintenance
  { cat: "clean", name: "headphones cleaning", say: "I need to fix my headphones", answers: ["Sony WH-1000XM4", "cleaning the ear pads"], expect: { mode: "fix", firstAsks: ASKS_MODEL, query: [/sony/i, /xm4/i, /clean/i], manual: { host: /sony\./i } } },
  { cat: "clean", name: "Razer Barracuda X", lang: "es", say: "Quiero limpiar mis audífonos", answers: ["Razer Barracuda X"], expect: { mode: "fix", firstAsks: /marca|modelo/i, query: [/razer/i, /barracuda/i, /clean/i], manual: {} } },
  { cat: "clean", name: "model unknown", say: "I need to clean my headphones", answers: ["I don't know the model", "use a generic guide"], expect: { mode: "fix", query: [/headphone/i, /clean/i] } },
  { cat: "clean", name: "model given up front", say: "How do I clean the ear pads on my Sony WH-1000XM4 headphones?", answers: [], expect: { mode: "fix", asksModel: false, query: [/sony/i, /xm4/i, /clean|ear pad/i] } },
  { cat: "clean", name: "descale coffee machine", say: "I want to descale my coffee machine", answers: ["De'Longhi Magnifica S ECAM22.110"], expect: { mode: "fix", firstAsks: ASKS_MODEL, query: [/longhi/i, /magnifica|ecam/i, /descal/i] } },
  { cat: "clean", name: "AirPods", say: "Clean my AirPods Pro", answers: ["2nd generation"], expect: { mode: "fix", query: [/airpods/i, /clean/i] } },

  // Setting up something new
  { cat: "setup", name: "Nespresso Vertuo", say: "Set up my new Nespresso Vertuo Next", answers: [], expect: { mode: "build", asksModel: false, query: [/nespresso/i, /vertuo/i] } },
  { cat: "setup", name: "IKEA Kallax", say: "Build a Kallax shelf", answers: ["the 2x4 one"], expect: { mode: "build", query: [/kallax/i], manual: { host: /ikea\./i } } },
  { cat: "setup", name: "IKEA Malm", say: "Assemble an IKEA Malm dresser", answers: ["the 6-drawer one"], expect: { mode: "build", query: [/malm/i] } },

  // Identify (My things): the app sends this text with the photo.
  { cat: "identify", name: "label photo", thing: true, image: "headphones-label", answers: [], expect: { model: /xm4|1000xm4/i } },
  { cat: "identify", name: "plain lamp photo", thing: true, image: "public/demo/lamp0.jpg", answers: ["IKEA Lampan"], expect: { name: /lamp/i, model: /lampan/i } },
  { cat: "identify", name: "brick model photo", thing: true, image: "yellow-pot", answers: ["LEGO 10349 Happy Plants"], expect: { name: /plant|pot|lego|brick/i } },

  // From "My things": the app sends "I need help with my <model>", so Timber must ask what to do.
  { cat: "things", name: "help with LEGO set", say: "I need help with my LEGO 10349 Happy Plants", answers: ["I want to clean it"], expect: { firstAsks: /what|clean|build|fix|help|qué/i, mode: "fix", query: [/10349|happy plants/i, /clean|dust/i] } },
  { cat: "things", name: "ayuda con mis audífonos", lang: "es", say: "Necesito ayuda con mi Sony WH-1000XM4", answers: ["no se conectan por bluetooth"], expect: { firstAsks: /qué|que|ayud|problema|pasa/i, mode: "fix", query: [/xm4/i, /pair|bluetooth|connect/i] } },
  { cat: "things", name: "help then build", say: "I need help with my IKEA Kallax 2x4", answers: ["I just bought it, I need to put it together"], expect: { firstAsks: /what|build|assembl|fix|help/i, mode: "build", query: [/kallax/i] } },

  // Too vague to act on
  { cat: "vague", name: "it's broken", say: "it's broken", answers: [], expect: { notReady: true } },
  { cat: "vague", name: "no funciona", lang: "es", say: "no funciona", answers: [], expect: { notReady: true } },
];

export const THING_TEXT = "I want to save this product to my things. Tell me its brand and model; no task needed.";
