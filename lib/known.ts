import type { Lang, Manual, Part, Step } from "./manual";

// Manuals that aren't online, read by hand from the paper booklet so the demo set always gets the right steps.
// Each booklet step is split into one-action steps; drawings come from scripts/make-roller-strips.mjs,
// piece photos from the booklet's parts boxes (scripts/make-roller-parts.mjs).

type Text = { instruction: string; check: string };

// What each piece looks like on the table, so Show me can tell similar pieces apart.
const LOOKS: Record<string, string> = {
  "dark gray 2x3 plate": "flat dark gray plate with 6 studs",
  "black corner plate": "flat black L-shaped plate with 3 studs",
  "black 2x2 plate": "flat black square plate with 4 studs",
  "yellow 1x2 brick with hole": "yellow brick with 2 studs and a cross-shaped hole in its side",
  "black 1x1 bracket": "tiny black piece with one stud and a small plate sticking out sideways",
  "black 2x4 brick with pin": "the biggest black brick, with a white pin sticking out",
  "black pin": "short thin black rod",
  "black 1x4 plate": "long thin flat black plate with a row of holes",
  "yellow 1x1 brick": "small yellow cube-shaped brick",
  "yellow round bush": "small yellow ring with a cross-shaped hole",
  "yellow beam": "long thin flat yellow bar with a row of round holes",
  "yellow 2x4 plate": "flat yellow rectangular plate with 8 studs",
  "yellow 2x2 plate": "flat yellow square plate with 4 studs",
  "yellow curved slope": "small yellow curved wedge",
  "yellow quarter round tile": "tiny flat yellow quarter-circle piece",
  "clear 2x2 brick": "transparent clear brick",
  "yellow windscreen": "yellow frame with a window opening",
  "yellow grille slope": "small yellow slope with grille lines",
  "yellow 1x2 tile": "smooth flat yellow 1x2 piece without studs",
  "black long axle": "long thin black rod",
  "black drum": "round black gear-like drum with holes",
  "black tire": "black rubber tire ring",
  "yellow rim": "yellow wheel rim",
  "yellow 2x2 tile": "flat yellow square with one stud in the middle",
};

const p = (quantity: number, color: string, name: string): Part => ({ name, color, quantity });

// panel: the booklet step the drawing starts from. draw: what the hands do in it.
type Mini = { page: number; panel: number; target: string; to: string; parts: Part[]; draw: string; en: Text; es: Text };

