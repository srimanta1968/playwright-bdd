import { test as base } from '@playwright/test';
import { invokeStep } from './invokeStep';
import { loadConfig } from '../cucumber/config';
import { loadSteps } from '../cucumber/steps';
import { getWorldConstructor } from './world';

export const test = base.extend({
  cucumberWorld: async ({ page, context, browser, browserName, request }, use, testInfo) => {
    const { runConfiguration } = await loadConfig();
    const supportCodeLibrary = await loadSteps(runConfiguration);
    const World = getWorldConstructor(supportCodeLibrary);
    const world = new World({
      page,
      context,
      browser,
      browserName,
      request,
      testInfo,
      supportCodeLibrary,
      parameters: runConfiguration.runtime.worldParameters || {},
      log: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      attach: async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    });
    await world.init();
    await use(world);
    await world.destroy();
  },
  invokeStep: ({ cucumberWorld }, use) => use(invokeStep.bind(null, cucumberWorld)),
  Given: ({ invokeStep }, use) => use(invokeStep),
  When: ({ invokeStep }, use) => use(invokeStep),
  Then: ({ invokeStep }, use) => use(invokeStep),
  And: ({ invokeStep }, use) => use(invokeStep),
  But: ({ invokeStep }, use) => use(invokeStep),
});