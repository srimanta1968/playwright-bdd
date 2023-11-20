import { TestInfo, test as base } from '@playwright/test';
import { loadConfig as loadCucumberConfig } from '../cucumber/loadConfig';
import { loadSteps } from '../cucumber/loadSteps';
import { BddWorld, BddWorldFixtures, getWorldConstructor } from './bddWorld';
import { extractCucumberConfig } from '../config';
import { getConfigFromEnv } from '../config/env';
import { TestTypeCommon } from '../playwright/types';
import { appendDecoratorSteps } from '../stepDefinitions/decorators/steps';
import { getPlaywrightConfigDir } from '../config/dir';
import { runScenarioHooks } from '../hooks/scenario';
import { runWorkerHooks } from '../hooks/worker';
import { IRunConfiguration, ISupportCodeLibrary } from '@cucumber/cucumber/api';

// BDD fixtures prefixed with '$' to avoid collision with user's fixtures.

export type BddFixtures = {
  // fixtures injected into BddWorld:
  // empty object for pw-style, builtin fixtures for cucumber-style
  $bddWorldFixtures: BddWorldFixtures;
  $bddWorld: BddWorld;
  Given: BddWorld['invokeStep'];
  When: BddWorld['invokeStep'];
  Then: BddWorld['invokeStep'];
  And: BddWorld['invokeStep'];
  But: BddWorld['invokeStep'];
  $tags: string[];
  $test: TestTypeCommon;
  $scenarioHookFixtures: Record<string, unknown>;
  $before: void;
  $after: void;
};

type BddFixturesWorker = {
  $cucumber: {
    runConfiguration: IRunConfiguration;
    supportCodeLibrary: ISupportCodeLibrary;
    World: typeof BddWorld;
  };
  $workerHookFixtures: Record<string, unknown>;
  $beforeAll: void;
  $afterAll: void;
};

export const test = base.extend<BddFixtures, BddFixturesWorker>({
  // load cucumber once per worker (auto-fixture)
  // todo: maybe remove caching in cucumber/loadConfig.ts and cucumber/loadSteps.ts
  // as we call it once per worker. Check generation phase.
  $cucumber: [
    async ({}, use, workerInfo) => {
      const config = getConfigFromEnv(workerInfo.project.testDir);
      const environment = { cwd: getPlaywrightConfigDir() };
      const { runConfiguration } = await loadCucumberConfig(
        {
          provided: extractCucumberConfig(config),
        },
        environment,
      );

      const supportCodeLibrary = await loadSteps(runConfiguration, environment);
      appendDecoratorSteps(supportCodeLibrary);
      const World = getWorldConstructor(supportCodeLibrary);

      await use({ runConfiguration, supportCodeLibrary, World });
    },
    { auto: true, scope: 'worker' },
  ],
  // init $bddWorldFixtures with empty object, will be owerwritten in test file for cucumber-style
  $bddWorldFixtures: ({}, use) => use({} as BddWorldFixtures),
  $bddWorld: async ({ $tags, $test, $bddWorldFixtures, $cucumber }, use, testInfo) => {
    const { runConfiguration, supportCodeLibrary, World } = $cucumber;
    const world = new World({
      testInfo,
      supportCodeLibrary,
      $tags,
      $test,
      $bddWorldFixtures,
      parameters: runConfiguration.runtime.worldParameters || {},
      log: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      attach: async () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
    });
    await world.init();
    await use(world);
    await world.destroy();
  },

  Given: ({ $bddWorld }, use) => use($bddWorld.invokeStep),
  When: ({ $bddWorld }, use) => use($bddWorld.invokeStep),
  Then: ({ $bddWorld }, use) => use($bddWorld.invokeStep),
  And: ({ $bddWorld }, use) => use($bddWorld.invokeStep),
  But: ({ $bddWorld }, use) => use($bddWorld.invokeStep),

  // init $tags with empty array, can be owerwritten in test file
  $tags: ({}, use) => use([]),
  // init $test with base test, but it will be always overwritten in test file
  $test: ({}, use) => use(base),

  // can be owerwritten in test file if there are scenario hooks
  $scenarioHookFixtures: ({}, use) => use({}),
  $before: [
    // Unused dependencies are important:
    // 1. $beforeAll / $afterAll: in pw < 1.39 worker-scoped auto-fixtures were called after test-scoped
    // 2. $after: to call after hooks in case of errors in before hooks
    async (
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      { $scenarioHookFixtures, $bddWorld, $tags, $beforeAll, $afterAll, $after },
      use,
      $testInfo,
    ) => {
      await runScenarioHooks('before', { $bddWorld, $tags, $testInfo, ...$scenarioHookFixtures });
      await use();
    },
    { auto: true },
  ],
  $after: [
    async ({ $scenarioHookFixtures, $bddWorld, $tags }, use, $testInfo) => {
      await use();
      await runScenarioHooks('after', { $bddWorld, $tags, $testInfo, ...$scenarioHookFixtures });
    },
    { auto: true },
  ],

  // can be owerwritten in test file if there are worker hooks
  $workerHookFixtures: [({}, use) => use({}), { scope: 'worker' }],
  $beforeAll: [
    // Important unused dependencies:
    // 1. $afterAll: in pw < 1.39 worker-scoped auto-fixtures are called in incorrect order
    // 2. $cucumber: to load hooks before this fixtures
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async ({ $workerHookFixtures, $cucumber }, use, $workerInfo) => {
      await runWorkerHooks('beforeAll', { $workerInfo, ...$workerHookFixtures });
      await use();
    },
    { auto: true, scope: 'worker' },
  ],
  $afterAll: [
    async ({ $workerHookFixtures }, use, $workerInfo) => {
      await use();
      await runWorkerHooks('afterAll', { $workerInfo, ...$workerHookFixtures });
    },
    { auto: true, scope: 'worker' },
  ],
});

/** these fixtures automatically injected into every step call */
export type BddAutoInjectFixtures = Pick<BddFixtures, '$test' | '$tags'> & {
  $testInfo: TestInfo;
};

const BDD_AUTO_INJECT_FIXTURES: (keyof BddAutoInjectFixtures)[] = ['$testInfo', '$test', '$tags'];

export function isBddAutoInjectFixture(name: string) {
  return BDD_AUTO_INJECT_FIXTURES.includes(name as keyof BddAutoInjectFixtures);
}
