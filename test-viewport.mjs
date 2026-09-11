import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const viewports = [
  { name: 'iPhone-14-Pro-Max-Landscape', width: 932, height: 430 },
  { name: 'iPhone-14-Pro-Landscape', width: 844, height: 390 },
  { name: 'iPhone-SE-Landscape', width: 667, height: 375 },
  { name: 'iPhone-14-Pro-Portrait', width: 390, height: 844 },
  { name: 'iPhone-14-Pro-Max-Portrait', width: 430, height: 932 },
];

async function testViewport(browser, viewport) {
  console.log(`\n📱 Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
  
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto('http://localhost:5173/test-responsive.html', { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    // Wait for practice screen to load
    await page.waitForSelector('.practice-container', { timeout: 5000 });
    await page.waitForTimeout(1000);
    
    // Check for horizontal overflow
    const layoutCheck = await page.evaluate(() => {
      const root = document.documentElement;
      const scrollWidth = root.scrollWidth;
      const innerWidth = window.innerWidth;
      const hasOverflow = scrollWidth > innerWidth + 1;
      
      // Check score container
      const scoreContainer = document.querySelector('.score-container');
      let scoreInfo = null;
      if (scoreContainer) {
        const svg = scoreContainer.querySelector('svg');
        if (svg) {
          const svgRect = svg.getBoundingClientRect();
          const containerRect = scoreContainer.getBoundingClientRect();
          scoreInfo = {
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            svgWidth: svgRect.width,
            svgHeight: svgRect.height,
            heightUsage: ((svgRect.height / containerRect.height) * 100).toFixed(1),
            widthUsage: ((svgRect.width / containerRect.width) * 100).toFixed(1),
          };
        }
      }
      
      // Check if complete screen card is visible and centered
      const completeCard = document.querySelector('.complete-screen');
      let cardInfo = null;
      if (completeCard) {
        const cardRect = completeCard.getBoundingClientRect();
        cardInfo = {
          left: cardRect.left,
          right: cardRect.right,
          width: cardRect.width,
          isClipped: cardRect.right > window.innerWidth || cardRect.left < 0
        };
      }
      
      return {
        hasOverflow,
        scrollWidth,
        innerWidth,
        scoreInfo,
        cardInfo
      };
    });
    
    console.log('  Layout check:', {
      hasOverflow: layoutCheck.hasOverflow ? '❌' : '✅',
      scrollWidth: layoutCheck.scrollWidth,
      innerWidth: layoutCheck.innerWidth
    });
    
    if (layoutCheck.scoreInfo) {
      console.log('  Score:', {
        heightUsage: `${layoutCheck.scoreInfo.heightUsage}%`,
        widthUsage: `${layoutCheck.scoreInfo.widthUsage}%`,
        dimensions: `${Math.round(layoutCheck.scoreInfo.svgWidth)}x${Math.round(layoutCheck.scoreInfo.svgHeight)}`
      });
    }
    
    if (layoutCheck.cardInfo) {
      console.log('  Complete card:', {
        clipped: layoutCheck.cardInfo.isClipped ? '❌' : '✅',
        width: Math.round(layoutCheck.cardInfo.width)
      });
    }
    
    // Take screenshot
    const screenshotPath = join(__dirname, 'screenshots', `${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  📸 Screenshot: ${screenshotPath}`);
    
    // Test complete screen if not already there
    if (!layoutCheck.cardInfo) {
      // Complete the song by clicking keys
      for (let i = 0; i < 5; i++) {
        const keys = await page.$$('.key');
        if (keys.length > 0) {
          await keys[0].click();
          await page.waitForTimeout(200);
        }
      }
      
      // Wait for complete screen
      try {
        await page.waitForSelector('.complete-screen', { timeout: 3000 });
        await page.waitForTimeout(500);
        
        const completeCheck = await page.evaluate(() => {
          const card = document.querySelector('.complete-screen');
          if (!card) return null;
          const cardRect = card.getBoundingClientRect();
          return {
            isClipped: cardRect.right > window.innerWidth || cardRect.left < 0,
            centered: Math.abs((cardRect.left + cardRect.right) / 2 - window.innerWidth / 2) < 20
          };
        });
        
        if (completeCheck) {
          console.log('  Complete screen:', {
            clipped: completeCheck.isClipped ? '❌' : '✅',
            centered: completeCheck.centered ? '✅' : '❌'
          });
          
          const completeScreenshotPath = join(__dirname, 'screenshots', `${viewport.name}-complete.png`);
          await page.screenshot({ path: completeScreenshotPath, fullPage: false });
          console.log(`  📸 Complete screenshot: ${completeScreenshotPath}`);
        }
      } catch (e) {
        console.log('  ⚠️  Could not reach complete screen');
      }
    }
    
    return !layoutCheck.hasOverflow;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('🚀 Starting viewport tests...\n');
  
  // Create screenshots directory
  const { mkdirSync } = await import('fs');
  try {
    mkdirSync(join(__dirname, 'screenshots'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  const browser = await chromium.launch({ headless: true });
  
  const results = [];
  for (const viewport of viewports) {
    const passed = await testViewport(browser, viewport);
    results.push({ name: viewport.name, passed });
  }
  
  await browser.close();
  
  console.log('\n📊 Results Summary:');
  console.log('='.repeat(50));
  let allPassed = true;
  for (const result of results) {
    console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
    if (!result.passed) allPassed = false;
  }
  console.log('='.repeat(50));
  console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
