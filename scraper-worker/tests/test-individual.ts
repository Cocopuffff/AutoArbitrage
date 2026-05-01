import { scrapeIndividualLinks } from '../src/scraper';

async function run() {
    const res = await scrapeIndividualLinks([{
        url: "https://www.sgcarmart.com/used-cars/info/nissan-serena-e-power-hybrid-1463568/?dl=3037&utm_content=SLeligible",
        expectedModel: "Nissan Serena e-POWER Hybrid"
    }]);
    console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
