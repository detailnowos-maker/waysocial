// Uso: node e2e/peek.mjs <nome> [testid-para-clicar ...]  — abre o app, (opcional) entra na conta demo e tira screenshot.
import { BASE_URL, launch, shot, sleep } from './lib.mjs';

const [name = 'peek', ...steps] = process.argv.slice(2);
const { browser, page, logs } = await launch();
await page.goto(BASE_URL, { waitUntil: 'load', timeout: 180_000 });
await sleep(1500);
for (const step of steps) {
  if (step === 'demo') {
    await page.getByTestId('welcome-demo').click();
    await sleep(2500);
  } else if (step.startsWith('wait:')) {
    await sleep(Number(step.slice(5)));
  } else if (step.startsWith('text:')) {
    await page.getByText(step.slice(5), { exact: false }).first().click();
    await sleep(1200);
  } else if (step.startsWith('goto:')) {
    await page.goto(BASE_URL + step.slice(5), { waitUntil: 'load' });
    await sleep(2000);
  } else {
    await page.getByTestId(step).first().click();
    await sleep(1200);
  }
}
console.log('screenshot:', await shot(page, name));
if (logs.length) console.log(logs.slice(0, 15).join('\n'));
await browser.close();
