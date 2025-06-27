
const ping = 70;
const p2 = ping * .5;

export const delay = () => new Promise(x => setTimeout(x, p2));