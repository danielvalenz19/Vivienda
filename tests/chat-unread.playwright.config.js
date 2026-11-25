'use strict';
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:__dirname,testMatch:'chat-unread.e2e.spec.js',timeout:30000,workers:1,reporter:'list',outputDir:`../test-results/chat-unread-${process.pid}`,use:{headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}}});
