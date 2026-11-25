'use strict';
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'gallery.e2e.spec.js',timeout:60000,workers:1,reporter:'list',outputDir:`../test-results/gallery-${process.pid}`,use:{headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},screenshot:'only-on-failure'}});
