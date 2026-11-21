// Cell-block paint for the walls, card stock and card ink for anything you can see,
// stencil paint for what matters right now, and the Jack's black and gold.
export const color = {
  wall: '#17211C',
  wallRaised: '#223029',
  wallLine: '#33443B',
  cell: '#0F1512',
  blood: '#5E0B16',
  chalk: '#E4E9E3',
  faded: '#8D9F95',
  stock: '#F2EDE0',
  ink: '#16140F',
  red: '#C41E3A',
  alarm: '#F2546B',
  paint: '#E3B23C',
  goldLight: '#FBE7A1',
  noir: '#0C090A',
  shade: 'rgba(10, 14, 12, 0.78)',
};

export const font = {
  stencil: 'BigShouldersStencil_800ExtraBold',
};

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

// Suits are drawn as images (SuitIcon in ui.js), never as ♠♥♦♣ text: many Android phones
// only have those characters in their emoji font and show nothing for the plain text version.

export const suitInk = (suit) => (suit === 'hearts' || suit === 'diamonds' ? color.red : color.ink);
// On the dark walls, black suits need light ink to be readable.
export const suitOnWall = (suit) => (suit === 'hearts' || suit === 'diamonds' ? color.alarm : color.chalk);
