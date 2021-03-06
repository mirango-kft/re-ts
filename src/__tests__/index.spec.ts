import { CreateActionType, action, createActions, makeLeafReducer, makeRootReducer } from "../reducer";
import { handleAsyncFactory, createEpic, combineEpics, createEpicMiddleware, EPIC_END } from "../observable";
import { switchMap } from "rxjs/operators";
import { createStore, applyMiddleware } from "redux";

describe("The action creators", () => {
  it("should create an action without a payload", () => {
    // Act
    const actual = action("action/a");

    // Assert
    expect(actual()).toEqual({ type: "action/a", payload: undefined });
  });

  it("should create an action with a simple payload", () => {
    // Act
    const actual = action("action/a", (id: string) => id);

    // Assert
    expect(actual("a")).toEqual({ type: "action/a", payload: "a" });
  });

  it("should create an action with an object as a payload", () => {
    // Act
    const actual = action("action/a", (id: string) => ({ id }));

    // Assert
    expect(actual("a")).toEqual({ type: "action/a", payload: { id: "a" } });
  });

  it("should create an action creator map", () => {
    // Act
    const [actions] = createActions(actionCreator => ({
      a: actionCreator("action/a"),
      b: actionCreator("action/b", (id: string) => id),
      c: actionCreator("action/c", (id: string) => ({ id }))
    }));

    // Assert
    expect(actions.a()).toEqual({ type: "action/a", payload: undefined });
    expect(actions.b("b")).toEqual({ type: "action/b", payload: "b" });
    expect(actions.c("c")).toEqual({ type: "action/c", payload: { id: "c" } });
  });
});

describe("The reducer", () => {
  const initialState = { a: 0, b: 0, c: 0 };
  const [actions, actionTypes] = createActions(actionCreator => ({
    a: actionCreator("action/a"),
    b: actionCreator("action/b", (count: number) => ({ count })),
    c: actionCreator("action/c", (x: number, y: number) => ({ x, y }))
  }));
  type TestActions = CreateActionType<typeof actions>;

  it("should initialize the state if it was undefined", () => {
    // Arrange
    const count = makeLeafReducer<TestActions>()(initialState, {});
    const reducer = makeRootReducer({ count }, { test: () => 1 });

    // Act
    const actual = reducer(undefined, actions.a());

    // Assert
    expect(actual.count).toBe(initialState);
  });

  it("should not mutate the state", () => {
    // Arrange
    const count = makeLeafReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      }
    });
    const reducer = makeRootReducer({ count });

    // Act
    const actual = reducer(undefined, actions.a());

    // Assert
    expect(actual.count === initialState).toBe(false);
    expect(actual.count).toEqual({ ...initialState, a: 1 });
  });

  it("should not handle an action if it has no handler defined for it", () => {
    // Arrange
    const count = makeLeafReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      }
    });
    const reducer = makeRootReducer({ count }, { x: () => 10 });

    // Act
    const temp = reducer(undefined, actions.a());
    const actual = reducer(temp, actions.b(10));

    // Assert
    expect(actual.count === initialState).toBe(false);
    expect(actual.count).toBe(temp.count);
    expect(actual.count).toEqual({ ...initialState, a: 1 });
  });

  it("should forward action payloads to the reducer functions", () => {
    // Arrange
    const count = makeLeafReducer<TestActions>()(initialState, {
      [actionTypes.b]: (state, { count }) => {
        state.b += count;
      }
    });
    const reducer = makeRootReducer({ count });

    // Act
    const actual = reducer(undefined, actions.b(10));

    // Assert
    expect(actual.count === initialState).toBe(false);
    expect(actual.count).toEqual({ ...initialState, b: 10 });
  });

  it("should handle actions dispatched in sequence", () => {
    // Arrange
    const count = makeLeafReducer<TestActions>()(initialState, {
      [actionTypes.a]: state => {
        state.a += 1;
      },
      [actionTypes.b]: (state, { count }) => {
        state.b += count;
      },
      [actionTypes.c]: (state, { x, y }) => {
        state.c += x + y;
      }
    });
    const reducer = makeRootReducer({ count });

    // Act
    const a = reducer(undefined, actions.a());
    const b = reducer(a, actions.b(10));
    const actual = reducer(b, actions.c(2, 3));

    // Assert
    expect(a.count === b.count).toBe(false);
    expect(b.count === actual.count).toBe(false);
    expect(actual.count === initialState).toBe(false);
    expect(actual.count).toEqual({ a: 1, b: 10, c: 5 });
  });
});

describe("The epics", () => {
  const initialState = { value: 0 };
  const [actions, actionTypes] = createActions(actionCreator => ({
    trigger: actionCreator("trigger"),
    increment: actionCreator("increment"),
  }));
  type TestActions = CreateActionType<typeof actions>;

  function createTestStore() {
    const count = makeLeafReducer<TestActions>()(initialState, {
      [actionTypes.increment]: state => {
        state.value += 1;
      },
    });
    const reducer = makeRootReducer({ count });
    const handleAsync = handleAsyncFactory<TestActions, ReturnType<typeof reducer>>();
    const handleTrigger = handleAsync(actionTypes.trigger, actions$ => actions$.pipe(switchMap(() => [actions.increment()])))
    const triggerEpic = createEpic(handleTrigger);
    const epic = combineEpics(triggerEpic);
    const { epicMiddleware, runMiddleware } = createEpicMiddleware();
    const store = createStore(reducer, applyMiddleware(epicMiddleware));
    store.dispatch({ type: "INIT" } as any);
    runMiddleware(epic as any);
    return store;
  }

  it("should set up a test store correctly", () => {
    const store = createTestStore();
    expect(store.getState()).toEqual({ count: { value: 0 }})
  });

  it("should update after an epic-dispatched event", () => {
    const store = createTestStore();
    store.dispatch(actions.trigger());
    expect(store.getState()).toEqual({ count: { value: 1 } });
  });

  it("should stop listening to epic changes after EPIC_END", () => {
    const store = createTestStore();
    store.dispatch({ type: EPIC_END } as any);
    store.dispatch(actions.trigger());
    expect(store.getState()).toEqual({ count: { value: 0 } });
  });
});
