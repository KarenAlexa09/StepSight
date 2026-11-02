import type { Lang, Manual, Part, Step } from "./manual";

// Manuals that aren't online, read by hand from the paper booklet so the demo set always gets the right steps.
// Step drawings are drawn from the booklet panels by scripts/make-roller-strips.mjs.

type Text = { instruction: string; check: string };

const step = (number: number, page: number, target: string, to: string, parts: Part[], en: Text, es: Text) => ({ number, page, target, to, parts, en, es });

const ROLLER = [
  step(1, 1, "dark gray plate", "black corner plate",
    [{ name: "2x3 plate", color: "dark gray", quantity: 1 }, { name: "corner plate", color: "black", quantity: 2 }],
    { instruction: "Put the two black L-shaped corner plates side by side and press the dark gray 2x3 plate on top to join them.", check: "The two black corner plates are joined by a dark gray plate on top." },
    { instruction: "Pon las dos placas negras en forma de L una junto a la otra y presiona encima la placa gris oscuro de 2x3 para unirlas.", check: "Las dos placas negras en L están unidas por una placa gris oscuro encima." }),
  step(2, 1, "yellow brick", "black plate",
    [{ name: "2x2 plate", color: "black", quantity: 1 }, { name: "1x2 brick with hole", color: "yellow", quantity: 2 }, { name: "1x1 bracket", color: "black", quantity: 2 }],
    { instruction: "Add the black 2x2 plate and the two yellow bricks with a hole on top, then clip the two small black brackets underneath the front.", check: "Two yellow bricks with holes sit on top, with small black pieces under the front." },
    { instruction: "Agrega encima la placa negra de 2x2 y los dos ladrillos amarillos con agujero, y engancha las dos piezas negras pequeñas por debajo, al frente.", check: "Dos ladrillos amarillos con agujero están arriba y hay piezas negras pequeñas debajo del frente." }),
  step(3, 1, "black brick", "yellow brick",
    [{ name: "2x4 brick with pin", color: "black", quantity: 1 }, { name: "2x3 plate", color: "dark gray", quantity: 1 }, { name: "pin", color: "black", quantity: 2 }],
    { instruction: "Push a small black pin into each yellow brick's hole, set the black brick with the wheel pin next to them and press the dark gray plate across both to lock them together.", check: "The black brick with the wheel pin is joined to the yellow bricks by a dark gray plate." },
    { instruction: "Mete un pin negro pequeño en el agujero de cada ladrillo amarillo, pon al lado el ladrillo negro con el eje de la rueda y presiona la placa gris oscuro sobre ambos para unirlos.", check: "El ladrillo negro con el eje está unido a los ladrillos amarillos por una placa gris oscuro." }),
  step(4, 1, "yellow hexagon block", "black brick",
    [{ name: "1x4 plate", color: "black", quantity: 1 }, { name: "2x2 plate", color: "black", quantity: 1 }, { name: "hexagon block", color: "yellow", quantity: 1 }, { name: "1x1 bracket", color: "black", quantity: 2 }, { name: "round bush", color: "yellow", quantity: 2 }],
    { instruction: "Cover the top with the black 1x4 and 2x2 plates, add a yellow round bush on each pin, the yellow hexagon block on the side and the two small black brackets.", check: "The top is covered with black plates and a yellow hexagon block sits on the side." },
    { instruction: "Cubre la parte de arriba con las placas negras de 1x4 y 2x2, pon un buje amarillo redondo en cada pin, el bloque hexagonal amarillo al lado y las dos piezas negras pequeñas.", check: "La parte de arriba está cubierta con placas negras y hay un bloque hexagonal amarillo al lado." }),
  step(5, 1, "yellow beam", "black brick",
    [{ name: "beam", color: "yellow", quantity: 1 }, { name: "2x4 plate", color: "yellow", quantity: 1 }, { name: "hexagon block", color: "yellow", quantity: 3 }],
    { instruction: "Turn it around. Press the yellow 2x4 plate on top, add the yellow hexagon blocks on the sides and slide the yellow beam onto the side pin.", check: "A yellow plate covers the top and a yellow beam sticks out from the side." },
    { instruction: "Dale la vuelta. Presiona encima la placa amarilla de 2x4, pon los bloques hexagonales amarillos a los lados y mete la viga amarilla en el pin del costado.", check: "Una placa amarilla cubre la parte de arriba y una viga amarilla sale del costado." }),
  step(6, 1, "yellow curved slope", "yellow plate",
    [{ name: "2x2 plate", color: "yellow", quantity: 1 }, { name: "curved slope", color: "yellow", quantity: 2 }, { name: "quarter round tile", color: "yellow", quantity: 2 }],
    { instruction: "Turn it again. Add the yellow 2x2 plate, a curved yellow slope on each side and the two small rounded yellow tiles.", check: "The yellow top has curved slopes on both sides, like a hood." },
    { instruction: "Dale la vuelta otra vez. Agrega la placa amarilla de 2x2, una pendiente curva amarilla a cada lado y las dos piezas amarillas pequeñas redondeadas.", check: "La parte amarilla de arriba tiene pendientes curvas a los dos lados, como un capó." }),
  step(7, 2, "clear brick", "yellow plate",
    [{ name: "2x2 brick", color: "clear", quantity: 1 }, { name: "windscreen", color: "yellow", quantity: 1 }, { name: "grille slope", color: "yellow", quantity: 2 }, { name: "1x2 tile", color: "yellow", quantity: 1 }],
    { instruction: "Build the cab: the clear 2x2 brick is the window, the yellow windscreen goes next to it, the two grille slopes go at the back and the yellow 1x2 tile goes on top in front of them.", check: "A clear window brick and two grille slopes sit on top of the body." },
    { instruction: "Arma la cabina: el ladrillo transparente de 2x2 es la ventana, el parabrisas amarillo va a su lado, las dos pendientes con rejilla van atrás y la pieza lisa amarilla de 1x2 va encima, delante de ellas.", check: "Un ladrillo transparente de ventana y dos pendientes con rejilla están encima del cuerpo." }),
  step(8, 2, "black drum", "yellow beam",
    [{ name: "long axle", color: "black", quantity: 1 }, { name: "drum", color: "black", quantity: 5 }],
    { instruction: "Make the roller: slide the five black drum pieces onto the long black axle, then push the axle through the yellow beam so the roller sits at the front.", check: "A black roller made of five drums sits on an axle at the front." },
    { instruction: "Arma el rodillo: mete las cinco piezas negras de tambor en el eje negro largo y luego pasa el eje por la viga amarilla para que el rodillo quede al frente.", check: "Un rodillo negro de cinco tambores está en un eje al frente." }),
  step(9, 2, "black tire", "black brick",
    [{ name: "tire", color: "black", quantity: 2 }, { name: "rim", color: "yellow", quantity: 2 }, { name: "beam", color: "yellow", quantity: 1 }, { name: "2x2 tile", color: "yellow", quantity: 1 }],
    { instruction: "Turn it around. Push each yellow rim into a tire and press the two wheels onto the back pins. Add the second yellow beam on the other end of the roller axle and the yellow 2x2 tile on the roof.", check: "Two wheels are on the back, the roller has yellow beams on both sides and the roof is yellow." },
    { instruction: "Dale la vuelta. Mete cada rin amarillo en una llanta y presiona las dos ruedas en los pines de atrás. Pon la segunda viga amarilla en el otro extremo del eje del rodillo y la pieza lisa amarilla de 2x2 en el techo.", check: "Hay dos ruedas atrás, el rodillo tiene vigas amarillas a los dos lados y el techo es amarillo." }),
];

const KNOWN = [
  {
    // The search query is in English: "Miniso Mini Racing Pacemaker Road Roller building blocks".
    match: (query: string) => /21015/.test(query) || (/miniso|pacemaker|mini racing/i.test(query) && /roller|rouleau|apisonador|aplanadora|compact|tamper/i.test(query)),
    title: { en: "Miniso Mini Racing Road Roller (21015)", es: "Apisonadora Miniso Mini Racing (21015)" },
    set: "21015",
    steps: ROLLER,
  },
];

export function knownManual(query: string, lang: Lang): Manual | null {
  const known = KNOWN.find((k) => k.match(query));
  if (!known) return null;
  const steps: Step[] = known.steps.map((s) => ({
    number: s.number,
    page: s.page,
    instruction: s[lang].instruction,
    check: s[lang].check,
    parts: s.parts,
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
