/**
 * Define steps via decorators.
 */

/* eslint-disable @typescript-eslint/no-unsafe-function-type */

import { PomNode } from './pomGraph';
import { isBddAutoInjectFixture } from '../../run/bddFixtures/autoInject';
import { getLocationByOffset } from '../../playwright/getLocationInFile';
import { registerStepDefinition } from '../stepRegistry';
import { StepPattern, GherkinStepKeyword, StepDefinitionOptions } from '../stepDefinition';

// initially we store step data inside method,
// and then extract it in @Fixture decorator call
const decoratedStepSymbol = Symbol('decoratedStep');
type DecoratedMethod = Function & { [decoratedStepSymbol]: StepDefinitionOptions };

/**
 * Creates @Given, @When, @Then decorators.
 */
export function createStepDecorator(keyword: GherkinStepKeyword) {
  return (pattern: StepPattern) => {
    // offset = 3 b/c this call is 3 steps below the user's code
    const location = getLocationByOffset(3);
    // context parameter is required for decorator by TS even though it's not used
    return (method: StepDefinitionOptions['fn'], _context: ClassMethodDecoratorContext) => {
      saveStepConfigToMethod(method, {
        keyword,
        pattern,
        location,
        fn: method,
      });
    };
  };
}

export function linkStepsWithPomNode(Ctor: Function, pomNode: PomNode) {
  if (!Ctor?.prototype) return;
  const propertyDescriptors = Object.getOwnPropertyDescriptors(Ctor.prototype);
  return Object.values(propertyDescriptors).forEach((descriptor) => {
    const stepOptions = getStepOptionsFromMethod(descriptor);
    if (!stepOptions) return;
    stepOptions.pomNode = pomNode;
    registerDecoratorStep(stepOptions);
  });
}

// todo: link decorator steps with customTest!

function registerDecoratorStep(stepOptions: StepDefinitionOptions) {
  const { fn } = stepOptions;

  registerStepDefinition({
    ...stepOptions,
    fn: (fixturesArg: Record<string, unknown>, ...args: unknown[]) => {
      const fixture = getFirstNonAutoInjectFixture(fixturesArg, stepOptions);
      return fn.call(fixture, ...args);
    },
  });
}

function getFirstNonAutoInjectFixture(
  fixturesArg: Record<string, unknown>,
  { pattern }: StepDefinitionOptions,
) {
  // there should be exactly one suitable fixture in fixturesArg
  const fixtureNames = Object.keys(fixturesArg).filter(
    (fixtureName) => !isBddAutoInjectFixture(fixtureName),
  );

  if (fixtureNames.length === 0) {
    throw new Error(`No suitable fixtures found for decorator step "${pattern}"`);
  }

  if (fixtureNames.length > 1) {
    throw new Error(`Several suitable fixtures found for decorator step "${pattern}"`);
  }

  return fixturesArg[fixtureNames[0]];
}

function saveStepConfigToMethod(
  method: StepDefinitionOptions['fn'],
  stepConfig: StepDefinitionOptions,
) {
  (method as unknown as DecoratedMethod)[decoratedStepSymbol] = stepConfig;
}

function getStepOptionsFromMethod(descriptor: PropertyDescriptor) {
  // filter out getters / setters
  return typeof descriptor.value === 'function'
    ? (descriptor.value as DecoratedMethod)[decoratedStepSymbol]
    : undefined;
}
