// npm run validate — checks the content pack and prints errors/warnings for the writer.
import { loadPackFromDisk } from './load-node';

const { pack, issues } = loadPackFromDisk();
for (const i of issues) {
  console.log(`${i.level === 'error' ? '✖ ОШИБКА' : '⚠ внимание'}  ${i.where}: ${i.message}`);
}
if (!pack) {
  console.log('\nКонтент-пак не собран.');
  process.exit(1);
}
console.log(`\n✔ Пак ${pack.version}: ${pack.cards.length} карточек, ${pack.towns.length} городов, ${pack.horses.length} лошадей.`);
