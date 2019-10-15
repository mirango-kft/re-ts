import { Draft, produce, setAutoFreeze } from "immer";

setAutoFreeze(false);

type ArgumentTypes<T> = T extends (...args: infer A) => any ? A : never;
type ReplaceReturnType<F, R> = (...args: ArgumentTypes<F>) => R;

type Something = object | string | number | boolean | symbol | bigint;
type EmptyAction<T extends string> = { readonly type: T; readonly payload?: undefined };
type PayloadAction<T extends string, P> = { readonly type: T; readonly payload: P };
type Action<T extends string, P = void> = P extends never ? EmptyAction<T> : PayloadAction<T, P>;
type ActionCreatorsMap = { [key: string]: (...args: any[]) => Action<any, any> };
type ActionTypes<T extends ActionCreatorsMap> = { [K in keyof T]: ReturnType<T[K]>["type"] };
type ReducerHandlers<S, A extends CreateActionType<ActionCreatorsMap>> = {
  [K in A["type"]]?: (state: Draft<S>, payload: Extract<A, { type: K }>["payload"]) => void
};

interface ReducerDefiniton<S, A extends CreateActionType<ActionCreatorsMap>> {
  initialState: S;
  handlers: ReducerHandlers<S, A>;
}

interface ReducerDefinitionMap {
  [key: string]: ReducerDefiniton<any, any>;
}

type Reducer<S> = (state: S, action: { type: any }) => S;

interface ReducerMap {
  [key: string]: Reducer<any>;
}

type ReducerActionType<R extends ReducerHandlers<any, any>> = R extends ReducerHandlers<any, infer A> ? A : never;

type MakeStateFromDefinitionMap<T extends ReducerDefinitionMap> = {
  [K in keyof T]: T[K]["initialState"];
};

type MakeActionFromDefinitionMap<T extends ReducerDefinitionMap> = {
  [K in keyof T]: ReducerActionType<T[K]["handlers"]>;
}[keyof T];

export type CreateActionType<T extends ActionCreatorsMap> = {
  [K in keyof T]: ReturnType<T[K]>
}[keyof T];

export function action<T extends string>(
  type: T
): () => { readonly type: T; readonly payload?: undefined };
export function action<T extends string, C extends (...args: any[]) => Something>(
  type: T,
  payloadCreator: C
): ReplaceReturnType<C, { type: T; payload: ReturnType<C> }>;
export function action<T extends string, C extends (...args: any[]) => Something>(
  type: T,
  payloadCreator = (() => undefined) as any
) {
  return (...args: ArgumentTypes<C>) => ({ type, payload: payloadCreator(...args) });
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
  const actions = Object.keys(actionProxies).reduce(
    (acc, key) => {
      acc[key] = actionProxies[key](key);
      return acc;
    },
    {} as Record<string, any>
  );

  return [actions, actionTypes] as [T, ActionTypes<T>];
}

export function makeLeafReducer<A extends CreateActionType<ActionCreatorsMap>>() {
  return <S>(initialState: S, handlers: ReducerHandlers<S, A>): ReducerDefiniton<S, A> => ({
    initialState,
    handlers,
  });
}

export function makeRootReducer<T extends ReducerDefinitionMap, A extends ReducerMap>(definitions: T, additionalReducers = {} as A) {
  const initialState = Object.entries(definitions).reduce((state, [key, { initialState }]) => {
    state[key as keyof T] = initialState;
    return state;
  }, {} as MakeStateFromDefinitionMap<T>);
  const handlersByAction = Object.entries(definitions).reduce((handlers, [stateKey, definition]) => {
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
  }, {} as { [key: string]: Array<{ key: string, handler: Reducer<any> }> });
  const additionalHandlers = Object.entries(additionalReducers).reduce((handlers, [reducerKey, handler]) => {
    handlers.push({ key: reducerKey, handler });
    return handlers;
  }, [] as Array<{ key: string; handler: Reducer<any> }>);
  return (state = initialState, action: MakeActionFromDefinitionMap<T>) => {
    return produce(state, draft => {
      for (let i = 0; i < additionalHandlers.length; i++) {
        const keyAndHandler = additionalHandlers[i];
        keyAndHandler.handler(draft[keyAndHandler.key], action);
      }

      const handlers = handlersByAction[action.type]
      if (!handlers) {
        return;
      }

      for (let i = 0; i < handlers.length; i++) {
        const keyAndHandler = handlers[i];
        keyAndHandler.handler(draft[keyAndHandler.key], action.payload);
      }
    }) as MakeStateFromDefinitionMap<T> & { [K in keyof A]: ReturnType<A[K]> };
  };
}