const ROLLER: Mini[] = [
  {
    page: 1, panel: 1, target: "dark gray plate", to: "black corner plate", parts: [p(1, "dark gray", "2x3 plate"), p(2, "black", "corner plate")],
    draw: "press the dark gray 2x3 plate onto two black L-shaped corner plates lying side by side",
    en: { instruction: "Put the two black L plates side by side and press the gray plate on top to join them.", check: "The two black L plates are joined by a dark gray plate on top." },
    es: { instruction: "Pon las dos placas negras en L una junto a la otra y presiona encima la placa gris para unirlas.", check: "Las dos placas negras en L están unidas por una placa gris oscuro encima." },
  },
  {
    page: 1, panel: 2, target: "yellow brick", to: "dark gray plate", parts: [p(1, "black", "2x2 plate"), p(2, "yellow", "1x2 brick with hole")],
    draw: "press a black 2x2 plate in the middle and a yellow brick with a hole on each side of it, on top of the base",
    en: { instruction: "Press the black square plate in the middle, then a yellow brick with a hole on each side of it.", check: "Two yellow bricks with holes sit on top, one on each side of a black plate." },
    es: { instruction: "Presiona la placa negra cuadrada en el centro y luego un ladrillo amarillo con agujero a cada lado.", check: "Hay dos ladrillos amarillos con agujero arriba, uno a cada lado de una placa negra." },
  },
  {
    page: 1, panel: 2, target: "black bracket", to: "dark gray plate", parts: [p(2, "black", "1x1 bracket")],
    draw: "clip two tiny black brackets under the front of the base",
    en: { instruction: "Clip a tiny black bracket under each front corner.", check: "Two small black pieces stick out under the front." },
    es: { instruction: "Engancha una pieza negra pequeña debajo de cada esquina de adelante.", check: "Dos piezas negras pequeñas salen por debajo del frente." },
  },
  {
    page: 1, panel: 3, target: "black pin", to: "yellow brick", parts: [p(2, "black", "pin")],
    draw: "push a short black pin into the hole of each yellow brick",
    en: { instruction: "Push a short black pin into the hole of each yellow brick.", check: "A black pin sticks out of each yellow brick." },
    es: { instruction: "Mete un pin negro corto en el agujero de cada ladrillo amarillo.", check: "Sale un pin negro de cada ladrillo amarillo." },
  },
  {
    page: 1, panel: 3, target: "black brick", to: "yellow brick", parts: [p(1, "black", "2x4 brick with pin"), p(1, "dark gray", "2x3 plate")],
    draw: "set the big black brick with a white pin next to the yellow bricks and press a dark gray plate across both",
    en: { instruction: "Set the big black brick next to it and press the gray plate across both to lock them.", check: "The big black brick is joined to the yellow bricks by a gray plate." },
    es: { instruction: "Pon al lado el ladrillo negro grande y presiona la placa gris sobre los dos para unirlos.", check: "El ladrillo negro grande está unido a los amarillos por una placa gris." },
  },
  {
    page: 1, panel: 4, target: "black plate", to: "black brick", parts: [p(1, "black", "1x4 plate"), p(1, "black", "2x2 plate")],
    draw: "press a long black plate and a black 2x2 plate on top to cover it",
    en: { instruction: "Cover the top with the long black plate and the black square plate.", check: "The top is covered with black plates." },
    es: { instruction: "Cubre la parte de arriba con la placa negra larga y la placa negra cuadrada.", check: "La parte de arriba está cubierta con placas negras." },
  },
  {
    page: 1, panel: 4, target: "yellow round bush", to: "black pin", parts: [p(2, "yellow", "round bush")],
    draw: "slide a small yellow round bush onto each black pin sticking out of the side",
    en: { instruction: "Slide a yellow ring onto each black pin.", check: "Each black pin has a yellow ring on it." },
    es: { instruction: "Mete un aro amarillo en cada pin negro.", check: "Cada pin negro tiene un aro amarillo." },
  },
  {
    page: 1, panel: 4, target: "yellow 1x1 brick", to: "black brick", parts: [p(1, "yellow", "1x1 brick"), p(2, "black", "1x1 bracket")],
    draw: "add one small yellow cube brick on the side and two tiny black brackets on top",
    en: { instruction: "Add the small yellow cube on the side and the two tiny black brackets on top.", check: "A small yellow cube sits on the side." },
    es: { instruction: "Pon el cubito amarillo al lado y las dos piezas negras pequeñas arriba.", check: "Hay un cubito amarillo al lado." },
  },
  {
    page: 1, panel: 5, target: "yellow plate", to: "black brick", parts: [p(1, "yellow", "2x4 plate")],
    draw: "turn the model around and press a yellow 2x4 plate on top",
    en: { instruction: "Turn it around and press the yellow plate with 8 studs on top.", check: "A yellow plate covers the top." },
    es: { instruction: "Dale la vuelta y presiona encima la placa amarilla de 8 puntos.", check: "Una placa amarilla cubre la parte de arriba." },
  },
  {
    page: 1, panel: 5, target: "yellow 1x1 brick", to: "yellow plate", parts: [p(3, "yellow", "1x1 brick")],
    draw: "press three small yellow cube bricks onto the sides",
    en: { instruction: "Press the three small yellow cubes onto the sides.", check: "Small yellow cubes sit on the sides." },
    es: { instruction: "Presiona los tres cubitos amarillos en los lados.", check: "Hay cubitos amarillos en los lados." },
  },
  {
    page: 1, panel: 5, target: "yellow beam", to: "black brick", parts: [p(1, "yellow", "beam")],
    draw: "slide a long yellow beam with round holes onto the pin on the side",
    en: { instruction: "Slide the long yellow bar onto the pin on the side.", check: "A long yellow bar sticks out from the side." },
    es: { instruction: "Mete la barra amarilla larga en el pin del costado.", check: "Una barra amarilla larga sale del costado." },
  },
  {
    page: 1, panel: 6, target: "yellow plate", to: "yellow plate", parts: [p(1, "yellow", "2x2 plate"), p(2, "yellow", "quarter round tile")],
    draw: "turn it again and press a yellow 2x2 plate and two tiny rounded yellow pieces on top",
    en: { instruction: "Turn it again. Press the yellow square plate and the two tiny rounded pieces on top.", check: "A yellow square plate sits on top." },
    es: { instruction: "Dale la vuelta otra vez. Presiona arriba la placa amarilla cuadrada y las dos piecitas redondeadas.", check: "Hay una placa amarilla cuadrada arriba." },
  },
  {
    page: 1, panel: 6, target: "yellow curved slope", to: "yellow plate", parts: [p(2, "yellow", "curved slope")],
    draw: "press a curved yellow slope on each side of the top, like a hood",
    en: { instruction: "Press a curved yellow slope on each side, like a hood.", check: "The top has curved slopes on both sides." },
    es: { instruction: "Presiona una pendiente curva amarilla a cada lado, como un capó.", check: "Arriba hay pendientes curvas a los dos lados." },
  },
  {
    page: 2, panel: 7, target: "clear brick", to: "yellow plate", parts: [p(1, "clear", "2x2 brick"), p(1, "yellow", "windscreen")],
    draw: "build the cab: a clear 2x2 brick as the window and a yellow windscreen frame next to it",
    en: { instruction: "Build the cab: the clear brick is the window and the yellow frame goes next to it.", check: "A clear window brick and a yellow frame form the cab." },
    es: { instruction: "Arma la cabina: el ladrillo transparente es la ventana y el marco amarillo va a su lado.", check: "Un ladrillo transparente y un marco amarillo forman la cabina." },
  },
  {
    page: 2, panel: 7, target: "yellow grille slope", to: "yellow plate", parts: [p(2, "yellow", "grille slope"), p(1, "yellow", "1x2 tile")],
    draw: "put two yellow grille slopes at the back and a smooth yellow 1x2 tile in front of them",
    en: { instruction: "Put the two grille slopes at the back and the smooth yellow piece in front of them.", check: "Two grille slopes sit at the back." },
    es: { instruction: "Pon las dos pendientes con rejilla atrás y la pieza amarilla lisa delante de ellas.", check: "Hay dos pendientes con rejilla atrás." },
  },
  {
    page: 2, panel: 8, target: "black drum", to: "black long axle", parts: [p(1, "black", "long axle"), p(5, "black", "drum")],
    draw: "slide five round black drums onto a long black axle, one after another",
    en: { instruction: "Slide the five black drums onto the long black axle.", check: "Five black drums sit side by side on the axle." },
    es: { instruction: "Mete los cinco tambores negros en el eje negro largo.", check: "Cinco tambores negros están juntos en el eje." },
  },
  {
    page: 2, panel: 8, target: "yellow beam", to: "black drum", parts: [],
    draw: "push the end of the axle with the black roller through the hole at the end of the yellow beam",
    en: { instruction: "Push the axle through the end hole of the yellow bar, so the roller sits at the front.", check: "The black roller sits at the front, held by the yellow bar." },
    es: { instruction: "Pasa el eje por el agujero del extremo de la barra amarilla, para que el rodillo quede al frente.", check: "El rodillo negro está al frente, sujeto por la barra amarilla." },
  },
  {
    page: 2, panel: 9, target: "black tire", to: "black brick", parts: [p(2, "black", "tire"), p(2, "yellow", "rim")],
    draw: "push each yellow rim into a black tire and press the two wheels onto the back pins",
    en: { instruction: "Push each yellow rim into a tire, then press the wheels onto the back pins.", check: "Two wheels are on the back." },
    es: { instruction: "Mete cada rin amarillo en una llanta y presiona las ruedas en los pines de atrás.", check: "Hay dos ruedas atrás." },
  },
  {
    page: 2, panel: 9, target: "yellow beam", to: "black drum", parts: [p(1, "yellow", "beam"), p(1, "yellow", "2x2 tile")],
    draw: "slide a second yellow beam onto the other end of the roller axle and press a yellow 2x2 tile on the roof",
    en: { instruction: "Slide the second yellow bar onto the other end of the roller and press the yellow square tile on the roof.", check: "The roller has yellow bars on both sides and the roof is yellow." },
    es: { instruction: "Mete la segunda barra amarilla en el otro extremo del rodillo y presiona la pieza amarilla cuadrada en el techo.", check: "El rodillo tiene barras amarillas a los dos lados y el techo es amarillo." },
  },
];

