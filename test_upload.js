import puppeteer from 'puppeteer';

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  console.log('Navigating to CuteBI...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  console.log('Uploading Template...');
  // The upload icon is an SVG inside a button in the "SAVED TEMPLATES" header
  // Let's attach a file chooser interceptor
  const [templateChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.evaluate(() => {
       // Find the upload button. It's the button inside the SAVED TEMPLATES div
       const divs = Array.from(document.querySelectorAll('div'));
       const headerDiv = divs.find(d => d.textContent === 'SAVED TEMPLATES' && d.querySelector('button'));
       if (headerDiv) {
          headerDiv.querySelector('button').click();
       }
    })
  ]);

  await templateChooser.accept(['C:\\Users\\mitth\\Downloads\\Fact Sale & Others Report_Backup.json']);
  console.log('Template uploaded.');

  // Wait for the restore process to ask for datasets
  console.log('Waiting for dataset upload prompt (3s)...');
  await new Promise(r => setTimeout(r, 3000)); 

  console.log('Uploading Datasets...');
  // The restore modal has a specific label or button for uploading missing datasets
  const [datasetChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.evaluate(() => {
       // Find the modal upload button (it's the only one inside a fixed inset-0 div usually, or just look for the text)
       const buttons = Array.from(document.querySelectorAll('button'));
       const uploadBtn = buttons.find(b => b.textContent.includes('Upload') || b.textContent.includes('Missing Datasets'));
       if (uploadBtn) { uploadBtn.click(); }
       else {
           // Fallback: click any label holding a file input in the modal
           const labels = Array.from(document.querySelectorAll('label'));
           const uploadLabel = labels.find(l => l.textContent.includes('Upload Excel') || l.textContent.includes('Browse'));
           if (uploadLabel) uploadLabel.click();
       }
    })
  ]);

  await datasetChooser.accept([
    'C:\\Users\\mitth\\Downloads\\Fact Sale.xlsx',
    'C:\\Users\\mitth\\Downloads\\Dim Dealer.xlsx',
    'C:\\Users\\mitth\\Downloads\\Dim Product.xlsx',
    'C:\\Users\\mitth\\Downloads\\Dim Calender.xlsx'
  ]);

  console.log('Waiting for charts to render (8 seconds)...');
  await new Promise(r => setTimeout(r, 8000));

  const screenshotPath = 'C:\\Users\\mitth\\.gemini\\antigravity\\brain\\f5477e15-12b2-4b58-8a12-4aca61f79bd3\\chart_test_result4.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to: ' + screenshotPath);

  // Print text content of first chart to verify labels
  try {
     const chartTexts = await page.$$eval('.recharts-cartesian-axis-tick-value tspan', nodes => nodes.map(n => n.textContent));
     console.log('\n--- X-Axis Labels ---');
     console.log(chartTexts.slice(0, 10).join(', '));
  } catch (e) {
     console.log('Could not extract recharts labels.');
  }

  await browser.close();
  console.log('Done.');
}

run().catch(console.error);
