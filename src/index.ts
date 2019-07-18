import { Draft, produce } from "immer";

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

export function makeReducer<A extends CreateActionType<ActionCreatorsMap>>() {
  return <S>(initialState: S, handlers: ReducerHandlers<S, A>) => {
    return (state = initialState, action: A) =>
      produce(state, draft => {
        const handler = handlers[action.type as A["type"]];
        if (handler) {
          handler(draft, action.payload);
        }
      });
  };
}