const slug = (s: string) => s.replace(/\W+/g, "-");

const KNOWN = [
  {
    // The search query is in English: "Miniso Mini Racing Pacemaker Road Roller building blocks".
    match: (query: string) => /21015/.test(query) || (/miniso|pacemaker|mini racing/i.test(query) && /roller|rouleau|apisonador|aplanadora|compact|tamper/i.test(query)),
    title: { en: "Miniso Mini Racing Road Roller (21015)", es: "Apisonadora Miniso Mini Racing (21015)" },
    set: "21015",
    steps: ROLLER,
  },
];

export const rollerSteps = ROLLER;

export function knownManual(query: string, lang: Lang): Manual | null {
  const known = KNOWN.find((k) => k.match(query));
  if (!known) return null;
  const steps: Step[] = known.steps.map((s, i) => ({
    number: i + 1,
    page: s.page,
    instruction: s[lang].instruction,
    check: s[lang].check,
    parts: s.parts.map((part) => {
      const key = `${part.color} ${part.name}`;
      return { ...part, looks: LOOKS[key], image: `/manuals/${known.set}/parts/${slug(key)}.jpg` };
    }),
    kind: "verify",
    target: s.target,
    motion: { type: "connect", direction: "down", to: s.to },
    safety: false,
  }));
  return {
    title: known.title[lang],
    steps,
    prep: [],
    hazard: "none",
    source: { name: "paper manual", url: "", official: true, specific: true },
    strips: steps.map((_, i) => `/manuals/${known.set}/anim-${i + 1}.jpg`),
  };
}
