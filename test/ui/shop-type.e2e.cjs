// Real browser -> real server: each branch's kind of shop on the phone app (gss REST-13, owner's
// decision 13: a restaurant is a kind of shop, picked like gadgets or pharmacy).
//
// Run against the same database as gssfrontend/e2e/restaurant.e2e.cjs, after it (both branches are
// restaurants by then). The CEO, in the phone app:
//   - sees each branch's kind in Settings, turns Lekki back into general retail and then into a
//     restaurant again, with a warning each time;
//   - adds a pharmacy branch (on a paid plan; the trial allows one branch);
//   - viewing the pharmacy: the shop sidebar and shop roles;
//   - viewing a restaurant branch: no shop selling, repairs or promotions in the sidebar, restaurant
//     roles in Workers, Reports opening on the restaurant's takings, the dashboard saying where its
//     set-up is, and a restaurant's stock categories.
//
//   PLAYWRIGHT_MODULE=<playwright-core> E2E_CHROMIUM=<chrome> E2E_PHONE=http://localhost:3000 \
//   E2E_PSQL='su postgres -c "psql -d <db> -tAc' node test/ui/shop-type.e2e.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { execSync } = require('child_process');
const APP = process.env.E2E_PHONE || 'http://localhost:3000';
const sql = (q) => execSync(`${process.env.E2E_PSQL || 'su postgres -c "psql -d benchline_e2e -tAc'} \\"${q}\\""`).toString().trim();
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function eventually(fn, ms = 8000) {
  const until = Date.now() + ms;
  for (;;) { try { if (await fn()) return true; } catch {} if (Date.now() > until) return false; await sleep(150); }
}
const modulesOf = (name) => sql(`SELECT string_agg(m.module, ',' ORDER BY m.module) FROM core_branchmodule m JOIN core_shop s ON s.id = m.shop_id WHERE s.name = '${name}' AND m.enabled`);

(async () => {
  const lekki = sql("SELECT id FROM core_shop WHERE name = 'E2E Lekki'");
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined });
  const page = await (await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  page.setDefaultTimeout(10000);
  try {
    await page.goto(`${APP}/login`);
    await page.fill('input:not([type="password"])', 'ceo');
    await page.fill('input[type="password"]', 'pass12345');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${APP}/`, { timeout: 15000 });

    // ---- kinds of shop in Settings ------------------------------------------------------------
    await page.goto(`${APP}/settings`);
    const row = 'tr:has-text("E2E Lekki")';
    check('Settings shows each branch\'s kind; Lekki is a restaurant', await eventually(async () => (await page.textContent(row)).includes('Restaurant & food')));
    for (const [kind, label, mods] of [['general', 'General retail', 'retail'], ['restaurant', 'Restaurant & food', 'restaurant,retail']]) {
      await page.click(`${row} button:has-text("Edit")`);
      await page.selectOption('.modal select[aria-label="Kind of shop"]', kind);
      await page.click('.modal button:has-text("Save")');
      check(`Lekki becomes ${label}, with the modules that go with it`, await eventually(async () => (await page.textContent(row)).includes(label))
        && await eventually(() => modulesOf('E2E Lekki') === mods), modulesOf('E2E Lekki'));
    }
    check('each change was confirmed first, with what it does', dialogs.length === 2 && dialogs[0].includes('open order on its hub till') && dialogs[1].includes('Set up its menu'), dialogs.join(' | '));

    // ---- adding a pharmacy branch (a paid plan) -------------------------------------------------
    sql(`UPDATE subscriptions_subscription SET status = 'active', current_period_end = now() + interval '30 days',
         package_id = (SELECT id FROM subscriptions_package WHERE code = 'retail_restaurant')
         WHERE organization_id = (SELECT organization_id FROM core_shop WHERE name = 'E2E Store')`);
    await page.reload();
    await page.click('button:has-text("Create branch")');
    check('a new branch starts as the kind the business signed up as (general retail)', await eventually(async () => (await page.inputValue('.modal select[aria-label="Kind of shop"]')) === 'general'));
    await page.fill('.modal input[placeholder="e.g. Wuse II"]', 'E2E Ikeja');
    await page.selectOption('.modal select[aria-label="Kind of shop"]', 'pharmacy');
    check('the form says what a pharmacy gets', (await page.textContent('.modal')).includes('prescription flags'));
    await page.click('.modal .modal-actions button:has-text("Create branch")');
    check('E2E Ikeja is a pharmacy branch (retail only)', await eventually(async () => (await page.textContent('tr:has-text("E2E Ikeja")')).includes('Pharmacy'))
      && sql("SELECT shop_type FROM core_shop WHERE name = 'E2E Ikeja'") === 'pharmacy' && modulesOf('E2E Ikeja') === 'retail');

    const nav = async () => (await page.$$eval('.sidebar .navitem', (as) => as.map((a) => a.textContent.trim()))).join(',');
    const roles = async () => {
      await page.goto(`${APP}/workers`);
      await page.click('button:has-text("Add worker")');
      return (await page.$$eval('.modal select[aria-label="Role"] option', (os) => os.map((o) => o.textContent))).join(',');
    };

    // ---- viewing the pharmacy: a shop ----------------------------------------------------------------
    const ikeja = sql("SELECT id FROM core_shop WHERE name = 'E2E Ikeja'");
    await page.evaluate((id) => localStorage.setItem('current_branch_id', id), ikeja);
    await page.goto(`${APP}/`);
    check('the pharmacy has the shop sidebar (Sales, Promotions)', await eventually(async () => /Sales/.test(await nav()) && /Promotions/.test(await nav())), await nav());
    const shopRoles = await roles();
    check('…and shop roles in Workers', shopRoles === 'Seller,Receptionist,Service technician,Shop attendant,Other', shopRoles);

    // ---- viewing the restaurant branch -----------------------------------------------------------
    await page.evaluate((id) => localStorage.setItem('current_branch_id', id), lekki);
    await page.goto(`${APP}/`);
    check('the restaurant branch has no shop selling, repairs or promotions; its stock is "Stock"', await eventually(async () => {
      const n = await nav();
      return n.includes('Stock') && !/Sales|Service|Promotions/.test(n);
    }), await nav());
    const restaurantRoles = await roles();
    check('…restaurant roles in Workers', restaurantRoles === 'Waiter,Cashier,Kitchen staff,Other', restaurantRoles);
    await page.goto(`${APP}/reports`);
    check('…and Reports opens on the restaurant\'s takings', await eventually(async () => (await page.isVisible('.report-nav button.active:has-text("Restaurant takings")')) && page.isVisible('[data-takings]')));
    await page.goto(`${APP}/`);
    check('the dashboard says where a restaurant branch is set up', await eventually(async () => (await page.textContent('[data-restaurant-note]')).includes('on the web')));
    await page.goto(`${APP}/inventory`);
    await page.click('button:has-text("Add item")');
    const cats = await page.$$eval('.modal select option', (os) => os.map((o) => o.textContent));
    check('its stock categories are a restaurant\'s', cats.includes('Food ingredient') && !cats.includes('Grocery'), cats.join(', '));
    check('no script errors in the page', errors.length === 0, errors.join(' | ').slice(0, 300));
  } catch (e) {
    fails++;
    console.log('FAIL  stopped:', e.message.split('\n')[0]);
    console.log('      page text:', (await page.textContent('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 500));
  } finally {
    await browser.close();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
