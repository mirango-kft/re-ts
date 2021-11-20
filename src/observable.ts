import { Observable, Subject, from, BehaviorSubject, merge, queueScheduler } from "rxjs";
import {
  map,
  observeOn,
  distinctUntilChanged,
  subscribeOn,
  mergeMap,
  takeUntil,
  filter,
} from "rxjs/operators";
import { Middleware, MiddlewareAPI, Dispatch } from "redux";

import { Action } from "./common";

type AsyncHandler<A extends Action<any, any>, T extends string, S> = (
  handlerActions$: Observable<Extract<A, { type: T }>>,
  state$: Observable<S>,
  actions$: Observable<A>
) => Observable<A>;

interface AsyncHandlerDefinition<A extends Action<any, any>, T extends string, S> {
  type: T;
  handler: AsyncHandler<A, T, S>;
}

type Epic<T extends string, A extends AsyncHandlerDefinition<any, any, any>> = Record<T, Array<A>>;

export function handleAsyncFactory<A extends Action<any, any>, S>() {
  function handleAsync<T extends string>(
    type: T,
    handler: AsyncHandler<A, T, S>
  ): AsyncHandlerDefinition<A, T, S> {
    return { type, handler };
  }
  return handleAsync;
}

type DefinitionActionType<D> = D extends AsyncHandlerDefinition<infer A, any, any>
  ? A["type"]
  : never;
type DefinitionStateType<D> = D extends AsyncHandlerDefinition<any, any, infer S> ? S : never;
type WithGenericType<D> = D extends AsyncHandlerDefinition<infer A, any, infer S>
  ? AsyncHandlerDefinition<A, A["type"], S>
  : never;

export function createEpic<D extends Array<AsyncHandlerDefinition<any, any, any>>>(
  ...definitions: D
) {
  type ResultEpic = Epic<DefinitionActionType<D[number]>, WithGenericType<D[number]>>;
  return definitions.reduce((result, definition) => {
    let definitionsForType: any = result[definition.type as keyof ResultEpic];
    if (!definitionsForType) {
      definitionsForType = [];
      result[definition.type as keyof ResultEpic] = definitionsForType;
    }
    definitionsForType.push(definition);
    return result;
  }, {} as ResultEpic);
}

export function combineEpics<T extends string, A extends AsyncHandlerDefinition<any, any, any>>(
  ...epics: Array<Epic<T, A>>
): Epic<T, A> {
  return epics.reduce((result, epic) => {
    for (const [type, definitions] of Object.entries(epic)) {
      let definitionsForType = result[type as keyof Epic<T, A>];
      if (!definitionsForType) {
        definitionsForType = [];
        result[type as keyof Epic<T, A>] = definitionsForType;
      }
      definitionsForType.push(...(definitions as any[]));
    }
    return result;
  }, {} as Epic<T, A>);
}

type RuntimeEpic<A extends Action<any, any>, S> = (state$: Observable<S>) => Observable<A>;

function makeRuntimeEpic<T extends string, D extends AsyncHandlerDefinition<any, any, any>>(
  epic: Epic<T, D>,
  actions$: Observable<Action<any, any>>
) {
  type ResultEpic = RuntimeEpic<DefinitionActionType<D>, DefinitionStateType<D>>;
  const handledActionSubjects = Object.keys(epic).reduce((actions, actionType) => {
    if (!actions[actionType]) {
      actions[actionType] = new Subject();
    }
    return actions;
  }, {} as { [key: string]: Subject<DefinitionActionType<D>> });
  const fallbackSubject = new Subject<DefinitionActionType<D>>();

  const actionSubscription = actions$.subscribe((action) => {
    const handler = handledActionSubjects[action.type] || fallbackSubject;
    handler.next(action as any);
  });

  const runtimeEpic: ResultEpic = (state$) => {
    const actionHandlers = Object.values(epic)
      .flatMap((handlers) => handlers)
      .map((definition: any) => {
        return definition.handler(
          handledActionSubjects[definition.type],
          state$,
          actions$
        ) as Observable<DefinitionActionType<D>>;
      });
    return merge(...actionHandlers);
  };

  return { runtimeEpic, cleanup: () => actionSubscription.unsubscribe() };
}

export const EPIC_END = "EPIC_END";

export function createEpicMiddleware<A extends Action<any, any>, S>() {
  const epic$ = new Subject<RuntimeEpic<A, S>>();
  const actions$ = new Subject<A>().pipe(observeOn(queueScheduler)) as Subject<A>;

  let store: MiddlewareAPI<Dispatch, S>;
  const epicMiddleware: Middleware<{}, S> = (store_) => {
    store = store_;

    const stateSubject$ = new BehaviorSubject<S>(store.getState()).pipe(
      observeOn(queueScheduler)
    ) as BehaviorSubject<S>;
    const state$ = stateSubject$.pipe(distinctUntilChanged());

    const result$ = epic$.pipe(
      map((epic) =>
        epic(state$).pipe(takeUntil(actions$.pipe(filter((action) => action.type === EPIC_END))))
      ),
      mergeMap((output$) =>
        from(output$).pipe(subscribeOn(queueScheduler), observeOn(queueScheduler))
      )
    );

    result$.subscribe(store.dispatch);

    return (next) => (action) => {
      const result = next(action);
      stateSubject$.next(store.getState());
      actions$.next(action);
      return result;
    };
  };

  let previousCleanup: () => void | undefined;
  const runMiddleware = (rootEpic: Epic<A["type"], AsyncHandlerDefinition<A, A["type"], S>>) => {
    const { runtimeEpic, cleanup } = makeRuntimeEpic(rootEpic, actions$);
    if (previousCleanup) {
      previousCleanup();
    }
    previousCleanup = cleanup;
    epic$.next(runtimeEpic);
  };
  return { epicMiddleware, runMiddleware };
}
