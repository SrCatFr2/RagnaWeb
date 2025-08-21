import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

const r1 = await axios.get('https://www.hamam.com/en-intl/patara-towel-221-13-xx.html', {
  headers: {
    'authority': 'www.hamam.com',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'es-US,es-419;q=0.9,es;q=0.8',
    'cache-control': 'max-age=0',
    'cookie': 'PHPSESSID=kkn5rv7cp8367cr223nfjh4t1a; mage-messages=; user_allowed_save_cookie=%7B%2219%22%3A1%7D; form_key=C8fKKpZOI4cURO2j; _fbp=fb.1.1755802290512.568996765632744765;_gcl_au=1.1.392923881.1755802291; _ga=GA1.1.550158074.1755802292;_clck=bbcdsb%5E2%5Efyn%5E0%5E2059; form_key=C8fKKpZOI4cURO2j; mage-cache-storage={}; mage-cache-storage-section-invalidation={}; mage-cache-sessid=true; recently_viewed_product={}; recently_viewed_product_previous={}; recently_compared_product={}; recently_compared_product_previous={}; product_data_storage={}; _clsk=1ap567d%5E1755802327904%5E4%5E1%5Ej.clarity.ms%2Fcollect;_ga_B7EK45HMNL=GS2.1.s1755802291$o1$g1$t1755802335$j16$l0$h0; private_content_version=26ee70c27c2b147d87cab65f1c9e2375; section_data_ids={%22cart%22:1755802349%2C%22directory-data%22:1755802349%2C%22magepal-gtm-jsdatalayer%22:1755802349%2C%22magepal-eegtm-jsdatalayer%22:1755802349}',
    'referer': 'https://www.hamam.com/en-intl/bath.html?product_list_order=price&product_list_dir=asc',
    'sec-ch-ua': '"Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
  }
});

const html = r1.data;

// Buscar CUALQUIER mención de uenc en todo el HTML
const uencMatches = html.match(/uenc['":\s]*([a-zA-Z0-9+\/=]{20,})/g);
const checkoutMatches = html.match(/checkout\/cart\/add[^"'\s]*/g);

console.log('uenc matches:', uencMatches);
console.log('checkout matches:', checkoutMatches);

// Buscar en scripts también
const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
if (scriptMatches) {
    scriptMatches.forEach((script, i) => {
        if (script.includes('uenc') || script.includes('checkout/cart/add')) {
            console.log(`Script ${i} con uenc/checkout:`, script.substring(0, 200) + '...');
        }
    });
}

// form_key
const $ = cheerio.load(html);
const formKey = $('input[name="form_key"]').val();
console.log('form_key:', formKey);



fs.write('output.html', html)