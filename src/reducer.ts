import { Draft, produce, setAutoFreeze } from "immer";

import { Action, EmptyAction } from "./common";

setAutoFreeze(false);

export type CreateActionType<T extends ActionCreatorsMap> = {
  [K in keyof T]: ReturnType<T[K]>;
}[keyof T];

export function action<T extends string>(type: T): () => EmptyAction<T>;
export function action<T extends string, A extends any[], P>(
  type: T,
  payloadCreator: (...args: A) => P
): ActionCreator<T, A, P>;
export function action<T extends string, A extends any[]>(
  type: T,
  payloadCreator = (() => undefined) as any
) {
  return (...args: A) => ({ type, payload: payloadCreator(...args) });
}

export function createActions<T extends ActionCreatorsMap>(
  actionFactory: (actionCreator: typeof action) => T
): [T, ActionTypes<T>] {
  const actionTypes: Record<string, string> = {};
  const actionCreator = (type: string, payloadCreator: (...args: any[]) => any) => (
    properyName: string
  ) => {
    actionTypes[properyName] = type;
    return action(type, payloadCreator);
  };

  const actionProxies = actionFactory(actionCreator as any);
  const actions = Object.keys(actionProxies).reduce((acc, key) => {
    acc[key] = actionProxies[key](key);
    return acc;
  }, {} as Record<string, any>);

  return [actions, actionTypes] as [T, ActionTypes<T>];
}

export function makeLeafReducer<A extends CreateActionType<ActionCreatorsMap>>() {
  return <S>(initialState: S, handlers: ReducerHandlers<S, A>): ReducerDefiniton<S, A> => ({
    initialState,
    handlers
  });
}

export function makeRootReducer<T extends ReducerDefinitionMap, A extends ReducerMap>(
  definitions: T,
  additionalReducers = {} as A
) {
  const initialState = Object.entries(definitions).reduce((state, [key, { initialState }]) => {
    state[key as keyof T] = initialState;
    return state;
  }, {} as MakeStateFromDefinitionMap<T>);
  const handlersByAction = Object.entries(definitions).reduce(
    (handlers, [stateKey, definition]) => {
      for (const [actionType, actionHandler] of Object.entries(definition.handlers)) {
        if (!actionHandler) {
          return handlers;
        }

        let actionHandlers = handlers[actionType];
        if (!actionHandlers) {
          actionHandlers = [];
          handlers[actionType] = actionHandlers;
        }
        actionHandlers.push({ key: stateKey, handler: actionHandler });
      }
      return handlers;
    },
    {} as { [key: string]: Array<{ key: string; handler: Reducer<any> }> }
  );
  const fallbackHandlers = Object.entries(additionalReducers).reduce(
    (handlers, [stateKey, handler]) => {
      handlers.push({ key: stateKey, handler });
      return handlers;
    },
    [] as Array<{ key: string; handler: Reducer<any> }>
  );

  type State = MakeStateFromDefinitionMap<T> & { [K in keyof A]: ReturnType<A[K]> };
  type FallbackActions = {
    [K in keyof A]: A[K] extends Reducer<any, infer A> ? A : never;
  }[keyof A];
  return (
    state = initialState,
    action: MakeActionFromDefinitionMap<T> | FallbackActions
  ): State => {
    let nextState = state;
    let hasChanges = false;
    for (let i = 0; i < fallbackHandlers.length; i++) {
      const keyAndHandler = fallbackHandlers[i];
      const nextStateSlice = keyAndHandler.handler(nextState[keyAndHandler.key], action);
      if (nextStateSlice !== state[keyAndHandler.key]) {
        if (!hasChanges) {
          nextState = { ...state };
        }
        nextState[keyAndHandler.key as keyof typeof state] = nextStateSlice;
        hasChanges = true;
      }
    }

    nextState = hasChanges ? nextState : state;
    const handlers = handlersByAction[(action as any).type];
    if (!handlers) {
      return nextState as any;
    }

    return produce(nextState, (draft: any) => {
      for (let i = 0; i < handlers.length; i++) {
        const keyAndHandler = handlers[i];
        keyAndHandler.handler(draft[keyAndHandler.key], (action as any).payload);
      }
    }) as any;
  };
}

type ActionCreator<T extends string, A extends any[], P> = (...args: A) => Action<T, P>;
interface ActionCreatorsMap {
  [key: string]: ActionCreator<any, any, any>;
}
type ActionTypes<T extends ActionCreatorsMap> = { [K in keyof T]: ReturnType<T[K]>["type"] };
type ReducerHandlers<S, A extends CreateActionType<ActionCreatorsMap>> = {
  [K in A["type"]]?: (state: Draft<S>, payload: Extract<A, { type: K }>["payload"]) => void;
};

interface ReducerDefiniton<S, A extends CreateActionType<ActionCreatorsMap>> {
  initialState: S;
  handlers: ReducerHandlers<S, A>;
}

interface ReducerDefinitionMap {
  [key: string]: ReducerDefiniton<any, any>;
}

type Reducer<S, A = any> = (state: S, action: A) => S;

interface ReducerMap {
  [key: string]: Reducer<any>;
}

type ReducerActionType<R extends ReducerHandlers<any, any>> = R extends ReducerHandlers<
  any,
  infer A
>
  ? A
  : never;

type MakeStateFromDefinitionMap<T extends ReducerDefinitionMap> = {
  [K in keyof T]: T[K]["initialState"];
};

type MakeActionFromDefinitionMap<T extends ReducerDefinitionMap> = {
  [K in keyof T]: ReducerActionType<T[K]["handlers"]>;
}[keyof T];
