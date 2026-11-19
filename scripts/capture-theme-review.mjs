import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base=process.env.SU_VISUAL_BASE||'http://127.0.0.1:8765';
const themes=['classic','modern','amethyst','ruby','crystal','abyssal','original'];
const browser=await chromium.launch({headless:true});
await mkdir('artifacts/theme-review',{recursive:true});
try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1,serviceWorkers:'block'});
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
  // Validate the new classic views before testing legacy disclosures.
  await expect(page.locator('.su-classic-hero')).toBeVisible();
  // Verify real WebGL output where supported, and fallback otherwise.
  const art=page.locator('.su-classic-art');
  await expect(art).toBeVisible();
  const supportsGL=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl'));
  if(supportsGL){
   const canvas=art.locator('canvas.su-die-webgl');
   await expect(canvas).toBeVisible();
   await expect.poll(()=>canvas.evaluate(c=>c.width>0&&c.height>0&&getComputedStyle(c.parentElement.querySelector('svg')).opacity==='0')).toBe(true);
   await page.emulateMedia({reducedMotion:'reduce'});
   await expect(canvas).toBeVisible();
   await page.emulateMedia({reducedMotion:'no-preference'});
  }else{
   await expect(art.locator('svg')).toBeVisible();
  }

  await expect(page.locator('#form')).toBeHidden();
  await expect(page.locator('#privacidade')).toBeHidden();
  if(width===390){
   const menu=page.locator('.su-classic-menu-button');
   await expect(menu).toBeVisible();
   await menu.click();
   await expect(menu).toHaveAttribute('aria-expanded','true');
   await expect(page.locator('.su-classic-menu')).toBeVisible();
  }
  for(const [hash,view,target] of [
   ['su-home-quick-draw','draw','#draw'],['ajuda','help','#ajuda'],
   ['privacidade','privacy','#privacidade'],['su-plans','plans','#su-plans'],
   ['conta','account','#conta'],['roomStudio','rooms','#roomStudio'],
   ['su-home-history','history','#su-home-history']
  ]){
   await page.goto(base+'/?suTheme=classic#'+hash,{waitUntil:'domcontentloaded'});
   await expect(page.locator('main.wrap')).toHaveAttribute('data-su-view',view);
   await expect(page.locator(target)).toBeVisible();
   await expect(page.locator('.su-home-directory')).toBeHidden();
   await page.locator('.su-classic-back').click();
   await expect(page.locator('.su-home-directory')).toBeVisible();
  }
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const banner=page.locator('.su-classic-room-banner');
  await expect(banner).toBeVisible();
  await banner.locator('a').click();
  await expect(page.locator('#roomStudio')).toBeVisible();
  await page.screenshot({path:'artifacts/theme-review/classic-rooms-'+width+'.png',fullPage:true});
  await page.goto(base+'/?suTheme=classic#conta',{waitUntil:'domcontentloaded'});
  const sidebar=page.locator('.su-classic-account-nav');
  await expect(sidebar).toBeHidden();
  await expect(sidebar.locator('a[href="#conta"]')).toHaveAttribute('aria-current','page');
  await page.screenshot({path:'artifacts/theme-review/classic-account-'+width+'.png',fullPage:true});
  await page.locator('.su-classic-profile').click();
  await page.locator('#su-profile-popover a[href="#su-home-history"]').click();
  await expect(page.locator('#su-home-history')).toBeVisible();
  await page.goto(base+'/roleta-online/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const wheelFrame=page.frameLocator('#sorteador-embed');
  await wheelFrame.locator('#items').fill('Ana\nBruno\nCarlos');
  await expect(wheelFrame.locator('#wheelZone')).toBeVisible();
  const geometry=await wheelFrame.locator('.panel').evaluate(panel=>{
   const rect=s=>{const e=panel.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width};};
   return {viewport:innerWidth,items:rect('#items'),wheel:rect('#wheelZone'),options:rect('#winners'),overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  if(geometry.overflow)throw new Error('Classic wheel horizontal overflow at '+width);
  if(geometry.viewport>=1000){
   if(!geometry.items||!geometry.wheel||!geometry.options||geometry.items.right>geometry.wheel.x+2||geometry.wheel.right>geometry.options.x+2)throw new Error('Classic wheel columns overlap or are out of order: '+JSON.stringify(geometry));
  }
  await wheelFrame.locator('#spin').click();
  await expect(wheelFrame.locator('#wheelWinner')).toBeVisible({timeout:15000});
  await expect(wheelFrame.locator('#wheelWinnerName')).toHaveText(/^(Ana|Bruno|Carlos)$/);

  await page.screenshot({path:'artifacts/theme-review/classic-wheel-'+width+'.png',fullPage:true});
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.su-room-toggle')).toBeHidden();
  await expect(page.locator('.su-account-toggle')).toBeHidden();
  await expect(page.locator('.su-history-toggle')).toBeHidden();
  await expect(page.locator('#conta')).toBeHidden();
  await expect(page.locator('#su-home-history')).toBeHidden();
  const profile=page.locator('.su-classic-profile');
  await expect(profile).toBeVisible();
  await profile.focus();
  await expect(profile).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#su-profile-popover')).toBeVisible();
  await expect(page.locator('#conta')).toBeHidden();
  await page.screenshot({path:'artifacts/theme-review/classic-profile-menu-'+width+'.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#su-profile-popover')).toBeHidden();
  await expect(profile).toBeFocused();
  await profile.click();
  await page.locator('#su-profile-popover a[href="#conta"]').click();
  await expect(page.locator('#conta')).toBeVisible();
  await expect(page.locator('#accountEmail')).toBeVisible();
  const authArt=page.locator('.su-auth-die');
  await expect(authArt).toBeVisible();
  await expect(authArt).toHaveAttribute('data-su-die-render','validated',{timeout:15000});
  const artBounds=await authArt.boundingBox(), heroBounds=await page.locator('.su-auth-hero').boundingBox();
  if(!artBounds||!heroBounds||artBounds.x<heroBounds.x-1||artBounds.y<heroBounds.y-1||artBounds.x+artBounds.width>heroBounds.x+heroBounds.width+1||artBounds.y+artBounds.height>heroBounds.y+heroBounds.height+1)throw Error('Login die clipped by hero');
  await expect(page.locator('#accountPassword')).toHaveAttribute('type','password');
  await page.locator('.su-auth-reveal').click();
  await expect(page.locator('#accountPassword')).toHaveAttribute('type','text');
  await page.locator('.su-auth-reveal').click();
  await expect(page.locator('#accountPassword')).toHaveAttribute('type','password');
  await page.screenshot({path:'artifacts/theme-review/classic-login-'+width+'.png',fullPage:true});

  // Recovery UI contracts: simulated API only, no actual email delivery.
  const recovery=page.locator('dialog.su-recovery');
  const forgot=page.getByRole('button',{name:'Esqueceu sua senha?'});
  const recoveryEmail=recovery.locator('input[type=email]');
  const recoveryPassword=recovery.locator('input[type=password]');
  const recoveryStatus=recovery.getByRole('status');
  let requestCount=0,resetCount=0;
  await page.route('**/api/password/request',async route=>{
   requestCount++;
   await route.fulfill({json:{ok:true,message:'Se houver uma conta elegível, enviaremos instruções por e-mail.'}});
  });
  await page.route('**/api/password/reset',async route=>{
   resetCount++;
   await route.fulfill(resetCount===1?{status:400,json:{error:'Link inválido ou expirado.'}}:{json:{ok:true}});
  });
  await page.locator('#accountEmail').fill('review@example.test');
  await forgot.focus();
  await page.keyboard.press('Enter');
  await expect(recovery).toBeVisible();
  await expect(recoveryEmail).toBeFocused();
  await expect(recoveryEmail).toHaveValue('review@example.test');
  await expect(recoveryPassword).toBeHidden();
  const recoveryBounds=await recovery.boundingBox();
  if(!recoveryBounds||recoveryBounds.x<0||recoveryBounds.x+recoveryBounds.width>width+1)throw Error('Recovery dialog overflows viewport');
  await page.screenshot({path:'artifacts/theme-review/classic-recovery-'+width+'.png'});
  await recovery.getByRole('button',{name:'Enviar instruções'}).click();
  await expect(recoveryStatus).toContainText('Se houver uma conta');
  if(requestCount!==1)throw Error('Unexpected recovery request count');
  await page.keyboard.press('Escape');
  await expect(recovery).toBeHidden();
  await expect(forgot).toBeFocused();
  await page.goto(base+'/?suTheme=classic#su-reset='+'a'.repeat(64),{waitUntil:'domcontentloaded'});
  await expect(recovery).toBeVisible();
  await expect(page).toHaveURL(url=>url.hash==='#conta');
  await expect(recoveryPassword).toBeFocused();
  await expect(recoveryEmail).toBeHidden();
  await recoveryPassword.fill('Valid-password-123');
  await recovery.getByRole('button',{name:'Redefinir senha'}).click();
  await expect(recoveryStatus).toHaveText('Link inválido ou expirado.');
  await recovery.getByRole('button',{name:'Redefinir senha'}).click();
  await expect(recoveryStatus).toContainText('Senha redefinida.');
  await expect(recoveryPassword).toBeDisabled();
  await expect(recovery.getByRole('button',{name:'Redefinir senha'})).toBeHidden();
  await page.screenshot({path:'artifacts/theme-review/classic-reset-success-'+width+'.png'});
  await recovery.getByRole('button',{name:'Voltar'}).click();
  await expect(recovery).toBeHidden();
  await expect(page.locator('#accountEmail')).toBeVisible();
  await page.unroute('**/api/password/request');
  await page.unroute('**/api/password/reset');


  await expect(page.locator('#conta .account-top')).toBeHidden();
  await expect(page.locator('#su-profile-popover')).toBeHidden();
  await profile.click();
  await page.locator('#su-profile-popover a[href="#su-home-history"]').click();
  await expect(page.locator('#su-home-history')).toBeVisible();
  await page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clear').click();
  await page.locator('.su-classic-back').click();
  await expect(page.locator('#su-home-history')).toBeHidden();
  if(width===390){
   const menu=page.locator('.su-classic-menu-button');
   await menu.focus();
   await page.keyboard.press('Space');
   await expect(menu).toHaveAttribute('aria-expanded','true');
   const drawer=page.locator('.su-classic-menu');
   await expect(drawer.locator('#su-home-theme')).toBeVisible();
   const bounds=await drawer.boundingBox();
   if(!bounds||Math.abs(bounds.x)>2)throw Error('Drawer is not left aligned');
   await page.screenshot({path:'artifacts/theme-review/classic-drawer-'+width+'.png'});
   await drawer.locator('.su-classic-menu-close').focus();
   await page.keyboard.press('Escape');
   await expect(menu).toBeFocused();
   await expect(menu).toHaveAttribute('aria-expanded','false');
  }
  const firstTool=page.locator('.su-home-grid a').first();
  await firstTool.focus();
  await expect(firstTool).toBeFocused();
  const toolFocus=await firstTool.evaluate(el=>{
   const style=getComputedStyle(el);
   return style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=2;
  });
  if(!toolFocus)throw new Error('Tool catalog keyboard focus indicator missing at '+width+'px');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(url=>url.pathname==='/sortear-nomes/');
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
  for(const slug of [
   'sortear-nomes','sortear-numeros','sortear-equipes','roleta-online',
   'sorteio-rifa-online','cara-ou-coroa-online','sortear-aluno-online',
   'dividir-turma-em-grupos'
  ]){
   await page.goto(base+'/'+slug+'/?suTheme=abyssal',{waitUntil:'domcontentloaded'});
   await expect(page).toHaveURL(url=>url.pathname==='/'+slug+'/');
   await expect(page.locator('body')).toHaveAttribute('data-su-theme','abyssal');
   const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
   if(!canonical||new URL(canonical,base).pathname!=='/'+slug+'/')throw new Error('Incorrect canonical for '+slug+': '+canonical);
   const tool=page.frameLocator('#sorteador-embed');
   await expect(tool.locator('body')).toHaveAttribute('data-su-theme','abyssal',{timeout:15000});
   await expect(tool.locator('#draw')).toBeVisible();
   const frame=page.locator('#sorteador-embed');
   await expect.poll(()=>frame.evaluate(el=>{
    const content=el.contentDocument?.querySelector('main.wrap');
    return !!content&&Math.abs(el.clientHeight-Math.max(640,Math.min(12000,Math.ceil(content.getBoundingClientRect().bottom+el.contentWindow.scrollY+12))))<=4;
   })).toBe(true);
   // A taller legacy inline height must not feed back into intrinsic sizing.
   const before=await frame.evaluate(el=>el.clientHeight);
   await frame.evaluate(el=>{el.style.height='12000px'});
   await expect.poll(()=>frame.evaluate(el=>el.clientHeight)).toBe(before);

  }
  await page.goto(base+'/sortear-nomes/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const embedded=page.frameLocator('#sorteador-embed');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-theme','classic');
  await embedded.locator('body').evaluate(body=>{body.dataset.suVisualPersistence='kept';});
  const inputState=await embedded.locator('input:not([type="hidden"]),textarea').first().evaluate(el=>{
   const marker='su-theme-persistence-check';
   el.value=marker;
   el.dispatchEvent(new Event('input',{bubbles:true}));
   return {id:el.id,marker};
  });
  await page.locator('.su-nav select').selectOption('ruby');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-theme','ruby');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-visual-persistence','kept');
  const retained=await embedded.locator('input:not([type="hidden"]),textarea').first().inputValue();
  if(retained!==inputState.marker)throw new Error('Theme change cleared entered draw data at '+width+'px');
  for(const theme of ['abyssal','original','classic']){
   await page.locator('.su-nav select').selectOption(theme);
   await expect(embedded.locator('body')).toHaveAttribute('data-su-theme',theme);
   await expect(embedded.locator('body')).toHaveAttribute('data-su-visual-persistence','kept');
   const current=await embedded.locator('input:not([type="hidden"]),textarea').first().inputValue();
   if(current!==inputState.marker)throw new Error('Theme sequence cleared entered draw data: '+theme+' at '+width+'px');
  }
  // Exercise an actual guest draw and verify its result after switching appearance.
  await embedded.locator('#items').fill('Ana');
  await embedded.locator('#winners').fill('1');
  await embedded.locator('#draw').click();
  await expect(embedded.locator('#result')).toContainText('Ana');
  await page.locator('.su-nav select').selectOption('amethyst');
  await expect(embedded.locator('body')).toHaveAttribute('data-su-theme','amethyst');
  await expect(embedded.locator('#result')).toContainText('Ana');
  await expect(embedded.locator('#items')).toHaveValue('Ana');
  await page.goto(base+'/?suTheme=classic',{waitUntil:'domcontentloaded'});
  const consent=page.locator('#su-analytics-choice');
  await expect(consent).toBeVisible();
  await expect(consent.getByRole('button',{name:'Aceitar análise'})).toBeVisible();
  const reject=consent.getByRole('button',{name:'Recusar análise'});
  await expect(reject).toBeVisible();
  if(width===390){
   const bounds=await consent.boundingBox();
   if(!bounds||bounds.height>220)throw new Error('Mobile consent exceeds compact height budget');
  }
  await reject.click();
  await expect(consent).toHaveCount(0);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(consent).toHaveCount(0);
  const analytics=await page.evaluate(()=>({choice:localStorage.getItem('su-ga4-consent-v1'),loaded:!!window.__suGa4Loaded}));
  if(analytics.choice!=='rejected'||analytics.loaded)throw new Error('Analytics refusal was not respected');
  await page.close();
 }
}finally{await browser.close()}
