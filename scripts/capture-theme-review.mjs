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
    if(name==='home'&&theme!=='original'){
     const contrast=await page.locator('header h1').evaluate(el=>{
      const parse=value=>{
       const parts=value.match(/[\\d.]+/g)?.map(Number)||[];
       return parts.slice(0,3);
      };
      const luminance=rgb=>{
       const values=rgb.map(value=>{
        const s=value/255;
        return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;
       });
       return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
      };
      const color=getComputedStyle(el).color;
      let background=el;
      let bg='rgb(255, 255, 255)';
      while(background){
       const style=getComputedStyle(background);
       const match=style.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
       if(match){
        const values=match[1].split(',').map(Number);
        if(values.length===3||values[3]>=0.99){bg=style.backgroundColor;break}
       }
       background=background.parentElement;
      }
      const l1=luminance(parse(color)),l2=luminance(parse(bg));
      return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
     });
     if(contrast<4.5)throw new Error('Insufficient homepage title contrast: '+theme+' at '+width+'px ('+contrast.toFixed(2)+':1)');
    }
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
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const historyToggle=page.locator('.su-history-toggle');
  const historyPanel=page.locator('#su-home-history');
  const initiallyExpanded=await historyToggle.getAttribute('aria-expanded')==='true';
  if(initiallyExpanded){
   await expect(historyPanel).toBeVisible();
   await historyToggle.click();
   await expect(historyPanel).toBeHidden();
  }else{
   await expect(historyPanel).toBeHidden();
  }
  await historyToggle.click();
  await expect(historyPanel).toBeVisible();
  await historyToggle.click();
  await expect(historyPanel).toBeHidden();
  await page.locator('#history').evaluate(el=>{
   const item=document.createElement('li');item.textContent='Resultado de teste';el.append(item);
  });
  await expect(historyPanel).toBeVisible();
  await expect(historyToggle).toHaveAttribute('aria-expanded','true');
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  for(const [selector,panel] of [
   ['.su-room-toggle','#roomStudio'],
   ['.su-account-toggle','#conta'],
   ['.su-history-toggle','#su-home-history']
  ]){
   const button=page.locator(selector);
   await button.focus();
   await expect(button).toBeFocused();
   const focusVisible=await button.evaluate(el=>{
    const style=getComputedStyle(el);
    return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;
   });
   if(!focusVisible)throw new Error('Keyboard focus indicator missing on '+selector+' at '+width+'px');
   const previous=await button.getAttribute('aria-expanded');
   await page.keyboard.press('Enter');
   await expect(button).toHaveAttribute('aria-expanded',previous==='true'?'false':'true');
   if(previous==='false')await expect(page.locator(panel)).toBeVisible();
   else await expect(page.locator(panel)).toBeHidden();
   await page.keyboard.press('Enter');
   await expect(button).toHaveAttribute('aria-expanded',previous);
  }

  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const roomSpace=page.locator('.su-room-toggle');
  await roomSpace.focus();
  const beforeSpace=await roomSpace.getAttribute('aria-expanded');
  await page.keyboard.press('Space');
  await expect(roomSpace).toHaveAttribute('aria-expanded',beforeSpace==='true'?'false':'true');
  const firstTool=page.locator('.su-home-grid a').first();
  await firstTool.focus();
  await expect(firstTool).toBeFocused();
  const toolFocus=await firstTool.evaluate(el=>{
   const style=getComputedStyle(el);
   return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;
  });
  if(!toolFocus)throw new Error('Tool catalog keyboard focus indicator missing at '+width+'px');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\\/sortear-nomes\\//);
  await expect(page.locator('#sorteador-embed')).toBeVisible();
  await page.goto(base+'/?room=visual-contract&suTheme=ruby',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.su-home-directory')).toHaveCount(0);
  await expect(page.locator('.su-room-toggle')).toHaveCount(0);
  await page.goto(base+'/?incorporado=1&suTheme=amethyst',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.su-home-directory')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-su-theme','amethyst');
  await page.goto(base+'/?suTheme=classic#su-home-quick-draw',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#su-home-quick-draw')).toBeVisible();
  await expect(page.locator('.tabs .tab').first()).toBeVisible();
  await page.goto(base+'/sortear-numeros/?suTheme=crystal',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-su-theme','crystal');
  await expect(page.frameLocator('#sorteador-embed').locator('#draw')).toBeVisible();
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
