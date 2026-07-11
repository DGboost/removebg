export interface QuickScene {
  id: string;
  name: string;
  photo: string;
}

function enc(bg: string, inner: string) {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480' viewBox='0 0 480 480'><rect width='480' height='480' fill='${bg}'/>${inner}</svg>`,
    )
  );
}

function scene(id: string, name: string, bg: string, inner: string): QuickScene {
  return { id, name, photo: enc(bg, inner) };
}

let cached: QuickScene[] | null = null;

// Hand-drawn SVG placeholders for the "quick start" examples on the home
// screen, so the tool has something to demo without shipping real photo
// assets.
export function getQuickScenes(): QuickScene[] {
  if (cached) return cached;
  cached = [
    scene(
      "plant",
      "몬스테라 화분",
      "#eef1ec",
      `<ellipse cx='240' cy='398' rx='96' ry='20' fill='#00000010'/><circle cx='240' cy='168' r='72' fill='#5a8a63'/><circle cx='184' cy='206' r='52' fill='#71a079'/><circle cx='300' cy='210' r='48' fill='#4c7a56'/><circle cx='240' cy='236' r='44' fill='#84ad88'/><path d='M182 300 L298 300 L280 394 L200 394 Z' fill='#cf8358'/><rect x='176' y='286' width='128' height='26' rx='6' fill='#dc9268'/>`,
    ),
    scene(
      "mug",
      "세라믹 머그컵",
      "#f3eee7",
      `<ellipse cx='240' cy='392' rx='88' ry='18' fill='#00000010'/><circle cx='312' cy='268' r='36' fill='none' stroke='#dcd4c7' stroke-width='20'/><rect x='168' y='218' width='142' height='158' rx='20' fill='#ece6dc'/><ellipse cx='239' cy='224' rx='71' ry='17' fill='#5b3f2c'/><ellipse cx='239' cy='222' rx='71' ry='17' fill='none' stroke='#dbd3c6' stroke-width='6'/>`,
    ),
    scene(
      "sneaker",
      "러닝 스니커즈",
      "#eef0f3",
      `<ellipse cx='250' cy='352' rx='120' ry='18' fill='#00000010'/><path d='M150 300 Q150 250 214 250 L300 250 Q362 250 374 292 Q380 318 344 320 L168 320 Q150 320 150 302 Z' fill='#e0e4ea'/><path d='M150 318 L376 318 Q382 332 362 338 L162 338 Q142 336 150 318 Z' fill='#b7bfcc'/><path d='M214 258 L262 258 L252 300 L226 300 Z' fill='#cbd2dc'/><path d='M300 256 L342 300 L320 306 L286 266 Z' fill='#98a4b5'/><circle cx='198' cy='290' r='6' fill='#fff'/><circle cx='224' cy='284' r='6' fill='#fff'/>`,
    ),
    scene(
      "perfume",
      "향수 보틀",
      "#f4eef1",
      `<ellipse cx='240' cy='392' rx='72' ry='16' fill='#00000010'/><rect x='218' y='150' width='44' height='46' rx='6' fill='#c79cb0'/><rect x='228' y='190' width='24' height='22' fill='#e2cbd6'/><path d='M190 220 Q190 205 206 205 L274 205 Q290 205 290 220 L290 340 Q290 360 270 360 L210 360 Q190 360 190 340 Z' fill='#efe0e7'/><path d='M190 300 L290 300 L290 340 Q290 360 270 360 L210 360 Q190 360 190 340 Z' fill='#e2b9cb'/><rect x='210' y='250' width='60' height='36' rx='5' fill='#fff'/>`,
    ),
    scene(
      "camera",
      "미러리스 카메라",
      "#edf0f0",
      `<ellipse cx='240' cy='352' rx='104' ry='18' fill='#00000010'/><rect x='162' y='212' width='156' height='114' rx='16' fill='#3a3f47'/><rect x='250' y='190' width='54' height='30' rx='7' fill='#2f343b'/><circle cx='240' cy='272' r='54' fill='#20242a'/><circle cx='240' cy='272' r='35' fill='#464c56'/><circle cx='240' cy='272' r='18' fill='#6f7a8b'/><rect x='178' y='226' width='28' height='18' rx='4' fill='#e0e4ea'/>`,
    ),
    scene(
      "chair",
      "라운지 체어",
      "#f1efe9",
      `<ellipse cx='246' cy='372' rx='96' ry='18' fill='#00000010'/><rect x='190' y='168' width='112' height='118' rx='26' fill='#c98f6a'/><rect x='168' y='250' width='28' height='78' rx='13' fill='#bd8360'/><rect x='296' y='250' width='28' height='78' rx='13' fill='#bd8360'/><rect x='176' y='266' width='140' height='54' rx='16' fill='#d89f78'/><rect x='188' y='318' width='16' height='42' rx='4' fill='#6b4a34'/><rect x='288' y='318' width='16' height='42' rx='4' fill='#6b4a34'/>`,
    ),
  ];
  return cached;
}
