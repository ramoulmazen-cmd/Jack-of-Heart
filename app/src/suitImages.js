// Made by the suit generator from assets/art/suits.svg: the four suits as images, one per colour.
// Images, not text: phones without a font for ♠♥♦♣ would otherwise show nothing.

export const SUIT_IMAGES = {
  hearts: {
    red: require('../assets/suits/hearts-red.png'),
    ink: require('../assets/suits/hearts-ink.png'),
    faded: require('../assets/suits/hearts-faded.png'),
    alarm: require('../assets/suits/hearts-alarm.png'),
    chalk: require('../assets/suits/hearts-chalk.png'),
    stock: require('../assets/suits/hearts-stock.png'),
    paint: require('../assets/suits/hearts-paint.png'),
    backheart: require('../assets/suits/hearts-backheart.png'),
  },
  diamonds: {
    red: require('../assets/suits/diamonds-red.png'),
    ink: require('../assets/suits/diamonds-ink.png'),
    faded: require('../assets/suits/diamonds-faded.png'),
    alarm: require('../assets/suits/diamonds-alarm.png'),
    chalk: require('../assets/suits/diamonds-chalk.png'),
    stock: require('../assets/suits/diamonds-stock.png'),
    paint: require('../assets/suits/diamonds-paint.png'),
    backheart: require('../assets/suits/diamonds-backheart.png'),
  },
  spades: {
    red: require('../assets/suits/spades-red.png'),
    ink: require('../assets/suits/spades-ink.png'),
    faded: require('../assets/suits/spades-faded.png'),
    alarm: require('../assets/suits/spades-alarm.png'),
    chalk: require('../assets/suits/spades-chalk.png'),
    stock: require('../assets/suits/spades-stock.png'),
    paint: require('../assets/suits/spades-paint.png'),
    backheart: require('../assets/suits/spades-backheart.png'),
  },
  clubs: {
    red: require('../assets/suits/clubs-red.png'),
    ink: require('../assets/suits/clubs-ink.png'),
    faded: require('../assets/suits/clubs-faded.png'),
    alarm: require('../assets/suits/clubs-alarm.png'),
    chalk: require('../assets/suits/clubs-chalk.png'),
    stock: require('../assets/suits/clubs-stock.png'),
    paint: require('../assets/suits/clubs-paint.png'),
    backheart: require('../assets/suits/clubs-backheart.png'),
  },
};

/** Colour (as in theme.js) → which set of images to use. */
export const TINT_OF = {
  '#C41E3A': 'red',
  '#16140F': 'ink',
  '#8D9F95': 'faded',
  '#F2546B': 'alarm',
  '#E4E9E3': 'chalk',
  '#F2EDE0': 'stock',
  '#E3B23C': 'paint',
  '#E0263F': 'backheart',
};
