import { chromium, expect } from '@playwright/test';
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
    if(name==='seo'){
     const embedded=page.frameLocator('#sorteador-embed');
     await expect(embedded.locator('body')).toHaveAttribute('data-su-theme',theme,{timeout:15000});
     await expect(embedded.locator('body')).toHaveClass(/su-home-themed/);
    }
    await page.screenshot({path:'artifacts/theme-review/'+name+'-'+theme+'-'+width+'.png',fullPage:true,animations:'disabled'});
    await page.screenshot({path:'artifacts/theme-review/'+name+'-'+theme+'-'+width+'-viewport.png',fullPage:false,animations:'disabled'});
   }
  }
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const roomToggle=page.locator('.su-room-toggle');
  const roomPanel=page.locator('#roomStudio');
  await expect(roomToggle).toHaveAttribute('aria-expanded','false');
  await expect(roomPanel).toBeHidden();
  await roomToggle.click();
  await expect(roomToggle).toHaveAttribute('aria-expanded','true');
  await expect(roomPanel).toBeVisible();
  await roomToggle.click();
  await expect(roomPanel).toBeHidden();
  await page.locator('#roomActive').evaluate(el=>{el.hidden=false});
  await expect(roomPanel).toBeVisible();
  await expect(roomToggle).toHaveAttribute('aria-expanded','true');
  await page.locator('#roomActive').evaluate(el=>{el.hidden=true});
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const accountToggle=page.locator('.su-account-toggle');
  const accountPanel=page.locator('#conta');
  await expect(accountToggle).toHaveAttribute('aria-expanded','false');
  await expect(accountPanel).toBeHidden();
  await accountToggle.click();
  await expect(accountPanel).toBeVisible();
  await accountToggle.click();
  await expect(accountPanel).toBeHidden();
  await page.locator('#accountMember').evaluate(el=>{el.hidden=false});
  await expect(accountPanel).toBeVisible();
  await expect(accountToggle).toHaveAttribute('aria-expanded','true');
  await page.goto(base+'/?suTheme=classic#conta',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#conta')).toBeVisible();
  await page.goto(base+'/sortear-nomes/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const embedded=page.frameLocator('#sorteador-embed');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-theme','classic');
  await embedded.locator('body').evaluate(body=>{body.dataset.suVisualPersistence='kept';});
  await page.locator('.su-nav select').selectOption('ruby');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-theme','ruby');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-visual-persistence','kept');
  await page.close();
 }
}finally{await browser.close()}
