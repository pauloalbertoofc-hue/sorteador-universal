import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base=process.env.SU_VISUAL_BASE||'http://127.0.0.1:8765';
const themes=['classic','modern','amethyst','ruby','crystal','abyssal','original'];
const browser=await chromium.launch({headless:true});
await mkdir('artifacts/theme-review',{recursive:true});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  for(const theme of themes){
   for(const [name,path] of [['home','/'],['seo','/sortear-nomes/']]){
    await page.goto(base+path+'?suTheme='+theme,{waitUntil:'domcontentloaded'});
    await page.locator('body[data-su-theme="'+theme+'"]').waitFor();
    await page.screenshot({path:'artifacts/theme-review/'+name+'-'+theme+'-'+width+'.png',fullPage:true,animations:'disabled'});
   }
  }
  await page.close();
 }
}finally{await browser.close()}
