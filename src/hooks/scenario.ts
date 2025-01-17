/**
 * Scenario level hooks: Before / After.
 */

/* eslint-disable max-depth */

import parseTagsExpression from '@cucumber/tag-expressions';
import { KeyValue, PlaywrightLocation, TestTypeCommon } from '../playwright/types';
import { fixtureParameterNames } from '../playwright/fixtureParameterNames';
import { callWithTimeout } from '../utils';
import { getLocationByOffset } from '../playwright/getLocationInFile';
import { runStepWithLocation } from '../playwright/runStepWithLocation';
import { BddContext } from '../run/bddFixtures/test';
import { getBddAutoInjectFixtures, isBddAutoInjectFixture } from '../run/bddFixtures/autoInject';

export type ScenarioHookType = 'before' | 'after';

type ScenarioHookOptions = {
  name?: string;
  tags?: string;
  timeout?: number;
};

type ScenarioHookFixtures = {
  $bddContext: BddContext;
  [key: string]: unknown;
};

type ScenarioHookFn<Fixtures, World> = (this: World, fixtures: Fixtures) => unknown;

type ScenarioHook<Fixtures, World> = {
  type: ScenarioHookType;
  options: ScenarioHookOptions;
  fn: ScenarioHookFn<Fixtures, World>;
  tagsExpression?: ReturnType<typeof parseTagsExpression>;
  location: PlaywrightLocation;
  customTest?: TestTypeCommon;
};

/**
 * When calling Before() / After() you can pass:
 * 1. hook fn
 * 2. tags string + hook fn
 * 3. options object + hook fn
 *
 * See: https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/api_reference.md#afteroptions-fn
 */
type ScenarioHookDefinitionArgs<Fixtures, World> =
  | [ScenarioHookFn<Fixtures, World>]
  | [NonNullable<ScenarioHookOptions['tags']>, ScenarioHookFn<Fixtures, World>]
  | [ScenarioHookOptions, ScenarioHookFn<Fixtures, World>];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GeneralScenarioHook = ScenarioHook<any, any>;

const scenarioHooks: GeneralScenarioHook[] = [];

/**
 * Returns Before() / After() functions.
 */
export function scenarioHookFactory<
  TestFixtures extends KeyValue,
  WorkerFixtures extends KeyValue,
  World,
>(type: ScenarioHookType, customTest: TestTypeCommon | undefined) {
  type AllFixtures = TestFixtures & WorkerFixtures;
  type Args = ScenarioHookDefinitionArgs<AllFixtures, World>;

  return (...args: Args) => {
    addHook({
      type,
      options: getOptionsFromArgs(args) as ScenarioHookOptions,
      fn: getFnFromArgs(args) as ScenarioHookFn<AllFixtures, World>,
      // offset = 3 b/c this call is 3 steps below the user's code
      location: getLocationByOffset(3),
      customTest,
    });
  };
}

// eslint-disable-next-line visual/complexity
export async function runScenarioHooks(type: ScenarioHookType, fixtures: ScenarioHookFixtures) {
  const hooksToRun = getScenarioHooksToRun(type, fixtures.$bddContext.tags);

  let error;
  for (const hook of hooksToRun) {
    try {
      await runScenarioHook(hook, fixtures);
    } catch (e) {
      if (type === 'before') throw e;
      if (!error) error = e;
    }
  }
  if (error) throw error;
}

async function runScenarioHook(hook: GeneralScenarioHook, fixtures: ScenarioHookFixtures) {
  const hookFn = wrapHookFn(hook, fixtures);
  await runStepWithLocation(
    fixtures.$bddContext.test,
    hook.options.name || '',
    hook.location,
    hookFn,
  );
}

export function getScenarioHooksFixtureNames(hooks: GeneralScenarioHook[]) {
  const fixtureNames = new Set<string>();

  hooks.forEach((hook) => {
    const hookFixtureNames = fixtureParameterNames(hook.fn);
    hookFixtureNames.forEach((fixtureName) => fixtureNames.add(fixtureName));
  });

  return [...fixtureNames].filter((name) => !isBddAutoInjectFixture(name));
}

export function getScenarioHooksToRun(type: ScenarioHookType, tags: string[] = []) {
  return scenarioHooks
    .filter((hook) => hook.type === type)
    .filter((hook) => !hook.tagsExpression || hook.tagsExpression.evaluate(tags));
}

/**
 * Wraps hook fn with timeout.
 */
function wrapHookFn(hook: GeneralScenarioHook, fixtures: ScenarioHookFixtures) {
  const { timeout } = hook.options;
  const { $bddContext } = fixtures;
  const fixturesArg = {
    ...fixtures,
    ...getBddAutoInjectFixtures($bddContext),
  };

  return async () => {
    await callWithTimeout(
      () => hook.fn.call($bddContext.world, fixturesArg),
      timeout,
      getTimeoutMessage(hook),
    );
  };
}

function getOptionsFromArgs(args: unknown[]) {
  if (typeof args[0] === 'string') return { tags: args[0] };
  if (typeof args[0] === 'object') return args[0];
  return {};
}

function getFnFromArgs(args: unknown[]) {
  return args.length === 1 ? args[0] : args[1];
}

function setTagsExpression(hook: GeneralScenarioHook) {
  if (hook.options.tags) {
    hook.tagsExpression = parseTagsExpression(hook.options.tags);
  }
}

function addHook(hook: GeneralScenarioHook) {
  setTagsExpression(hook);
  if (hook.type === 'before') {
    scenarioHooks.push(hook);
  } else {
    // 'after' hooks run in reverse order
    scenarioHooks.unshift(hook);
  }
}

function getTimeoutMessage(hook: GeneralScenarioHook) {
  const { timeout, name: hookName } = hook.options;
  return `${hook.type} hook ${hookName ? `"${hookName}" ` : ''}timeout (${timeout} ms)`;
}
